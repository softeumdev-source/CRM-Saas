-- Da planilha ao Kanban de prospecção: o elo que faltava.
--
-- O BURACO
--
-- A importação de planilha existe (Admin → Leads: lê CSV/XLSX, deduplica no
-- arquivo e contra o banco, mostra prévia). Mas ela grava só em `contatos`.
-- Conferido no projeto inteiro: `NewLeadModal` era o ÚNICO lugar que criava um
-- `negocio`. Ou seja, subir 500 leads na planilha e depois clicar
-- "+ Novo Negócio" 500 vezes, redigitando tudo.
--
-- E `distribuir_leads`, a vizinha desta função, distribui para `role =
-- 'vendedor'` — não conhece o funil do SDR, não cria negócio e não inscreve em
-- cadência. Por isso o funil de prospecção tinha 0 leads: não existia caminho
-- da planilha até lá.
--
-- POR QUE UMA RPC, E NÃO INSERT PELO NAVEGADOR
--
-- São três escritas em duas tabelas que precisam combinar (negócio na etapa
-- certa do funil certo, e a inscrição na cadência certa). Feito no cliente,
-- cada uma seria um round-trip e uma chance de parar no meio — 500 leads com
-- metade inscrita. Aqui é uma transação só.
--
-- `security definer` com a checagem de papel explícita, igual a
-- `distribuir_leads`: a tela vive no Admin, e quem não é admin não passa.

create or replace function public.enviar_para_prospeccao(p_contato_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant uuid;
  v_pipeline uuid;
  v_etapa uuid;
  v_prob int;
  v_cadencia uuid;
  v_atraso int;
  v_criados int := 0;
  v_pulados int := 0;
  v_sem_email int := 0;
  v_negocio uuid;
  r record;
begin
  if public.usuario_role() <> 'admin' then
    raise exception 'apenas administradores podem enviar leads para prospeccao';
  end if;

  v_tenant := public.usuario_tenant_id();

  select e.pipeline_id, e.id, e.probabilidade
    into v_pipeline, v_etapa, v_prob
    from public.etapas_pipeline e
    join public.pipelines p on p.id = e.pipeline_id
   where p.chave = 'sdr' and p.tenant_id = v_tenant and e.funcao = 'entrada'
   order by e.ordem
   limit 1;

  if v_etapa is null then
    raise exception 'o funil de prospeccao nao tem etapa de entrada';
  end if;

  -- PRIMEIRO CONTATO, e não reaquecimento: este lead nunca falou com ninguém.
  -- É o espelho da escolha em `retomar_leads_em_nutricao()`, que prefere a de
  -- reaquecimento. Mesmo motivo para ser `order by` e não `where`: sem a de
  -- primeiro contato, cai em qualquer ativa em vez de não inscrever ninguém.
  select c.id, cp.atraso_horas
    into v_cadencia, v_atraso
    from public.cadencias c
    join public.cadencia_passos cp
      on cp.cadencia_id = c.id
     and cp.ordem = (select min(cp2.ordem) from public.cadencia_passos cp2 where cp2.cadencia_id = c.id)
   where c.pipeline_id = v_pipeline
     and c.ativa
   order by (c.proposito = 'primeiro_contato') desc, c.criado_em
   limit 1;

  for r in
    select ct.id, ct.nome, ct.empresa, ct.email
      from public.contatos ct
     where ct.id = any(p_contato_ids)
       and ct.tenant_id = v_tenant
  loop
    -- Já tem negócio aberto? Não cria um segundo. Sem esta guarda, clicar duas
    -- vezes no botão duplicaria o card e o cliente receberia a cadência em
    -- dobro — o pior desfecho possível de um erro de clique.
    if exists (
      select 1 from public.negocios n
       where n.contato_id = r.id and n.fechado_em is null
    ) then
      v_pulados := v_pulados + 1;
      continue;
    end if;

    insert into public.negocios (tenant_id, contato_id, titulo, etapa_id, responsavel_id, probabilidade)
    values (
      v_tenant,
      r.id,
      coalesce(nullif(trim(r.empresa), ''), nullif(trim(r.nome), ''), 'Lead importado'),
      v_etapa,
      -- Sem dono: o card cai no pool do funil do SDR, que é como a prospecção
      -- funciona. `negocios_select` já recorta o pool por papel.
      null,
      coalesce(v_prob, 10)
    )
    returning id into v_negocio;

    v_criados := v_criados + 1;

    -- O CARD SEMPRE NASCE; a inscrição depende de haver para onde escrever.
    --
    -- O primeiro toque da cadência é e-mail. Um contato sem e-mail geraria uma
    -- mensagem sem destino, que ia falhar no despachante e pintar de vermelho
    -- um lead que nunca teve chance. Melhor o card existir no board sem
    -- cadência — alguém completa o cadastro e inscreve — do que não existir.
    if r.email is null or trim(r.email) = '' then
      v_sem_email := v_sem_email + 1;
    elsif v_cadencia is not null then
      insert into public.cadencia_inscricoes
        (tenant_id, negocio_id, cadencia_id, inscrito_por, proximo_envio_em)
      values
        (v_tenant, v_negocio, v_cadencia, auth.uid(),
         now() + make_interval(hours => coalesce(v_atraso, 0)))
      on conflict (negocio_id, cadencia_id) do nothing;
    end if;
  end loop;

  -- Devolve o que aconteceu de VERDADE, para a tela poder contar em vez de
  -- dizer "pronto!": quantos entraram, quantos já tinham negócio, e quantos
  -- ficaram fora da cadência por falta de e-mail.
  return jsonb_build_object(
    'criados', v_criados,
    'pulados', v_pulados,
    'sem_email', v_sem_email,
    'inscritos', greatest(v_criados - v_sem_email, 0),
    'tem_cadencia', v_cadencia is not null
  );
end;
$function$;

comment on function public.enviar_para_prospeccao(uuid[]) is
  'Cria um negocio no funil do SDR (sem dono, no pool) para cada contato dado e '
  'o inscreve na cadencia de primeiro contato. Pula contato que ja tem negocio '
  'aberto. Devolve jsonb com criados/pulados/sem_email/inscritos.';

revoke all on function public.enviar_para_prospeccao(uuid[]) from public, anon;
grant execute on function public.enviar_para_prospeccao(uuid[]) to authenticated;
