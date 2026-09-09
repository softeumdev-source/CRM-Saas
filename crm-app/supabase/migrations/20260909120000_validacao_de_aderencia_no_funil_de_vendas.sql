-- ---------------------------------------------------------------------------
-- "Validação de Aderência" entra no funil de Vendas, logo depois de
-- "Demonstração Agendada".
--
-- O DEGRAU QUE FALTAVA. Hoje o vendedor vai de "Demonstração Agendada" (ordem
-- 3) direto para "Proposta Enviada" (ordem 4). Entre uma coisa e outra existe
-- um trabalho real que não tinha coluna: conferir se o que o cliente precisa é
-- o que o produto faz. Sem etapa própria, esse tempo ficava contabilizado como
-- "demonstração agendada" — o card parecia parado numa reunião que já
-- aconteceu.
--
-- ---------------------------------------------------------------------------
-- A ARMADILHA, E POR QUE ESTA MIGRATION É ESCRITA ASSIM.
--
-- A entrega SDR → vendedor casa a etapa de destino POR `ordem`, não por nome:
-- `destinoDaEntrega` (lib/pipelines.ts) procura no funil de destino a etapa de
-- MESMA ORDEM da etapa `entrega` do SDR. A etapa de entrega do SDR é a ordem 3,
-- e a ordem 3 de Vendas é "Demonstração Agendada".
--
-- Por isso a etapa nova entra na ordem 4, e NÃO na 3: inserir antes empurraria
-- "Demonstração Agendada" para a ordem 4 e a entrega do SDR passaria a
-- despejar o lead dentro de "Validação de Aderência", em silêncio. Só o que
-- vem DEPOIS da ordem 3 é renumerado, então o casamento 3 ↔ 3 continua de pé —
-- e o bloco de verificação no fim aborta a migration se isso deixar de valer.
--
-- Não há `unique (pipeline_id, ordem)` na tabela (só `etapas_pipeline_pkey`,
-- `etapas_pipeline_funcao_unica` e os dois índices de FK), então o `update`
-- pode empurrar todo mundo de uma vez sem colidir linha a linha. Mesmo assim o
-- shift roda ANTES do insert: assim a ordem 4 está livre quando a linha nova
-- chega, e não existe instante em que duas etapas dividam a mesma posição.
--
-- `funcao` fica NULL de propósito. As quatro funções ('entrada', 'retorno',
-- 'nutricao', 'entrega') são únicas por funil (`etapas_pipeline_funcao_unica`)
-- e todas já têm dona em Vendas ou não se aplicam: esta é uma coluna de
-- trabalho, não um ponto de passagem entre funis. `resultado` também fica NULL
-- — ela não fecha o negócio.
--
-- SÓ VENDAS. O funil do SDR termina no agendamento (migration 20260903210250);
-- validar aderência é conversa de vendedor, depois da demonstração. Mexer no
-- SDR aqui quebraria o casamento por ordem que o parágrafo acima protege.
-- ---------------------------------------------------------------------------

do $$
declare
  v_vendas uuid;
  v_tenant uuid;
  v_ordem_demo int;
  v_ordem_sdr_entrega int;
  v_nova uuid;
  v_duplicadas int;
