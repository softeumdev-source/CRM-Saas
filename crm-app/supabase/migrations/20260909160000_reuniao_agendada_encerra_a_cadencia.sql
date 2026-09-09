-- ---------------------------------------------------------------------------
-- Reunião agendada encerra a cadência do lead.
--
-- A cadência de prospecção existe para conseguir UMA coisa: a reunião. Quando
-- ela acontece, a cadência cumpriu o papel e tem que parar — junto com os
-- toques que já estavam escritos esperando um clique.
--
-- ---------------------------------------------------------------------------
-- O DEFEITO QUE ISTO FECHA, e ele não é cosmético.
--
-- `processar_cadencias()` seleciona as inscrições por UM critério:
--
--     where i.status = 'ativa' and i.proximo_envio_em <= now() and c.ativa
--
-- Não há recorte de funil. `transferir_negocio_de_funil()`, que é o que leva o
-- lead do SDR para o vendedor, mexe em `negocios` e não toca em
-- `cadencia_inscricoes`. Ou seja: um lead ENTREGUE ao vendedor, com reunião
-- marcada, continuava com a inscrição 'ativa' e o cron continuava mandando
-- toque de prospecção nele — "podemos conversar 20 minutos?" para quem já tem
-- hora marcada.
--
-- O trigger `inscrever_ao_chegar_na_prospeccao` já só inscreve no funil do SDR
-- (migration 20260904400000), então a ENTRADA estava recortada. A SAÍDA não
-- estava.
--
-- ---------------------------------------------------------------------------
-- POR QUE 'concluida', E NÃO 'cancelada'.
--
-- Os dois param o cron igual — `processar_cadencias` só olha 'ativa'. A
-- diferença é o que o histórico vai dizer daqui a seis meses: 'cancelada' é o
-- que já se grava quando o contato revoga consentimento, ou seja, "esta
-- cadência foi abortada". Aqui é o contrário: ela deu certo. É o mesmo
-- vocabulário que a própria `processar_cadencias` usa ao acabarem os passos.
--
-- As MENSAGENS paradas, essas sim vão para 'cancelada': elas não aconteceram e
-- não vão acontecer.
--
-- O precedente é o ramo "o lead respondeu" da `processar_cadencias`, que faz
-- exatamente este par de updates. A diferença: lá só as de `envio_manual` são
-- canceladas, porque a inscrição para mas o lead segue no funil do SDR. Aqui o
-- lead ESTÁ SAINDO do funil, então cai o que estiver em
-- 'aguardando_aprovacao' — e-mail e WhatsApp.
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA FUNÇÃO, E NÃO DENTRO DE `transferir_negocio_de_funil`.
--
-- Aquela função serve os DOIS sentidos do corredor: a entrega SDR → vendedor e
-- a devolução do no-show vendedor → SDR. Encerrar cadência lá dentro mataria a
-- cadência de reaquecimento no exato momento em que ela deve começar.
--
-- O gatilho aqui é a REUNIÃO, não a mudança de funil. Por isso a função é
-- separada e é chamada por quem agenda.
--
-- SECURITY DEFINER com a MESMA regra de permissão de
-- `transferir_negocio_de_funil`: admin, ou dono do negócio, ou negócio sem dono
-- num funil que o seu papel opera. Sem isso, uma função definer sobre
-- `cadencia_inscricoes` deixaria qualquer autenticado parar a cadência de
-- qualquer lead do tenant.
-- ---------------------------------------------------------------------------

create or replace function public.encerrar_cadencia_por_reuniao(p_negocio_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := public.usuario_role();
  v_tenant uuid := public.usuario_tenant_id();
  v_negocio record;
  v_inscricoes int := 0;
  v_mensagens int := 0;
begin
  if v_uid is null or v_tenant is null then
    raise exception 'sem sessao';
  end if;

  select n.id, n.responsavel_id, n.pipeline_id
    into v_negocio
    from public.negocios n
   where n.id = p_negocio_id and n.tenant_id = v_tenant;
  if not found then
    raise exception 'negocio nao encontrado neste tenant';
  end if;

  if not (
    v_role = 'admin'
    or v_negocio.responsavel_id = v_uid
    or (
      v_negocio.responsavel_id is null
      and exists (
        select 1 from public.pipelines p
         where p.id = v_negocio.pipeline_id
           and p.tenant_id = v_tenant
           and p.role_operador = v_role
      )
    )
  ) then
    raise exception 'sem permissao sobre este negocio';
  end if;

  -- `proximo_envio_em = null` junto com o status: deixar a data para trás faria
  -- a inscricao parecer agendada numa tela que le a data sem olhar o status.
  update public.cadencia_inscricoes
     set status = 'concluida',
         proximo_envio_em = null
   where negocio_id = p_negocio_id
     and tenant_id = v_tenant
     and status in ('ativa', 'pausada');
  get diagnostics v_inscricoes = row_count;

  -- Os toques ja escritos. `ultimo_erro` e o campo que a tela mostra como
  -- motivo, e e por ele que alguem entende, depois, por que a mensagem nao saiu.
  update public.mensagens
     set status = 'cancelada',
         ultimo_erro = 'Cancelada: a reuniao foi agendada e a cadencia encerrou.'
   where negocio_id = p_negocio_id
     and tenant_id = v_tenant
     and status = 'aguardando_aprovacao';
  get diagnostics v_mensagens = row_count;

  return jsonb_build_object('inscricoes', v_inscricoes, 'mensagens', v_mensagens);
end;
$function$;

comment on function public.encerrar_cadencia_por_reuniao(uuid) is
  'Encerra a cadencia de um negocio porque a reuniao foi agendada: inscricoes '
  'ativas/pausadas viram "concluida" e os toques em "aguardando_aprovacao" '
  'viram "cancelada". Chamada ao agendar, nao ao mudar de funil.';

-- O padrao do repositorio para funcao definer: ninguem alem de quem esta
-- logado. `anon` executando isto pararia cadencia sem sessao — e as duas
-- migrations `revoga_execute_das_funcoes_*` existem por causa desse mesmo furo.
revoke all on function public.encerrar_cadencia_por_reuniao(uuid) from public, anon;
grant execute on function public.encerrar_cadencia_por_reuniao(uuid) to authenticated;
