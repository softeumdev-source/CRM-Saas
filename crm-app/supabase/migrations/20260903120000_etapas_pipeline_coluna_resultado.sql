-- ---------------------------------------------------------------------------
-- Ganho e perda deixam de ser adivinhados pelo NOME da etapa.
--
-- Havia duas regras diferentes decidindo a mesma coisa, e as duas quebram no
-- momento em que existir uma etapa de SDR:
--
--   1. resultadoDaEtapa (lib/types.ts) marcava ganho se o nome contem "ganho"
--      e perda se contem "perdid". Uma coluna de SDR chamada
--      "Perdido/Descartado" fecharia negocios sozinha.
--   2. funilConversao (lib/metricas.ts) achava a etapa de perda com
--      `probabilidade = 0 AND ordem = max(ordem)`. Acrescentar QUALQUER etapa
--      de SDR muda o max(ordem) e o funil do vendedor se reconfigura sozinho.
--
-- A retrocarga usa EXATAMENTE o predicado antigo (o do nome), de proposito:
-- assim nenhuma etapa muda de classificacao hoje e nenhum negocios.ganho se
-- move. Conferido: as duas regras concordam nas 7 etapas atuais.
--
-- Provado rodando as duas implementacoes lado a lado com os mesmos dados:
--   - com as 7 etapas de hoje: numeros identicos;
--   - com 2 etapas de SDR somadas: a regra nova devolve os mesmos numeros do
--     funil de 7, e a antiga muda TODOS eles (Qualificacao 18->21,
--     Demonstracao 14->17, Proposta 10->13) e ainda passa a contar "Perdido"
--     como etapa do funil.
-- ---------------------------------------------------------------------------

alter table public.etapas_pipeline
  add column if not exists resultado text
  check (resultado in ('ganho', 'perdido'));

comment on column public.etapas_pipeline.resultado is
  'Ganho/perda explicito. NULL = etapa em aberto. Substitui a adivinhacao pelo nome da etapa e pelo max(ordem).';

update public.etapas_pipeline
set resultado = case
  when lower(nome) like '%ganho%'  then 'ganho'
  when lower(nome) like '%perdid%' then 'perdido'
end
where resultado is null;
