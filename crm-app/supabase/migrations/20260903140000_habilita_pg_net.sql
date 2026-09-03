-- ---------------------------------------------------------------------------
-- pg_net: o banco passa a poder fazer chamada HTTP.
--
-- Entra por dois motivos. O imediato: foi o unico jeito de exercitar o
-- PostgREST a partir do ambiente de desenvolvimento e confirmar que
-- `negocios_do_board` aceita as relacoes embutidas — a peca que subiu para
-- producao apoiada so na documentacao, sem ninguem ter batido na API de
-- verdade.
--
-- Resultado, com controle negativo para o teste valer alguma coisa:
--   select real (contato, responsavel, etapa, atividades) -> 200 []
--   select com relacao inventada                          -> 400 PGRST200
-- Ou seja, o PostgREST resolve mesmo as relacoes sobre o retorno da funcao.
--
-- O outro motivo: a Fase 5 depende dele. O agendador fica no Postgres (o plano
-- Hobby da Vercel so permite um cron por dia), e e o `pg_net` que faz o banco
-- chamar a rota do Next que despacha as mensagens.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;
