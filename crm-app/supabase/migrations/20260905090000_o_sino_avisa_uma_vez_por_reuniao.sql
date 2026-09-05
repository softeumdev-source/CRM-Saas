-- Uma chave para o sino não tocar duas vezes pela mesma reunião.
--
-- O aviso de "reunião em 15 minutos" nasce de um cron que varre a agenda do
-- Google de 5 em 5 minutos. Sem desempate, a mesma reunião geraria três avisos
-- antes de começar — e três sinos para o mesmo compromisso é o jeito mais
-- rápido de ensinar alguém a ignorar o sino.
--
-- `chave` guarda `reuniao:<id do evento no Google>`, e o índice único faz o
-- `on conflict do nothing` do cron ser suficiente.
--
-- O índice é SIMPLES e não parcial, e isso é decisão medida, não descuido: com
-- `create unique index ... where chave is not null`, o `ON CONFLICT (chave)`
-- não casa com a restrição (erro 42P10) a menos que o INSERT repita o mesmo
-- predicado. Índice simples resolve porque no Postgres um NULL nunca conflita
-- com outro NULL — as notificações de cadência, que não têm chave, continuam
-- convivendo aos montes.
--
-- CONFERIDO em transação revertida, 5 asserções: as 34 notificações que já
-- existiam ficam intactas e sem chave; a mesma reunião inserida duas vezes vira
-- uma linha; reuniões diferentes viram linhas diferentes; duas notificações sem
-- chave continuam cabendo; e negócios, contatos e mensagens não se mexem.

alter table public.notificacoes add column if not exists chave text;
create unique index if not exists notificacoes_chave_unica on public.notificacoes (chave);
