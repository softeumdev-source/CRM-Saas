-- ---------------------------------------------------------------------------
-- "No-show" vira coluna própria no funil de Prospecção.
--
-- Quem não compareceu à reunião já voltava para o SDR e já era inscrito na
-- cadência de remarcação — o que faltava era ONDE ele cai.
--
-- ---------------------------------------------------------------------------
-- O QUE JÁ EXISTE, E QUE ESTA MIGRATION APENAS APONTA PARA O LUGAR CERTO.
--
-- `inscrever_ao_chegar_na_prospeccao()` já faz, hoje:
--
--     elsif v_funcao = 'retorno' then
--       if not exists (... atividades onde compareceu is false ...) then
--         return new;
--       end if;
--       v_proposito := 'no_show';
--
-- Ou seja: negócio que chega numa etapa com `funcao = 'retorno'` do funil do
-- SDR, tendo uma reunião com `compareceu = false` nos últimos 30 dias, entra
-- sozinho na cadência de propósito `no_show`. Essa cadência existe, está ativa
-- e tem três toques ("não consegui te encontrar" → WhatsApp "remarcamos?" →
-- "deixo para outro momento?"). Ela nunca rodou: 0 inscrições.
--
-- O motivo de nunca ter rodado não é o mecanismo — é o destino. `funcao =
-- 'retorno'` está em "Qualificação", que é também a coluna do trabalho normal
-- do SDR. O no-show caía lá dentro, misturado com lead que nunca teve reunião,
-- e ninguém conseguia olhar "quem me deu bolo" como uma fila.
--
-- Esta migration move o marcador `retorno` para uma coluna nova. Nada no código
-- muda: `NegocioDetailClient` acha o destino por `etapaComFuncao(etapas,
-- "retorno")`, nunca pelo nome. O mesmo vale para o gatilho acima.
--
-- ---------------------------------------------------------------------------
-- A ARMADILHA DA `ordem`, DE NOVO.
--
-- A entrega SDR → Vendas casa a etapa de destino POR `ordem`: a etapa `entrega`
-- do SDR é a ordem 3, e a ordem 3 de Vendas é "Demonstração Agendada". Por isso
-- "No-show" entra na ordem 4 e só o que vem DEPOIS da 3 é renumerado. O bloco
-- de verificação no fim aborta se esse casamento deixar de valer.
--
-- ---------------------------------------------------------------------------
-- A ORDEM DAS OPERAÇÕES NÃO É ESTILO.
--
-- Existe `unique (pipeline_id, funcao) where funcao is not null`
-- (`etapas_pipeline_funcao_unica`). Se a etapa nova nascesse já com
-- `funcao = 'retorno'` enquanto "Qualificação" ainda tem o dela, o índice
-- recusaria o insert. Por isso: limpa a antiga, insere a nova, marca a nova.
-- ---------------------------------------------------------------------------

do $$
declare
  v_sdr uuid;
  v_tenant uuid;
  v_ordem_entrega int;
  v_nova uuid;
  v_qualificacao uuid;
  v_com_retorno int;
  v_duplicadas int;
begin
  select id into v_sdr from public.pipelines where chave = 'sdr' limit 1;
  if v_sdr is null then
    raise exception 'Funil de prospeccao (sdr) nao encontrado.';
  end if;

  if exists (
    select 1 from public.etapas_pipeline where pipeline_id = v_sdr and nome = 'No-show'
  ) then
    raise notice 'A coluna "No-show" ja existe; nada a fazer.';
    return;
  end if;

  select tenant_id, ordem into v_tenant, v_ordem_entrega
    from public.etapas_pipeline
   where pipeline_id = v_sdr and funcao = 'entrega'
   limit 1;

  if v_ordem_entrega is null then
    raise exception 'O funil do SDR nao tem etapa de entrega — a coluna nova nao tem onde se ancorar.';
  end if;

  select id into v_qualificacao
    from public.etapas_pipeline
   where pipeline_id = v_sdr and funcao = 'retorno'
   limit 1;

  -- 1) Solta o marcador antes de qualquer coisa (ver a nota sobre o indice).
  update public.etapas_pipeline set funcao = null where id = v_qualificacao;

  -- 2) Abre espaco depois da entrega.
  update public.etapas_pipeline
     set ordem = ordem + 1
   where pipeline_id = v_sdr and ordem > v_ordem_entrega;

  -- 3) A coluna nova, logo apos "Demonstracao Agendada".
  --
  -- probabilidade 20: quem deu bolo vale MENOS que um lead qualificado (30) e
  -- mais que um lead novo (10) — ele ja aceitou uma reuniao uma vez.
  --
  -- cor #f97316 (laranja): as cores em uso no funil sao #64748b, #3b82f6,
  -- #6366f1, #14b8a6, #f59e0b, #a855f7, #10b981, #f43f5e e #8b5cf6. Laranja nao
  -- colide, e fica entre o ambar de "esperando" e o rosa de "perdido" — que e
  -- exatamente o que um no-show e.
  --
  -- `oculta_quando_vazia = false`: e uma fila de trabalho. Coluna que some
  -- quando zera esconderia justamente a boa noticia de nao haver bolo nenhum.
  insert into public.etapas_pipeline
    (tenant_id, pipeline_id, nome, ordem, cor, probabilidade, funcao, resultado, oculta_quando_vazia)
  values
    (v_tenant, v_sdr, 'No-show', v_ordem_entrega + 1, '#f97316', 20, null, null, false)
  returning id into v_nova;

  -- 4) Agora sim o marcador, com a antiga ja livre.
  update public.etapas_pipeline set funcao = 'retorno' where id = v_nova;

  -- ── VERIFICAÇÕES ────────────────────────────────────────────────────────

  -- a) Exatamente uma etapa de retorno, e e a nova.
  select count(*) into v_com_retorno
    from public.etapas_pipeline where pipeline_id = v_sdr and funcao = 'retorno';
  if v_com_retorno <> 1 then
    raise exception 'O funil do SDR ficou com % etapas de retorno.', v_com_retorno;
  end if;
  if (select funcao from public.etapas_pipeline where id = v_nova) is distinct from 'retorno' then
    raise exception 'A coluna "No-show" nao ficou com funcao = retorno.';
  end if;

  -- b) A entrega SDR -> Vendas continua casando por ordem.
  if (select ordem from public.etapas_pipeline where pipeline_id = v_sdr and funcao = 'entrega')
     is distinct from
     (select e.ordem from public.etapas_pipeline e
       join public.pipelines p on p.id = e.pipeline_id
      where p.chave = 'vendas' and e.nome = 'Demonstração Agendada')
  then
    raise exception 'A entrega do SDR e o destino em Vendas ficaram com ordens diferentes.';
  end if;

  -- c) Sem ordem duplicada e sem buraco.
  select count(*) into v_duplicadas from (
    select ordem from public.etapas_pipeline
     where pipeline_id = v_sdr group by ordem having count(*) > 1
  ) d;
  if v_duplicadas > 0 then
    raise exception 'O funil do SDR ficou com % ordem(ns) duplicada(s).', v_duplicadas;
  end if;

  if (select max(ordem) from public.etapas_pipeline where pipeline_id = v_sdr)
     is distinct from
     (select count(*) from public.etapas_pipeline where pipeline_id = v_sdr)
  then
    raise exception 'As ordens do funil do SDR deixaram de ser 1..n contiguas.';
  end if;

  raise notice 'Coluna "No-show" criada (%) na ordem %, com o marcador de retorno.',
    v_nova, v_ordem_entrega + 1;
end $$;
