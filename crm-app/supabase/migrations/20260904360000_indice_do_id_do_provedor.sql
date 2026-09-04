-- O índice que torna barato reconhecer a nossa própria mensagem.
--
-- A sincronização do Gmail lê a caixa INTEIRA, Enviados incluído — é assim que
-- ela captura o e-mail que o vendedor escreveu direto no Gmail, fora do CRM.
-- O efeito colateral é que ela lê de volta o que o próprio CRM acabou de
-- mandar, e gravava uma segunda linha do mesmo e-mail no card.
--
-- POR QUE A TRAVA QUE JÁ EXISTIA NÃO PEGOU
--
-- `idempotency_key` é UNIQUE, mas as duas linhas nascem com chaves diferentes:
-- a do envio é `<inscricao>:<passo>` e a da leitura seria
-- `email:<Message-ID>`. Chaves diferentes, mesma mensagem.
--
-- E CASAR POR Message-ID TAMBÉM NÃO RESOLVERIA
--
-- Foi a primeira ideia, e ela está errada. O Gmail DESCARTA o `Message-ID` que
-- escrevemos no MIME e põe um dele. Medido na produção: o envio ficou gravado
-- como `<dc9fd0eb-…@softeum.com.br>` e a resposta do cliente voltou com
-- `In-Reply-To: <CANouC3PP…@mail.gmail.com>`. Os dois cabeçalhos nunca vão
-- bater porque um deles nunca existiu.
--
-- `provedor_id` é o id que o `messages.send` devolveu, e é o MESMO id pelo qual
-- a sincronização busca a mensagem. É a única coisa que liga as duas pontas.
--
-- POR QUE NÃO É UNIQUE
--
-- Seria tentador. Mas quem escreve esta coluna é `concluir_envio`, DEPOIS de o
-- e-mail já ter saído: uma violação ali deixaria a mensagem presa em
-- 'enviando' para sempre, com o cliente já tendo recebido. Uma linha repetida
-- é um incômodo visível; um envio preso é um lead perdido em silêncio. A
-- deduplicação fica no código, onde falhar significa apenas não pular.

create index if not exists mensagens_provedor_idx
  on public.mensagens (tenant_id, provedor_id)
  where provedor_id is not null;
