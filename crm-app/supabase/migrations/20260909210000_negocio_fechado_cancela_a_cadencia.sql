-- ---------------------------------------------------------------------------
-- Negócio que fecha — perdido ou ganho — cancela a cadência na hora.
--
-- O MESMO FURO que a reunião agendada tinha, pela mesma razão:
-- `processar_cadencias()` seleciona por UM critério —
--
--     where i.status = 'ativa' and i.proximo_envio_em <= now() and c.ativa
--
-- — e não olha etapa nem funil. Marcar um lead como perdido só mexia em
-- `negocios`. A inscrição continuava 'ativa' e o cron continuava mandando
-- "podemos conversar 20 minutos?" para quem o CRM já tinha dado por perdido.
--
-- Isso valia para TODOS os caminhos de perda: arrastar o card até "Perdido",
-- o menu do card, o botão da tela do negócio e o gatilho novo que manda para
-- perdido quando a cadência se esgota.
--
-- ---------------------------------------------------------------------------
-- GANHO TAMBÉM, E NÃO É AMPLIAÇÃO DE ESCOPO — É A MESMA FRASE.
--
-- O pedido foi "quando um lead for perdido". A regra que resolve o pedido é
-- "negócio fechado não recebe toque de prospecção", e fechar como GANHO é o
-- outro lado exato disso: mandar um e-mail de primeiro contato para quem
-- acabou de assinar contrato é pior do que mandar para quem foi perdido.
--
-- Por isso a condição é `etapas_pipeline.resultado is not null`, que é a
-- coluna que já define "esta etapa encerra o negócio" — a mesma que
-- `resultadoDaEtapa` lê no app. Escrever `= 'perdido'` deixaria metade do
-- buraco aberto.
--
-- ---------------------------------------------------------------------------
-- 'cancelada', E AQUI ELA É A PALAVRA CERTA.
--
-- Na reunião agendada (migration 20260909160000) a inscrição vira 'concluida',
-- porque a cadência CONSEGUIU o que queria. Aqui não: ela foi interrompida no
-- meio por uma decisão de fora. 'cancelada' é o mesmo status que
-- `processar_cadencias` já grava quando o contato revoga consentimento — o
-- vocabulário do "parou por causa de algo externo" já existe e é este.
--
-- ---------------------------------------------------------------------------
-- POR QUE NÃO HÁ LAÇO INFINITO, que é a pergunta óbvia com três gatilhos
-- conversando entre si:
--
--   este gatilho          escreve em `cadencia_inscricoes` (status 'cancelada')
--   trg_cadencia_esgotada_perdido  só age quando o status vira 'concluida'
--                         → vê 'cancelada', volta na primeira linha;
--
--   trg_cadencia_esgotada_perdido  escreve em `negocios` (etapa de perda)
--   este gatilho          → dispara, mas a inscrição já está 'concluida' e o
--                         `where status in ('ativa','pausada')` não a pega.
--                         As MENSAGENS pendentes, essas ele cancela — e é
--                         justamente o que faltava naquele caminho.
--
-- E o `update` em `mensagens` não dispara envio: `mensagens_despachar_ao_aprovar`
-- só chama `disparar_despacho()` quando o status vira 'aprovada'. Conferido.
-- ---------------------------------------------------------------------------

create or replace function public.negocio_fechado_cancela_cadencia()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_resultado text;
begin
  if new.etapa_id is not distinct from old.etapa_id then
    return null;
  end if;

  select e.resultado into v_resultado
    from public.etapas_pipeline e where e.id = new.etapa_id;

  -- Etapa que não encerra o negócio: a cadência segue viva, que é o certo.
  -- Inclui a volta de "Perdido" para o funil — reabrir um negócio não
  -- ressuscita a cadência sozinho, e não deve mesmo: quem reabre decide se
  -- inscreve de novo.
  if v_resultado is null then
    return null;
  end if;

  update public.cadencia_inscricoes
     set status = 'cancelada',
         proximo_envio_em = null
   where negocio_id = new.id
     and status in ('ativa', 'pausada');

  update public.mensagens
     set status = 'cancelada',
         ultimo_erro = case
           when v_resultado = 'perdido'
             then 'Cancelada: o lead foi marcado como perdido.'
           else 'Cancelada: o negocio foi fechado como ganho.'
         end
   where negocio_id = new.id
     and status = 'aguardando_aprovacao';

  return null;
end;
$function$;

comment on function public.negocio_fechado_cancela_cadencia() is
  'Ao entrar numa etapa com `resultado` (ganho ou perdido), cancela as '
  'inscricoes de cadencia vivas e os toques em "aguardando_aprovacao". '
  'Impede que o cron continue prospectando negocio ja fechado.';

drop trigger if exists trg_negocio_fechado_cancela_cadencia on public.negocios;
create trigger trg_negocio_fechado_cancela_cadencia
  after update of etapa_id on public.negocios
  for each row
  execute function public.negocio_fechado_cancela_cadencia();

-- Funcao de gatilho nao e RPC — mesmo motivo das migrations
-- `revoga_execute_das_funcoes_de_trigger` e `gatilho_nao_e_rpc_publica`.
revoke all on function public.negocio_fechado_cancela_cadencia() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O PASSIVO. O gatilho vale de agora em diante; quem ja esta fechado com
-- cadencia viva continuaria recebendo toque. `where` em vez de lista de ids:
-- idempotente, e pega qualquer caso que apareca antes do deploy.
-- ---------------------------------------------------------------------------
do $$
declare
  v_inscricoes int;
  v_mensagens int;
  v_restantes int;
begin
  update public.cadencia_inscricoes ci
     set status = 'cancelada', proximo_envio_em = null
    from public.negocios n
    join public.etapas_pipeline e on e.id = n.etapa_id
   where ci.negocio_id = n.id
     and e.resultado is not null
     and ci.status in ('ativa', 'pausada');
  get diagnostics v_inscricoes = row_count;

  update public.mensagens m
     set status = 'cancelada',
         ultimo_erro = 'Cancelada: o negocio ja estava fechado.'
    from public.negocios n
    join public.etapas_pipeline e on e.id = n.etapa_id
   where m.negocio_id = n.id
     and e.resultado is not null
     and m.status = 'aguardando_aprovacao';
  get diagnostics v_mensagens = row_count;

  select count(*) into v_restantes
    from public.cadencia_inscricoes ci
    join public.negocios n on n.id = ci.negocio_id
    join public.etapas_pipeline e on e.id = n.etapa_id
   where e.resultado is not null and ci.status in ('ativa', 'pausada');

  if v_restantes > 0 then
    raise exception 'Ainda restam % inscricoes vivas em negocio fechado.', v_restantes;
  end if;

  raise notice 'Passivo limpo: % inscricoes e % mensagens canceladas.', v_inscricoes, v_mensagens;
end $$;
