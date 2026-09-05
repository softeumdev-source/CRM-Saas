-- ============================================================================
-- Aprovar um e-mail apaga o aviso do card na hora, em todas as telas abertas.
-- ============================================================================
--
-- O DEFEITO, e ele era meu. Eu escrevi em comentário de código que "aprovar
-- apaga o aviso do card sem F5". Não apagava. O board assina Realtime de
-- `negocios` e `contatos`; aprovar é um UPDATE em `mensagens`, e não havia nada
-- ligando as duas tabelas. O aviso âmbar só sumia na recarga periódica de
-- segurança — até 45 segundos depois, ou ao voltar para a aba.
--
-- A METADE MAIS CARA ERA A OUTRA. O mesmo buraco atrasava o aviso APARECER:
-- `processar_cadencias` roda de 5 em 5 minutos e cria o toque já escrito, e o
-- board só ficava sabendo no próximo tique de 45s. Quem estava olhando a tela
-- via a fila crescer com atraso, sem entender por quê.
--
-- POR QUE NÃO ASSINAR `mensagens` DIRETO NO BOARD. Seria uma linha de
-- TypeScript, e foi o primeiro caminho que eu tentei. Mas `mensagens` não tem
-- recorte de funil: o board do SDR passaria a recarregar a cada tique de
-- mensagem do funil de Vendas, e vice-versa. A RLS já limita ao que a pessoa
-- enxerga, então não é vazamento — é trabalho jogado fora, e ele cresce com o
-- volume de mensagens, que é justamente o que a cadência existe para aumentar.
--
-- ESTE CAMINHO JÁ EXISTIA NO PROJETO, e é o argumento decisivo:
-- `mensagens_sinalizar_resposta` faz exatamente isto desde que a entrada de
-- e-mail foi construída — mensagem de ENTRADA toca `negocios`, e o canal do
-- board (que É recortado por funil) carrega a notícia. É por isso que o selo
-- azul de "o cliente respondeu" sempre funcionou em tempo real e o âmbar não.
-- Aqui a mesma ponte passa a valer para a FILA.
--
-- ----------------------------------------------------------------------------
-- O QUE FOI CONFERIDO ANTES DE TOCAR EM `negocios`
--
-- Um UPDATE a mais numa tabela com cinco gatilhos não é de graça. Os cinco:
--
--   · trg_neh_update é `AFTER UPDATE` SEM `OF` e SEM `WHEN` — dispara em TODA
--     atualização. Era o risco real: se `negocio_etapa_historico_registrar`
--     inserisse sem guarda, cada e-mail aprovado viraria uma linha falsa no
--     histórico do funil, que é o que o relatório do admin lê. Ele guarda:
--     `if tg_op = 'UPDATE' and new.etapa_id is distinct from old.etapa_id`.
--   · trg_negocios_fechado_em é `BEFORE UPDATE` sem escopo, mas guardado por
--     `if new.ganho is distinct from old.ganho`.
--   · trg_negocios_pipeline e trg_negocios_inscrever_cadencia são `OF etapa_id`
--     — não disparam. (O segundo é o que inscreve na cadência ao chegar em
--     prospecção; dispará-lo por engano reinscreveria leads.)
--   · trg_neh_insert é só INSERT.
--
-- E `negocios_do_board` ordena por `ultima_atividade_em` e `criado_em`, NUNCA
-- por `atualizado_em` — então aprovar não faz o card pular de lugar na coluna.
-- Um board que se reordena sozinho a cada clique seria pior do que o aviso
-- velho.
--
-- `atualizado_em` também não aparece em tela nenhuma: sete lugares no app o
-- ESCREVEM, nenhum o lê. É campainha, não informação.
--
-- SEM CICLO: a função escreve em `negocios`, e nenhum gatilho de `negocios`
-- escreve em `mensagens`.
--
-- ----------------------------------------------------------------------------
-- O RECORTE DOS GATILHOS
--
-- Três, e não um sem `WHEN`, porque só interessa a mudança que altera A FILA:
--
--   · nasce uma mensagem já esperando aprovação      → o aviso tem que acender;
--   · uma mensagem entra ou sai de 'aguardando_aprovacao' → acende ou apaga;
--   · uma mensagem que esperava aprovação é apagada  → apaga.
--
-- Editar o texto antes de aprovar (`salvarTextoDaMensagem`), ou o despachante
-- carimbando `enviada_em` numa mensagem já aprovada, NÃO mexem na fila e não
-- disparam nada.

create or replace function public.mensagens_avisar_a_fila()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_negocio uuid;
begin
  -- `security definer` pelo mesmo motivo de `mensagens_sinalizar_resposta`:
  -- quem insere o toque é o cron (`processar_cadencias`), que não tem sessão.
  v_negocio := case when tg_op = 'DELETE' then old.negocio_id else new.negocio_id end;
  if v_negocio is null then
    return null;
  end if;

  -- Só a campainha. Nenhuma outra coluna é tocada de propósito: mexer em
  -- `ultima_atividade_em` reordenaria a coluna do board, e mexer em
  -- `respostas_nao_lidas` misturaria a fila NOSSA com a espera do CLIENTE.
  update public.negocios set atualizado_em = now() where id = v_negocio;
  return null;
end;
$$;

comment on function public.mensagens_avisar_a_fila() is
  'Toca `negocios.atualizado_em` quando a fila de aprovação de um negócio muda, para o Realtime do board (que assina `negocios`) apagar ou acender o aviso do card na hora.';

drop trigger if exists trg_mensagens_fila_entrou   on public.mensagens;
drop trigger if exists trg_mensagens_fila_mudou    on public.mensagens;
drop trigger if exists trg_mensagens_fila_apagada  on public.mensagens;

create trigger trg_mensagens_fila_entrou
  after insert on public.mensagens
  for each row
  when (new.status = 'aguardando_aprovacao' and new.negocio_id is not null)
  execute function public.mensagens_avisar_a_fila();

create trigger trg_mensagens_fila_mudou
  after update of status on public.mensagens
  for each row
  when (
    old.status is distinct from new.status
    and 'aguardando_aprovacao' in (old.status, new.status)
    and new.negocio_id is not null
  )
  execute function public.mensagens_avisar_a_fila();

create trigger trg_mensagens_fila_apagada
  after delete on public.mensagens
  for each row
  when (old.status = 'aguardando_aprovacao' and old.negocio_id is not null)
  execute function public.mensagens_avisar_a_fila();
