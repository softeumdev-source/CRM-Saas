-- Derruba a versão de UM argumento de `obter_envelope_publico`.
--
-- A migration anterior acrescentou `p_ip` e `p_user_agent` COM DEFAULT achando
-- que `create or replace` substituiria a função. Não substitui: mudar a lista
-- de parâmetros cria uma SEGUNDA sobrecarga, e as duas ficaram de pé. Com as
-- duas, `obter_envelope_publico('tok')` deixa de resolver —
-- "function obter_envelope_publico(unknown) is not unique" — e essa é
-- exatamente a chamada que a página de assinatura publicada faz.
--
-- Medido, não suposto: a chamada de 1 argumento devolveu o erro de ambiguidade;
-- a de 3 argumentos passou direto. É o mesmo motivo pelo qual
-- `salvar_pdf_assinado` foi derrubada explicitamente na migration anterior —
-- ali eu lembrei do `drop`, aqui não.
--
-- Sem a sobrecarga, a chamada por nome (`{ p_token }`, que é como o PostgREST
-- manda) resolve para a função de três parâmetros e os dois novos ficam nulos:
-- a página velha continua funcionando, apenas sem gravar IP, até o deploy novo
-- entrar.

drop function if exists public.obter_envelope_publico(text);
