-- ============================================================================
-- Coluna vazia que ninguém usa some do kanban — mas a etapa continua viva.
-- ============================================================================
--
-- Você pediu para sumir quatro colunas: "Demonstração Agendada" do funil do
-- SDR, e "Novo Lead", "Qualificação" e "Nutrição / Futuro" do funil de Vendas.
--
-- APAGAR AS ETAPAS ESTAVA FORA DE COGITAÇÃO, por dois motivos concretos:
--
--   1. a entrega SDR → vendedor casa o destino POR `ordem`. A etapa de entrega
--      do SDR é a ordem 3, e a ordem 3 de Vendas é "Demonstração Agendada".
--      Apagar e renumerar faria o SDR entregar dentro de "Negociação /
--      Contrato", em silêncio;
--   2. há linhas de `negocio_etapa_historico` apontando para essas etapas. O
--      histórico do funil é dado do cliente, e ele não se perde.
--
-- Então a etapa continua existindo, com a mesma ordem, e o que muda é só se
-- ela APARECE no kanban.
--
-- POR QUE UMA COLUNA NO BANCO, E NÃO UMA LISTA DE NOMES NO CÓDIGO. Três das
-- quatro etapas têm um marcador semântico (`funcao`) e dariam para reconhecer
-- por ele; a "Qualificação" de Vendas não tem nenhum, e só sobraria o NOME.
-- Casar por nome quebra no dia em que alguém renomeia a coluna pela tela de
-- admin — e quebra em silêncio, voltando a mostrar a coluna sem ninguém pedir.
-- "Quais colunas este board esconde" é DADO sobre a etapa, e é aqui que ele
-- mora.
--
-- A REGRA É "ESCONDIDA QUANDO VAZIA", e não "escondida sempre": nenhum negócio
-- fica invisível. Se um card cair ali — lead novo criado no board de Vendas,
-- lead voltando da nutrição com proposta —, a coluna reaparece com ele dentro.
--
-- O filtro entra em `carregarBoard`, e NUNCA em `carregarEtapas`. Essa mesma
-- função alimenta a prop `entrega` da tela do negócio; filtrar lá derrubaria o
-- botão "Agendar e entregar ao vendedor" e mataria a entrega. É a armadilha do
-- caminho óbvio.

alter table public.etapas_pipeline
  add column if not exists oculta_quando_vazia boolean not null default false;

comment on column public.etapas_pipeline.oculta_quando_vazia is
  'Quando true, a coluna some do kanban enquanto não tiver nenhum negócio. A etapa continua existindo, com a mesma ordem, e continua selecionável dentro do card.';

do $$
declare
  v_sdr uuid;
  v_vendas uuid;
  v_marcadas int;
begin
  select id into v_sdr    from public.pipelines where chave = 'sdr'    limit 1;
  select id into v_vendas from public.pipelines where chave = 'vendas' limit 1;

  -- SDR: agendar É a entrega. O card não fica aqui, ele passa para o funil de
  -- Vendas no mesmo movimento — a coluna nunca teve conteúdo por desenho.
  update public.etapas_pipeline
     set oculta_quando_vazia = true
   where pipeline_id = v_sdr and funcao = 'entrega';

  -- Vendas não tem porta de entrada própria: o lead chega já qualificado, na
  -- etapa que recebe a entrega. E a nutrição voltou para o funil do SDR.
  update public.etapas_pipeline
     set oculta_quando_vazia = true
   where pipeline_id = v_vendas and funcao in ('entrada', 'nutricao');

  -- Qualificar é trabalho do SDR, inteiro. Esta etapa é a única das quatro sem
  -- `funcao` — ela não tem papel nenhum no fluxo, que é justamente o motivo de
  -- ela não precisar aparecer.
  update public.etapas_pipeline
     set oculta_quando_vazia = true
   where pipeline_id = v_vendas and funcao is null and resultado is null and nome = 'Qualificação';

  select count(*) into v_marcadas from public.etapas_pipeline where oculta_quando_vazia;

  if v_marcadas <> 4 then
    raise exception 'Esperava marcar 4 etapas; marquei %.', v_marcadas;
  end if;

  -- A etapa de entrega do SDR e a etapa de Vendas que a recebe TÊM que continuar
  -- com a mesma ordem: é por `ordem` que o destino é escolhido.
  if (select ordem from public.etapas_pipeline where pipeline_id = v_sdr and funcao = 'entrega')
     is distinct from
     (select ordem from public.etapas_pipeline where pipeline_id = v_vendas and nome = 'Demonstração Agendada')
  then
    raise exception 'A entrega do SDR e o destino em Vendas ficaram com ordens diferentes.';
  end if;

  raise notice 'Marcadas % etapas como "some quando vazia".', v_marcadas;
end $$;
