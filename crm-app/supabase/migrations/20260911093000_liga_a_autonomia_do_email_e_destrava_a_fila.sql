-- ---------------------------------------------------------------------------
-- Liga o envio automatico de e-mail e solta o que ficou parado na fila.
--
-- As duas migrations anteriores montaram o mecanismo (o freio de 50/dia em
-- horario comercial, e o WhatsApp sempre na mao). Esta aqui e a que muda o
-- comportamento de verdade -- e a ordem importa: se ela viesse antes do freio,
-- a fila inteira sairia numa rodada de cinco minutos.
--
-- ---------------------------------------------------------------------------
-- PARTE 1: `autonoma` nas cadencias ativas.
--
-- Depois da migration anterior, `autonoma` quer dizer "o e-mail sai sozinho" --
-- o WhatsApp ja nao obedece mais a ela. E o mesmo botao "Autonoma / Com
-- aprovacao" que ja existe no admin, entao continua sendo possivel desligar
-- pela tela, por cadencia, sem mexer em codigo.
--
-- PARTE 2: as 14 mensagens paradas.
--
-- Ligar a autonomia sozinha NAO destravaria essas 14. `processar_cadencias`
-- pula a inscricao enquanto houver mensagem dela em 'aguardando_aprovacao', e
-- essas 14 sao justamente isso: e-mails do passo 3 escritos ontem, sob a regra
-- antiga, esperando um clique que nunca veio. Medido: 18 das 60 inscricoes
-- ativas estao travadas, 14 por e-mail e 4 por WhatsApp.
--
-- Sem soltar as 14, aqueles 14 leads ficariam congelados para sempre e o
-- "automatico" nao valeria para eles.
--
-- So os E-MAILS sao soltos. Os 4 WhatsApp parados continuam onde estao: sao
-- tarefa de mao, e solta-los seria fazer exatamente o que se pediu para nao
-- fazer. `and not envio_manual` e o que garante isso.
--
-- Elas NAO saem todas juntas: nascem 'aprovada' com `agendada_para` no passado,
-- entram na fila e `email_folga` as libera no ritmo do dia -- uma a cada ~10
-- minutos, dentro do horario comercial. Sao 14, entao levam cerca de duas horas
-- e meia para escoar, e consomem 14 das 50 do dia.
--
-- `aprovada_por` fica nulo de proposito: ninguem aprovou. E o mesmo que
-- `processar_cadencias` grava quando a cadencia e autonoma.
-- ---------------------------------------------------------------------------

update public.cadencias
   set autonoma = true
 where ativa;

update public.mensagens
   set status = 'aprovada'
 where status = 'aguardando_aprovacao'
   and canal = 'email'
   and not envio_manual;
