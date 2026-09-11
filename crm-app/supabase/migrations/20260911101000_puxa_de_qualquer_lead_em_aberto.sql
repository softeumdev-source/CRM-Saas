-- ---------------------------------------------------------------------------
-- A puxada deixa de olhar so a inscricao parada e passa a olhar LEAD EM ABERTO.
--
-- A pedido: "se faltar leads para completa 50 do dia tem que pegar de leads em
-- aberto".
--
-- A versao anterior (20260911094000) so sabia REATIVAR inscricao 'pausada' na
-- etapa de entrada. Era estreito de dois jeitos: ignorava lead que nunca foi
-- inscrito em cadencia nenhuma, e ignorava etapa que nao fosse a de entrada.
--
-- ---------------------------------------------------------------------------
-- O QUE CONTA COMO "EM ABERTO", E O QUE FICA DE FORA -- DE PROPOSITO
--
-- ENTRA: negocio do funil do SDR, com e-mail, que nunca recebeu um toque de
-- verdade (chave nao liberada) e nao tem cadencia 'ativa'. Seja ele uma
-- inscricao parada (reativa) ou um lead nunca inscrito (inscreve agora).
--
-- FICA DE FORA, e cada exclusao tem motivo:
--
--   `resultado` preenchido  -- Perdido. Lead fechado nao volta por cota.
--   funcao 'entrega'        -- Demonstracao Agendada: ja converteu, mandar
--                              primeiro contato seria constrangedor.
--   funcao 'retorno'        -- No-show tem cadencia PROPRIA ('no_show'). Puxar
--                              para a de primeiro contato mandaria o argumento
--                              errado para quem ja conversou com a gente.
--   funcao 'nutricao'       -- alguem PAROU esse lead ali de proposito, para
--                              depois. Cota do dia nao desfaz decisao de gente.
--
-- Sobram, neste funil, "Novo Lead" e "Qualificacao".
--
-- ---------------------------------------------------------------------------
-- O NUMERO REAL, MEDIDO -- E A PARTE DESCONFORTAVEL
--
-- Ampliar a regra NAO aumenta a reserva hoje. Medido, etapa por etapa:
--
--     Novo Lead     145  inscricao parada, zero toque  -> ENTRA
--     Qualificacao    3  inscricao 'respondeu'/'concluida' -> nao entra, e
--                        esta certo: sao leads que JA responderam ou ja
--                        terminaram a sequencia. Puxar seria recomecar o
--                        primeiro contato com quem ja conversou.
--     nunca inscrito  0  em etapa nenhuma
--     ------------------
--     total         145, os mesmos de antes
--
-- Nao ha lead solto: os 237 contatos tem, todos, negocio, e os 207 de "Novo
-- Lead" ja passaram por cadencia. A reserva e 145 e acabou.
--
-- Entao por que mudar? Porque a regra antiga so sabia reativar inscricao
-- parada NA ETAPA DE ENTRADA. Lead importado que caia em outra etapa aberta,
-- ou cuja inscricao automatica falhe, ficaria invisivel para a cota para
-- sempre. A mudanca nao rende hoje; ela para de perder lead amanha.
--
-- A 50 por dia, e com cada lead puxado dando UM e-mail antes de parar no passo
-- de WhatsApp, isso dura cerca de tres dias. Depois, o volume de e-mail passa a
-- depender de (a) importar lead novo ou (b) limpar as tarefas de WhatsApp, que
-- e o que destrava os passos 3, 5 e 7 de quem ja esta inscrito.
--
-- Nenhuma regra de puxada resolve isso -- nao da para puxar de onde nao tem.
-- Deixo escrito aqui porque o sintoma vai aparecer como "o CRM parou de mandar
-- e-mail" e a causa nao esta no CRM.
--
-- ---------------------------------------------------------------------------
-- A TRAVA CONTINUA A MESMA: `not exists` de toque com chave nao liberada. E ela
-- que garante que o lead puxado comeca no e-mail 1, e nao no meio da sequencia.
-- Vale para os dois caminhos, o de reativar e o de inscrever.
-- ---------------------------------------------------------------------------

