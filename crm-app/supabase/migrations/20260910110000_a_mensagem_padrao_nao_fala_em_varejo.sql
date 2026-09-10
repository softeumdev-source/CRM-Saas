-- ---------------------------------------------------------------------------
-- A mensagem padrão não fala em varejo.
--
-- A pedido, e é literal: "todos e-mail e mensagem são padrão com foco na
-- automatização de pedidos, nunca mencionar varejo".
--
-- A palavra aparecia em DOIS modelos, sempre na mesma frase de abertura:
--
--   Prospecção 1 — apresentação            (e-mail)
--   Prospecção 1 — apresentação (WhatsApp)
--
--     "Trabalhamos com varejos e empresas em todo o território nacional,
--      e foi a nossa equipe que me passou o seu contato."
--
-- Ela recortava o público sem necessidade: quem recebe é distribuidora,
-- indústria, importadora, farmacêutica. Abrir dizendo "varejos" faz metade da
-- lista pensar que o e-mail não é para ela — e o resto da mensagem, que é
-- sobre automatizar o recebimento de pedidos, vale para todas.
--
-- ---------------------------------------------------------------------------
-- SÓ A PALAVRA SAI. NADA MAIS.
--
-- A instrução anterior sobre estes dois modelos foi "NÃO MUDE A MENSAGEM
-- INICIAL", e ela continua valendo para todo o resto. Então este `update` não
-- reescreve a frase, não melhora o texto e não mexe em pontuação: troca
-- exatamente "com varejos e empresas" por "com empresas", e para por aí.
--
-- `replace` sobre a string exata, e não um texto novo colado por cima, é o que
-- garante isso — se o modelo tiver sido editado pela tela nesse meio-tempo, a
-- edição sobrevive.
--
-- ---------------------------------------------------------------------------
-- O QUE JÁ FOI, JÁ FOI — E O QUE AINDA NÃO FOI, MUDA AGORA.
--
--   40 e-mails e 37 WhatsApp já saíram com a palavra. Não há como voltar.
--
--   340 toques estão 'cancelada' com o texto antigo, e ESSES não são um
--   problema: a migration 20260910100000 liberou a chave de idempotência
--   deles, então serão reescritos do zero a partir do modelo quando a cadência
--   for religada. Ou seja, os 165 leads que estão parados esperando religar
--   vão receber já o texto novo.
-- ---------------------------------------------------------------------------

do $$
declare
  v_modelos int;
  v_restam int;
begin
  update public.templates_mensagem
     set corpo = replace(corpo, 'com varejos e empresas', 'com empresas')
   where corpo like '%com varejos e empresas%';
  get diagnostics v_modelos = row_count;

  select count(*) into v_restam
    from public.templates_mensagem
   where corpo ilike '%varej%' or coalesce(assunto, '') ilike '%varej%';

  if v_restam > 0 then
    raise exception 'Ainda ha % modelos falando em varejo.', v_restam;
  end if;

  raise notice 'Modelos corrigidos: %.', v_modelos;
end $$;
