-- Um e-mail pode ir em cópia, e um e-mail pode assinar sem o link do WhatsApp.
--
-- As duas colunas nascem juntas porque nasceram do mesmo pedido — medir a
-- reputação do domínio no MailReach, que manda o mesmo e-mail para 28 caixas de
-- semente e lê onde ele cai. Mas elas são INDEPENDENTES de propósito, e é bom
-- que continuem assim:
--
--   `copia` é o `Cc`. Serve para qualquer mensagem, hoje e amanhã.
--
--   `assinatura_sem_link_whatsapp` é a assinatura com um domínio linkado só (o
--   site). Amarrar uma na outra — "quem tem cópia é teste, logo perde o link" —
--   faria o dia em que alguém puser um colega em cópia num e-mail comum mudar a
--   assinatura sem ninguém ter pedido.
--
-- `reservar_mensagens` devolve `setof mensagens`, então as duas colunas chegam
-- ao despachante sozinhas, sem tocar na função.
--
-- Medido antes de aplicar, em transação revertida: o `ctid` das 14 linhas
-- existentes é IDÊNTICO depois do `alter table`. Nenhuma linha foi reescrita —
-- o Postgres guarda o default no catálogo em vez de repintar a tabela.

alter table public.mensagens
  add column copia text[],
  add column assinatura_sem_link_whatsapp boolean not null default false;

comment on column public.mensagens.copia is
  'Destinatários em Cc. O Gmail lê os destinatários dos próprios cabeçalhos do MIME que montamos, então é este array que faz a mensagem chegar neles.';

comment on column public.mensagens.assinatura_sem_link_whatsapp is
  'A assinatura sai com o WhatsApp em texto puro, sem href — só o site fica linkado. Para teste de entregabilidade, em que cada domínio linkado a mais entra na conta do filtro.';
