-- ---------------------------------------------------------------------------
-- Duas funcoes ficaram com search_path mutavel (lint 0011 do database linter).
-- Sem search_path fixo, quem chama a funcao controla em que schema os nomes
-- nao qualificados sao resolvidos — em processar_lembretes, que e SECURITY
-- DEFINER, isso e um vetor de escalonamento: bastaria um schema no caminho com
-- uma tabela de mesmo nome para a funcao escrever no lugar errado com os
-- privilegios do dono.
--
-- Os dois corpos ja referenciam tudo de forma qualificada (public.atividades,
-- public.notificacoes, public.negocios, public.contatos) ou usam apenas
-- builtins de pg_catalog (lower, split_part), que continua implicito mesmo com
-- search_path vazio. Entao fixar em '' nao muda comportamento.
-- ---------------------------------------------------------------------------

alter function public.processar_lembretes() set search_path = '';
alter function public.bloquear_dominios_concorrentes() set search_path = '';
