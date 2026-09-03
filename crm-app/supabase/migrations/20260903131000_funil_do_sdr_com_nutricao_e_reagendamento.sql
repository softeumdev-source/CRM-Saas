-- ---------------------------------------------------------------------------
-- O funil do SDR, com as duas colunas que os fluxos dele precisam.
--
-- Nenhuma etapa daqui tem `resultado = 'ganho'`. Isso e deliberado: entregar o
-- lead ao vendedor NAO e uma venda ganha. Se fosse marcada como ganho, o
-- negocio chegaria ao vendedor ja com `negocios.ganho = true` e
-- `fechado_em` preenchido — receita contada antes de existir. A entrega e uma
-- troca de funil, e fica registrada no historico de etapa e numa atividade.
--
-- `Descartado` e 'perdido' de verdade: o lead morreu, e o negocio fecha.
--
-- Os nomes das etapas fogem de propósito de "ganho" e "perdid": a funcao
-- `resultadoDaEtapa` ainda cai no nome quando `resultado` e NULL, para as
-- etapas que um admin venha a criar. Uma coluna de SDR chamada
-- "Perdido/Descartado" fecharia negocios sozinha.
--
-- Duas colunas novas:
--   negocios.retomar_em  -> a data em que o lead de "Nutricao / Futuro" volta
--                           sozinho para a fila do SDR (o cliente disse "me
--                           procure no ano que vem").
--   atividades.compareceu -> resposta do vendedor a "o cliente veio?". NULL e
--                           "ainda nao perguntei", que e diferente de "nao
--                           veio" — o no-show so existe quando alguem afirma.
-- ---------------------------------------------------------------------------

alter table public.negocios
  add column if not exists retomar_em timestamptz;

comment on column public.negocios.retomar_em is
  'Quando um lead em nutricao volta para a fila do SDR. NULL = nao esta parado esperando data.';

create index if not exists negocios_retomar_em_idx
  on public.negocios (retomar_em)
  where retomar_em is not null;

alter table public.atividades
  add column if not exists compareceu boolean;

comment on column public.atividades.compareceu is
  'Reuniao: o cliente compareceu? NULL = ninguem respondeu ainda. false = no-show, entra na fila de reagendamento do SDR.';

-- Um funil de SDR por tenant, apontando para o funil de vendas como destino
-- do handoff.
insert into public.pipelines (tenant_id, chave, nome, role_operador, pipeline_destino_id)
select v.tenant_id, 'sdr', 'Prospeccao (SDR)', 'sdr', v.id
from public.pipelines v
where v.chave = 'vendas'
on conflict (tenant_id, chave) do nothing;

insert into public.etapas_pipeline (tenant_id, pipeline_id, nome, ordem, cor, probabilidade, resultado)
select p.tenant_id, p.id, e.nome, e.ordem, e.cor, e.probabilidade, e.resultado
from public.pipelines p
cross join (values
  ('Novo Lead',          1, '#64748b',  5, null),
  ('Em Cadencia',        2, '#0ea5e9', 10, null),
  ('Respondeu',          3, '#6366f1', 25, null),
  ('Reuniao Agendada',   4, '#10b981', 45, null),
  ('Reagendar',          5, '#f59e0b', 20, null),
  ('Nutricao / Futuro',  6, '#a855f7',  5, null),
  ('Descartado',         7, '#f43f5e',  0, 'perdido')
) as e(nome, ordem, cor, probabilidade, resultado)
where p.chave = 'sdr'
  and not exists (
    select 1 from public.etapas_pipeline x
     where x.pipeline_id = p.id and x.nome = e.nome
  );