begin
  select id into v_vendas from public.pipelines where chave = 'vendas' limit 1;
  if v_vendas is null then
    raise exception 'Funil de vendas não encontrado.';
  end if;

  -- O tenant sai da própria etapa vizinha, e não de um `select` solto em
  -- `tenants`: num banco com mais de um tenant, pegar "o primeiro" criaria a
  -- coluna no tenant errado — e a RLS (`etapas_select`: tenant_id =
  -- usuario_tenant_id()) a esconderia de todo mundo, sem erro nenhum.
  select tenant_id, ordem into v_tenant, v_ordem_demo
    from public.etapas_pipeline
   where pipeline_id = v_vendas and nome = 'Demonstração Agendada'
   limit 1;

  if v_ordem_demo is null then
    raise exception 'Não achei "Demonstração Agendada" no funil de vendas — a etapa nova não tem onde se ancorar.';
  end if;

  -- Idempotência: rodar duas vezes não cria duas colunas nem renumera de novo.
  if exists (
    select 1 from public.etapas_pipeline
     where pipeline_id = v_vendas and nome = 'Validação de Aderência'
  ) then
    raise notice '"Validação de Aderência" já existe no funil de vendas; nada a fazer.';
    return;
  end if;

  -- 1) Abre espaço: tudo que vem depois da demonstração desce uma casa.
  update public.etapas_pipeline
     set ordem = ordem + 1
   where pipeline_id = v_vendas
     and ordem > v_ordem_demo;

  -- 2) A etapa nova, na casa que acabou de vagar.
  --
  -- probabilidade 60: entre os 50 de "Demonstração Agendada" e os 70 de
  -- "Proposta Enviada". Não é enfeite — `moverEtapa` grava a probabilidade da
  -- etapa de destino no negócio, e é dela que sai o valor ponderado do funil.
  --
  -- cor #14b8a6 (teal): as oito cores em uso são #64748b, #3b82f6, #6366f1,
  -- #f59e0b, #a855f7, #10b981, #f43f5e e #8b5cf6. Teal não colide com nenhuma
  -- e não é o verde de "ganho" (#10b981) nem o rosa de "perdido" (#f43f5e),
  -- que são os dois que carregam significado.
  insert into public.etapas_pipeline
    (tenant_id, pipeline_id, nome, ordem, cor, probabilidade, funcao, resultado, oculta_quando_vazia)
  values
    (v_tenant, v_vendas, 'Validação de Aderência', v_ordem_demo + 1, '#14b8a6', 60, null, null, false)
  returning id into v_nova;

  -- ─────────────────────────────────────────────────────────────────────────
  -- AS VERIFICAÇÕES. Cada uma protege uma coisa que quebraria em silêncio.
  -- ─────────────────────────────────────────────────────────────────────────

  -- a) A entrega SDR → Vendas continua casando por ordem. Se esta falhar, o
  --    lead entregue pelo SDR cairia na coluna errada do vendedor.
  select ordem into v_ordem_sdr_entrega
    from public.etapas_pipeline e
    join public.pipelines p on p.id = e.pipeline_id
   where p.chave = 'sdr' and e.funcao = 'entrega'
   limit 1;

  if v_ordem_sdr_entrega is distinct from v_ordem_demo then
    raise exception
      'A entrega do SDR está na ordem % e "Demonstração Agendada" de Vendas na % — a entrega cairia na etapa errada.',
      v_ordem_sdr_entrega, v_ordem_demo;
  end if;

  -- b) Nenhuma ordem duplicada no funil: duas colunas na mesma casa deixam a
  --    ordem do board à mercê do plano do Postgres.
  select count(*) into v_duplicadas from (
    select ordem from public.etapas_pipeline
     where pipeline_id = v_vendas
     group by ordem having count(*) > 1
  ) d;

  if v_duplicadas > 0 then
    raise exception 'O funil de vendas ficou com % ordem(ns) duplicada(s).', v_duplicadas;
  end if;

  -- c) A sequência não tem buraco: 1..n sem pular. Um buraco não quebra o
  --    board (ele ordena, não indexa), mas quebraria a leitura de quem for
  --    inserir a PRÓXIMA etapa por ordem, que é exatamente o que esta
  --    migration está fazendo.
  if (select max(ordem) from public.etapas_pipeline where pipeline_id = v_vendas)
     is distinct from
     (select count(*) from public.etapas_pipeline where pipeline_id = v_vendas)
  then
    raise exception 'As ordens do funil de vendas deixaram de ser 1..n contíguas.';
  end if;

  raise notice 'Criada "Validação de Aderência" (%) na ordem % do funil de vendas.',
    v_nova, v_ordem_demo + 1;
end $$;
