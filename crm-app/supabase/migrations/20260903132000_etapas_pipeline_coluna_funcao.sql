-- ---------------------------------------------------------------------------
-- Cada etapa passa a poder declarar QUE PAPEL ela cumpre dentro do funil.
--
-- Os tres fluxos do SDR precisam apontar para etapas especificas:
--
--   handoff  -> o lead entregue cai na etapa de ENTRADA do funil de vendas
--   no-show  -> o lead volta para a etapa de RETORNO do funil do SDR
--   nutricao -> o lead parado com `retomar_em` fica na etapa de NUTRICAO e
--               volta sozinho para a ENTRADA quando a data chega
--
-- Sem esta coluna, cada um desses seria "a etapa cujo nome e 'Reagendar'" —
-- exatamente a adivinhacao por nome que a Fase 3.5b tirou do projeto, e que
-- quebraria no dia em que alguem renomeasse uma coluna do board.
--
-- `resultado` diz o que a etapa significa para o negocio (ganho/perdido);
-- `funcao` diz o que ela significa para o FLUXO. Sao perguntas diferentes e
-- por isso sao duas colunas.
-- ---------------------------------------------------------------------------

alter table public.etapas_pipeline
  add column if not exists funcao text
  check (funcao in ('entrada', 'retorno', 'nutricao'));

comment on column public.etapas_pipeline.funcao is
  'Papel da etapa no fluxo: entrada (onde o lead chega), retorno (no-show volta pra ca), nutricao (parado esperando retomar_em). NULL = etapa comum.';

create unique index if not exists etapas_pipeline_funcao_unica
  on public.etapas_pipeline (pipeline_id, funcao)
  where funcao is not null;

update public.etapas_pipeline e
set funcao = 'entrada'
from public.pipelines p
where p.id = e.pipeline_id and p.chave = 'vendas' and e.ordem = 1 and e.funcao is null;

update public.etapas_pipeline e
set funcao = case e.nome
  when 'Novo Lead' then 'entrada'
  when 'Reagendar' then 'retorno'
  when 'Nutricao / Futuro' then 'nutricao'
end
from public.pipelines p
where p.id = e.pipeline_id
  and p.chave = 'sdr'
  and e.nome in ('Novo Lead', 'Reagendar', 'Nutricao / Futuro')
  and e.funcao is null;
