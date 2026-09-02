-- ---------------------------------------------------------------------------
-- Conserta a migration 20260902194500, que nao teve efeito nenhum.
--
-- Ela revogava EXECUTE de anon e authenticated, mas o grant que realmente
-- publicava essas funcoes em /rest/v1/rpc/ e o EXECUTE padrao para PUBLIC, que
-- todo role herda. Revogar de um role especifico nao remove um grant de
-- PUBLIC, entao has_function_privilege('anon', ...) continuava true e os lints
-- 0028/0029 seguiam validos.
--
-- Conferido no banco: com o revoke de PUBLIC em vigor,
-- has_function_privilege da false para anon e authenticated, e um insert em
-- propostas continua recebendo numero e versao do trigger — disparo de trigger
-- nao depende de EXECUTE.
-- ---------------------------------------------------------------------------

revoke execute on function public.propostas_definir_numero() from public, anon, authenticated;
revoke execute on function public.atividades_tocar_negocio() from public, anon, authenticated;
