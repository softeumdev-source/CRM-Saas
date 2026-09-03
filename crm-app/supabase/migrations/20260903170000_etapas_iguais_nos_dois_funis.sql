-- Etapas iguais nos dois funis.
--
-- O SDR e o vendedor passam a ter EXATAMENTE a mesma lista de etapas, com o
-- vocabulario de vendas. O que continua diferente e o `funcao`, que e metadado
-- invisivel: diz para onde a entrega vai, para onde o no-show volta e onde o
-- lead fica parado esperando data. Assim um card entregue em "Demonstracao
-- Agendada" chega no funil do vendedor na mesma etapa, com o mesmo nome.
--
-- Vendas tem 25 negocios e 42 linhas de historico: nada aqui move card. A etapa
-- 1 so troca de nome (mesma linha, mesmo id) e entra uma etapa 8 vazia.
-- O funil SDR esta vazio (0 negocios, 0 historico), entao e reescrito no lugar.

-- 1) `entrega` e a etapa que dispara a passagem automatica para o outro funil.
alter table public.etapas_pipeline drop constraint etapas_pipeline_funcao_check;
alter table public.etapas_pipeline add constraint etapas_pipeline_funcao_check
  check (funcao = any (array['entrada', 'retorno', 'nutricao', 'entrega']));

comment on column public.etapas_pipeline.funcao is
  'Papel da etapa no FLUXO (o `resultado` diz o papel no NEGOCIO). entrada = onde o lead cai; '
  'entrega = ao chegar aqui o negocio passa sozinho para o funil de destino; '
  'retorno = para onde o no-show volta; nutricao = parada com data de retomada. '
  'Unico por funil (indice etapas_pipeline_funcao_unica).';

-- 2) Zerar `funcao` do SDR ANTES de reatribuir.
--
-- Existe `unique (pipeline_id, funcao) where funcao is not null`, e o destino
-- move `retorno` da ordem 5 para a 2 e `nutricao` da 6 para a 8. Como o indice
-- e checado linha a linha durante o UPDATE, atribuir direto colidiria com a
-- linha que ainda nao foi reescrita e a migration morreria no meio.
update public.etapas_pipeline
   set funcao = null, resultado = null
 where pipeline_id in (select id from public.pipelines where chave = 'sdr');

-- 3) O SDR recebe a lista de vendas.
update public.etapas_pipeline e
   set nome = v.nome,
       cor = v.cor,
       probabilidade = v.probabilidade,
       funcao = v.funcao,
       resultado = v.resultado
  from (values
    (1, 'Novo Lead',             '#64748b',  10, 'entrada', null),
    (2, 'Qualificação',          '#3b82f6',  30, 'retorno', null),
    (3, 'Demonstração Agendada', '#6366f1',  50, 'entrega', null),
    (4, 'Proposta Enviada',      '#f59e0b',  70, null,      null),
    (5, 'Negociação / Contrato', '#a855f7',  90, null,      null),
    (6, 'Fechado (Ganho)',       '#10b981', 100, null,      'ganho'),
    (7, 'Perdido',               '#f43f5e',   0, null,      'perdido')
  ) as v(ordem, nome, cor, probabilidade, funcao, resultado)
 where e.pipeline_id in (select id from public.pipelines where chave = 'sdr')
   and e.ordem = v.ordem;

-- 4) Vendas: a etapa 1 so troca de nome. Mesmo id, mesmos 4 cards.
update public.etapas_pipeline e
   set nome = 'Novo Lead'
 where e.pipeline_id in (select id from public.pipelines where chave = 'vendas')
   and e.ordem = 1;

-- 5) A etapa 8 entra nos DOIS funis — e o que faz as listas serem iguais.
--
-- Em Vendas ela e nova de verdade: liga a retomada automatica tambem para o
-- vendedor, porque `retomar_leads_em_nutricao()` casa nutricao com entrada
-- DO MESMO funil e ate agora so o SDR tinha o par.
insert into public.etapas_pipeline (tenant_id, pipeline_id, nome, ordem, cor, probabilidade, funcao, resultado)
select p.tenant_id, p.id, 'Nutrição / Futuro', 8, '#8b5cf6', 5, 'nutricao', null
  from public.pipelines p
 where p.chave in ('vendas', 'sdr')
   and not exists (
     select 1 from public.etapas_pipeline e
      where e.pipeline_id = p.id and e.ordem = 8
   );
