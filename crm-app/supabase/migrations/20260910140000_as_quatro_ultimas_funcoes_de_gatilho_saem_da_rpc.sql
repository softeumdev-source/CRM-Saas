-- ---------------------------------------------------------------------------
-- Fecha o buraco que sobrou de 20260902194500 / 20260902200500 / 20260905080000:
-- as quatro ultimas funcoes de gatilho ainda chamaveis em /rest/v1/rpc/.
--
-- O criterio aqui nao e "o advisor apontou", e sim uma regra do projeto que ja
-- tem tres migrations: funcao de GATILHO nao e RPC. As tres anteriores trataram
-- sete funcoes, uma de cada vez, conforme apareciam. Levantei as vinte funcoes
-- que retornam `trigger` no schema public e conferi uma a uma: dezesseis ja
-- estavam trancadas, quatro nao. Sao estas.
--
--   atividades_sincronizar_conclusao   trg_atividades_conclusao on atividades
--   etapas_pipeline_propagar_pipeline  trg_etapas_pipeline_propagar on etapas_pipeline
--   mensagens_despachar_ao_aprovar     trg_mensagens_aprovada_despacha on mensagens
--   negocios_definir_pipeline          trg_negocios_pipeline on negocios
--
-- `mensagens_despachar_ao_aprovar` entrou depois das outras, em
-- 20260908124020 (aprovar_despacha_na_hora), e por isso escapou da limpeza --
-- e e a mais incomoda das quatro, porque chama `net.http_post`. Nao da para
-- disparar despacho por ali (fora de um gatilho nao existe `new`, e a funcao
-- erra na primeira linha), mas um POST em /rest/v1/rpc/mensagens_despachar_ao_aprovar
-- sem login nao deveria nem chegar a ser tentado.
--
-- O `public` NA FRENTE E O QUE FAZ O TRABALHO -- e a licao de 20260902194500,
-- que revogou de anon/authenticated e nao teve efeito nenhum porque o EXECUTE
-- nasce concedido a PUBLIC e todo role herda dali. Medido de novo agora, em
-- transacao revertida, para nao repetir o erro de aplicar comando inocuo:
--
--   revoke ... from anon, authenticated  -> anon continuava com EXECUTE: true
--   revoke ... from public               -> anon: false, authenticated: false
--                                           service_role: true, postgres: true
--
-- Revogar NAO desliga o gatilho: disparar gatilho nao confere EXECUTE na
-- funcao. Medido, tambem em transacao revertida, pelo caminho real (papel
-- `authenticated` + claim de JWT de um usuario existente) e nao pelo superuser:
--
--   revoke em negocios_definir_pipeline, `set local role authenticated`,
--   insert em negocios com etapa_id -> pipeline_id voltou preenchido pelo
--   gatilho. Ou seja: quem perdeu o EXECUTE continua conseguindo gravar.
--
-- service_role e postgres seguem com EXECUTE -- e por onde o pg_cron passa.
-- ---------------------------------------------------------------------------

revoke execute on function public.atividades_sincronizar_conclusao() from public, anon, authenticated;
revoke execute on function public.etapas_pipeline_propagar_pipeline() from public, anon, authenticated;
revoke execute on function public.mensagens_despachar_ao_aprovar() from public, anon, authenticated;
revoke execute on function public.negocios_definir_pipeline() from public, anon, authenticated;
