-- ---------------------------------------------------------------------------
-- propostas_definir_numero() e atividades_tocar_negocio() sao funcoes DE
-- TRIGGER, mas nasceram com o EXECUTE padrao para public — o que as publicava
-- como endpoints em /rest/v1/rpc/, chamaveis inclusive por anon (lints 0028 e
-- 0029). Nao ha exploracao direta (chamar uma funcao de trigger fora de um
-- trigger so retorna erro), mas endpoint que nao deveria existir e superficie
-- de ataque desnecessaria em funcao SECURITY DEFINER.
--
-- Disparo por trigger NAO depende de EXECUTE: o Postgres so checa esse
-- privilegio em CREATE TRIGGER, nao a cada disparo. Verificado no banco antes
-- de aplicar — com o revoke em vigor, um insert em propostas continuou
-- recebendo numero e versao do trigger normalmente.
-- ---------------------------------------------------------------------------

revoke execute on function public.propostas_definir_numero() from anon, authenticated;
revoke execute on function public.atividades_tocar_negocio() from anon, authenticated;
