-- Função de GATILHO não é RPC. Tirar as três do alcance de quem não fez login.
--
-- O advisor de segurança do Supabase apontou: `mensagens_avisar_a_fila`,
-- `inscricao_gera_o_primeiro_toque` e `inscrever_ao_chegar_na_prospeccao` são
-- funções de gatilho -- usam `new` e `tg_op` -- e mesmo assim estavam
-- chamáveis por `anon` em `/rest/v1/rpc/<nome>`, como `security definer`.
-- Chamar direto erraria (não há `new` fora de um gatilho), mas a superfície não
-- deveria existir.
--
-- O `public` NA FRENTE NÃO É ENFEITE, e essa é a parte que quase passou batida.
-- No Postgres, `execute` de função nasce concedido a `PUBLIC`. Um
--
--     revoke execute on function ... from anon, authenticated;
--
-- não tira NADA enquanto o `PUBLIC` segurar a permissão: os dois papéis
-- continuam alcançando a função por ali. Medido em transação revertida --
-- depois desse comando, `has_function_privilege('anon', ..., 'EXECUTE')`
-- continuava `true` para as três. Sem essa asserção eu teria aplicado um
-- comando que não faz nada e chamado de endurecimento.
--
-- Revogar não desliga o gatilho: disparar gatilho não confere `execute` na
-- função, e sim o privilégio de quem criou o gatilho. Também medido, com o
-- revoke aplicado dentro da transação:
--
--   1. anon/authenticated perdem o EXECUTE ......................... ok
--   2. postgres/service_role continuam com ele (é por onde o cron vai) ok
--   3. a campainha do card ainda dispara (oráculo = `ctid`, porque
--      `now()` é o horário da TRANSAÇÃO e seria igual dos dois lados) . ok
--   4. inscrever ainda gera o primeiro toque na hora ................ ok
--   5. chegar na prospecção ainda inscreve ......................... ok

revoke execute on function public.mensagens_avisar_a_fila() from public, anon, authenticated;
revoke execute on function public.inscricao_gera_o_primeiro_toque() from public, anon, authenticated;
revoke execute on function public.inscrever_ao_chegar_na_prospeccao() from public, anon, authenticated;
