-- ---------------------------------------------------------------------------
-- Se as cadencias em andamento nao enchem os 50 do dia, puxa lead novo ate
-- encher.
--
-- A pedido: "se tiver faltando lead para completa os 50 do dia ele puxa o que
-- esta disponivel no novo lead".
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA "DISPONIVEL NO NOVO LEAD", MEDIDO
--
-- A etapa "Novo Lead" da Prospeccao tem 207 negocios, e a primeira leitura
-- assusta: TODOS ja passaram por cadencia, nenhum esta solto. Mas o estado
-- deles se divide em dois, e a diferenca e tudo:
--
--     59  inscricao 'ativa'    -- em andamento, ja recebendo
--    148  inscricao 'pausada'  -- 291 mensagens, TODAS canceladas com
--                                 "cadencia desligada antes do primeiro envio"
--
-- Esses 148 nunca receberam nada. Sao a reserva -- e e dai que esta funcao
-- puxa, reativando a inscricao que ja existe em vez de criar outra (o
-- UNIQUE(negocio_id, cadencia_id) impediria a segunda de qualquer forma).
--
-- ---------------------------------------------------------------------------
-- A TRAVA QUE IMPEDE O LEAD DE ENTRAR NO MEIO DA CADENCIA
--
-- Reativar uma inscricao parada NAO pode fazer o lead receber o e-mail 3 sem
-- ter recebido o 1. Duas coisas garantem isso, e conferi as duas antes:
--
-- 1) `processar_cadencias` decide o proximo passo pelo MAIOR PASSO COM TOQUE
--    REGISTRADO, ignorando chave que comeca com 'cancelado:'
--    (20260910130000). Conferido: as 291 mensagens desses 148 tem TODAS a
--    chave liberada. Simulei a consulta do proximo passo em 5 delas: as cinco
--    dao `proximo_passo = 1`, o primeiro e-mail. O ponteiro gravado tambem e 0.
--
-- 2) Ainda assim, o `not exists` abaixo exige que a inscricao nao tenha NENHUM
--    toque de chave liberada. E cinto e suspensorio de proposito: se um dia
--    alguem pausar uma cadencia no meio, ela nao sera puxada por aqui.
--
--    Esse mesmo `not exists` tem um efeito colateral util: o lead pausado por
--    FALTA DE DADO ("contato nao tem e-mail, WhatsApp nem telefone") grava a
--    mensagem com chave liberada, entao fica de fora. Nao adianta acordar quem
--    nao tem para onde escrever.
--
-- ---------------------------------------------------------------------------
-- A CONTA
--
--     faltam = limite_do_dia - reservados_hoje - o que ja esta na fila
--
-- `na fila` inclui 'aguardando_aprovacao' de proposito: uma mensagem esperando
-- clique ainda vai ocupar cota quando sair, e nao contar com ela puxaria lead
-- demais.
--
-- Puxar NAO e enviar. O lead reativado gera o toque na hora (o passo 1 tem
-- atraso 0), mas quem decide quando ele SAI continua sendo `email_folga`, no
-- ritmo do expediente. Puxar 36 de manha nao manda 36 de manha: manda um a
-- cada ~10 minutos, como o resto.
--
-- Fora do horario comercial a funcao devolve 0 sem tocar em nada -- nao adianta
-- encher a fila as 3h da manha, e encher so faria o board mentir a noite toda.
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

  with entrada as (
    select e.id
      from public.etapas_pipeline e
      join public.pipelines p on p.id = e.pipeline_id
     where e.funcao = 'entrada' and p.role_operador = 'sdr'
  ),
  candidatas as (
    select i.id
      from public.cadencia_inscricoes i
      join public.negocios n  on n.id  = i.negocio_id
      join public.contatos ct on ct.id = n.contato_id
     where i.tenant_id = p_tenant
       and i.status = 'pausada'
       and n.etapa_id in (select id from entrada)
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
  return v_puxados;
end;
$function$;

comment on function public.puxar_leads_para_a_cota(uuid) is
  'Reativa inscricoes paradas da etapa de entrada do SDR, sem nenhum toque '
  'enviado, ate a cota de e-mail do dia ficar cheia. Devolve quantas puxou.';

revoke execute on function public.puxar_leads_para_a_cota(uuid) from public, anon, authenticated;

-- Roda para todo tenant. Existe um; o `for` e para nao precisar mexer aqui
-- quando houver dois.
create or replace function public.puxar_leads_para_a_cota()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  t record;
  v_total int := 0;
begin
  for t in select id from public.tenants loop
    v_total := v_total + public.puxar_leads_para_a_cota(t.id);
  end loop;
  return v_total;
end;
$function$;

revoke execute on function public.puxar_leads_para_a_cota() from public, anon, authenticated;

-- De 5 em 5 minutos, no minuto 1 -- antes do despacho (minuto 2) para que o
-- lead puxado ja tenha o toque escrito quando o despachante passar.
select cron.unschedule('puxar-leads-para-a-cota')
 where exists (select 1 from cron.job where jobname = 'puxar-leads-para-a-cota');

select cron.schedule('puxar-leads-para-a-cota', '1-59/5 * * * *',
                     'select public.puxar_leads_para_a_cota();');