create or replace function public.puxar_leads_para_a_cota(p_tenant uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_limite     int;
  v_pausado    boolean;
  v_pref       record;
  v_local      timestamp;
  v_hora       time;
  v_reservados int;
  v_na_fila    int;
  v_faltam     int;
  v_puxados    int := 0;
  v_inscritos  int := 0;
  v_cad        uuid;
  v_atraso     int;
begin
  select c.limite_por_dia, c.pausado into v_limite, v_pausado
    from public.email_config c where c.tenant_id = p_tenant;
  if coalesce(v_pausado, false) then return 0; end if;
  v_limite := coalesce(v_limite, 50);

  select p.* into v_pref
    from public.preferencias_agenda p where p.tenant_id = p_tenant;
  if not found then return 0; end if;

  v_local := now() at time zone v_pref.fuso;
  v_hora  := v_local::time;

  if not (extract(isodow from v_local)::int = any(v_pref.dias_semana)) then return 0; end if;
  if v_hora < v_pref.hora_inicio or v_hora >= v_pref.hora_fim then return 0; end if;

  select count(*) into v_reservados
    from public.mensagens m
   where m.tenant_id = p_tenant
     and m.canal = 'email'
     and m.reservada_em is not null
     and (m.reservada_em at time zone v_pref.fuso)::date = v_local::date;

  select count(*) into v_na_fila
    from public.mensagens m
   where m.tenant_id = p_tenant
     and m.canal = 'email'
     and m.status in ('aprovada', 'enviando', 'aguardando_aprovacao');

  v_faltam := v_limite - v_reservados - v_na_fila;
  if v_faltam <= 0 then return 0; end if;

  -- Primeiro os que ja tem inscricao parada: reativar e mais barato e mantem o
  -- historico do lead numa linha so.
  with aberto as (
    select e.id
      from public.etapas_pipeline e
      join public.pipelines p on p.id = e.pipeline_id
     where p.role_operador = 'sdr'
       and e.resultado is null
       and coalesce(e.funcao, '') not in ('entrega', 'retorno', 'nutricao')
  ),
  candidatas as (
    select i.id
      from public.cadencia_inscricoes i
      join public.negocios n  on n.id  = i.negocio_id
      join public.contatos ct on ct.id = n.contato_id
     where i.tenant_id = p_tenant
       and i.status = 'pausada'
       and n.etapa_id in (select id from aberto)
       and coalesce(ct.email, '') <> ''
       and not exists (
         select 1 from public.mensagens m
          where m.inscricao_id = i.id
            and coalesce(m.idempotency_key, '') not like 'cancelado:%'
       )
     order by i.criado_em
     limit v_faltam
     for update skip locked
  )
  update public.cadencia_inscricoes i
     set status = 'ativa', proximo_envio_em = now()
    from candidatas c
   where i.id = c.id;

  get diagnostics v_puxados = row_count;
  v_faltam := v_faltam - v_puxados;
  if v_faltam <= 0 then return v_puxados; end if;

  -- Sobrou cota: inscreve quem nunca entrou em cadencia nenhuma.
  select c.id into v_cad
    from public.cadencias c
    join public.pipelines p on p.id = c.pipeline_id and p.role_operador = 'sdr'
   where c.proposito = 'primeiro_contato' and c.ativa and c.tenant_id = p_tenant
   order by c.criado_em limit 1;
  if v_cad is null then return v_puxados; end if;

  select cp.atraso_horas into v_atraso
    from public.cadencia_passos cp where cp.cadencia_id = v_cad order by cp.ordem limit 1;
  if v_atraso is null then return v_puxados; end if;

  with aberto as (
    select e.id
      from public.etapas_pipeline e
      join public.pipelines p on p.id = e.pipeline_id
     where p.role_operador = 'sdr'
       and e.resultado is null
       and coalesce(e.funcao, '') not in ('entrega', 'retorno', 'nutricao')
  ),
  novos as (
    select n.id as negocio_id, n.tenant_id
      from public.negocios n
      join public.contatos ct on ct.id = n.contato_id
     where n.tenant_id = p_tenant
       and n.etapa_id in (select id from aberto)
       and coalesce(ct.email, '') <> ''
       and not exists (
         select 1 from public.cadencia_inscricoes i where i.negocio_id = n.id
       )
     order by n.criado_em
     limit v_faltam
  )
  insert into public.cadencia_inscricoes (tenant_id, negocio_id, cadencia_id, proximo_envio_em)
  select nv.tenant_id, nv.negocio_id, v_cad, now() + make_interval(hours => v_atraso)
    from novos nv
  on conflict do nothing;

  get diagnostics v_inscritos = row_count;
  return v_puxados + v_inscritos;
end;
$function$;

comment on function public.puxar_leads_para_a_cota(uuid) is
  'Enche a cota de e-mail do dia com LEAD EM ABERTO do funil do SDR (etapa sem '
  'resultado, fora de entrega/retorno/nutricao) que nunca recebeu um toque: '
  'reativa a inscricao parada, e se faltar, inscreve quem nunca entrou.';

revoke execute on function public.puxar_leads_para_a_cota(uuid) from public, anon, authenticated;
