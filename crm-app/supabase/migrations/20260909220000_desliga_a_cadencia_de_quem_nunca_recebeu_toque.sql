-- ---------------------------------------------------------------------------
-- Desliga a cadência dos leads que nunca receberam toque nenhum.
--
-- OPERAÇÃO DE DADOS, a pedido: "desligue a cadência de todos os contatos que
-- ainda não enviei e-mail e nem WhatsApp". Não muda schema nem regra — é uma
-- decisão comercial aplicada de uma vez.
--
-- ---------------------------------------------------------------------------
-- O QUE "NÃO ENVIEI" ERA, MEDIDO ANTES DE MEXER.
--
-- A cadência é `autonoma = false`: todo toque nasce em 'aguardando_aprovacao' e
-- espera um clique. Então "gerado" e "enviado" são coisas MUITO diferentes aqui,
-- e o número mostrou o tamanho da diferença:
--
--   e-mail    50 enviadas, 168 esperando aprovação, 1 falhou
--   WhatsApp  36 enviadas, 169 esperando aprovação
--
--   171 inscrições vivas em leads que NUNCA receberam nada
--    39 inscrições vivas em leads que já receberam algum toque
--
-- O corte é `status = 'enviada'` em mensagem de SAÍDA. 'falhou' não conta como
-- enviada: o cliente não recebeu, e é justamente o caso que precisa continuar
-- na fila de quem for retomar.
--
-- Os 39 que já receberam algo NÃO são tocados. Parar a cadência no meio de uma
-- conversa já iniciada deixaria o lead pendurado — o pedido era sobre quem
-- ainda não tinha sido abordado.
--
-- ---------------------------------------------------------------------------
-- POR QUE 'pausada' E NÃO 'cancelada'. Não é sinônimo aqui.
--
-- `inscrever_ao_chegar_na_prospeccao()` decide se reinscreve assim:
--
--     if exists (select 1 from cadencia_inscricoes i
--                 where i.negocio_id = new.id
--                   and i.status in ('ativa','pausada')) then return new;
--
-- Com 'cancelada', a inscrição sai dessa lista — e qualquer movimento que
-- levasse o card de volta para a etapa de entrada (arrastar, retomar da
-- nutrição, devolver de funil) REINSCREVERIA o lead em silêncio, ligando de
-- novo a cadência que acabou de ser desligada.
--
-- 'pausada' desliga do mesmo jeito — `processar_cadencias()` só seleciona
-- 'ativa' — e ainda BLOQUEIA a reinscrição. É o único status que faz as duas.
--
-- Nada reativa 'pausada' sozinho: conferido nas oito funções que tocam
-- `cadencia_inscricoes`.
--
-- ---------------------------------------------------------------------------
-- OS TOQUES NA FILA CAEM JUNTO.
--
-- Desligar a cadência e deixar 340 mensagens em 'aguardando_aprovacao' seria
-- desligar pela metade: o board continuaria mostrando esses leads em "Toque
-- pronto p/ enviar", com um botão que manda mensagem de uma cadência morta.
--
-- ---------------------------------------------------------------------------
-- PARA RELIGAR, se mudar de ideia:
--
--   update public.cadencia_inscricoes
--      set status = 'ativa', proximo_envio_em = now()
--    where status = 'pausada';
--
-- As mensagens canceladas não voltam — e não devem: `processar_cadencias`
-- gera o toque do passo seguinte na hora certa, com o texto do template atual.
--
-- ---------------------------------------------------------------------------
-- O RECORTE POR DATA é o que torna esta migration segura de reexecutar.
--
-- Sem ele, um `supabase db push` num banco novo pausaria cadências recém
-- criadas — o oposto do que se quer. Com ele: num banco novo nada é anterior à
-- data e o bloco não faz nada; num restore da produção as linhas já estão
-- 'pausada' e o `and ci.status = 'ativa'` também não faz nada.
-- ---------------------------------------------------------------------------

do $$
declare
  -- O instante da operação. Só inscrições ANTERIORES a isto são afetadas.
  v_corte constant timestamptz := '2026-09-09 21:25:00+00';
  v_inscricoes int;
  v_mensagens int;
begin
  create temp table alvo_desligar on commit drop as
  select ci.id as inscricao_id, ci.negocio_id
    from public.cadencia_inscricoes ci
   where ci.status in ('ativa', 'pausada')
     and ci.criado_em < v_corte
     and not exists (
       select 1 from public.mensagens m
        where m.negocio_id = ci.negocio_id
          and m.direcao = 'saida'
          and m.status = 'enviada'
     );

  update public.cadencia_inscricoes ci
     set status = 'pausada',
         proximo_envio_em = null
    from alvo_desligar a
   where ci.id = a.inscricao_id
     and ci.status = 'ativa';
  get diagnostics v_inscricoes = row_count;

  update public.mensagens m
     set status = 'cancelada',
         ultimo_erro = 'Cancelada: cadencia desligada antes do primeiro envio.'
    from alvo_desligar a
   where m.negocio_id = a.negocio_id
     and m.status = 'aguardando_aprovacao';
  get diagnostics v_mensagens = row_count;

  raise notice 'Pausadas % inscricoes e canceladas % mensagens.', v_inscricoes, v_mensagens;
end $$;
