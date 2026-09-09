-- ---------------------------------------------------------------------------
-- Mover o lead para "Qualificação" encerra a cadência.
--
-- Qualificar quer dizer que ALGUÉM JÁ FALOU com o lead. A cadência existe para
-- conseguir essa conversa; conseguida, ela não tem mais o que fazer — e
-- continuar mandando "podemos conversar 20 minutos?" para quem já conversou é
-- o mesmo defeito que a reunião agendada e o lead perdido já corrigiram.
--
-- Medido agora: 2 dos 3 leads em "Qualificação" do funil do SDR estavam com
-- inscrição viva.
--
-- ---------------------------------------------------------------------------
-- UMA COLUNA, E NÃO O NOME DA ETAPA.
--
-- O caminho curto seria `if nova_etapa.nome = 'Qualificação'`. O próprio
-- repositório já explicou por que isso é ruim, na migration que criou
-- `oculta_quando_vazia`:
--
--     "Casar por nome quebra no dia em que alguém renomeia a coluna pela tela
--      de admin — e quebra em silêncio, voltando a mostrar a coluna sem
--      ninguém pedir."
--
-- Aqui seria pior que voltar a mostrar uma coluna: a cadência voltaria a
-- disparar sozinha em cima de lead já qualificado, e ninguém perceberia até um
-- cliente reclamar. Então "esta etapa encerra a cadência" vira DADO da etapa,
-- do mesmo jeito que `resultado` e `funcao` já são.
--
-- De quebra, marcar outra etapa no futuro passa a ser um `update` de uma
-- linha, sem migration de função.
--
-- ---------------------------------------------------------------------------
-- UM GATILHO SÓ, NO LUGAR DE DOIS.
--
-- Já existia `negocio_fechado_cancela_cadencia`, que encerra ao entrar numa
-- etapa com `resultado` (ganho ou perdido). A regra nova é da mesma família —
-- "esta etapa não convive com cadência viva" —, então ela entra na MESMA
-- função em vez de virar um segundo gatilho sobre a mesma tabela e o mesmo
-- evento. Dois gatilhos disputando `cadencia_inscricoes` seria a próxima coisa
-- difícil de depurar.
--
-- A função ganha nome novo porque o antigo passou a mentir: ela não cancela só
-- quando o negócio "fecha".
--
-- ---------------------------------------------------------------------------
-- O QUE NÃO MUDA
--
-- - "No-show" continua com a cadência própria de remarcação: ela é `funcao =
--   'retorno'` e NÃO é marcada aqui, senão o lead voltaria do vendedor para
--   uma fila que nunca tocaria nele.
-- - "Nutrição / Futuro" também não: quem manda lá é `retomar_leads_em_nutricao`,
--   pela data de retomada.
-- - As duas etapas de `resultado` seguem encerrando como já encerravam.
-- ---------------------------------------------------------------------------

alter table public.etapas_pipeline
  add column if not exists encerra_cadencia boolean not null default false;

comment on column public.etapas_pipeline.encerra_cadencia is
  'Quando true, entrar nesta etapa cancela a cadencia viva do negocio e os '
  'toques parados na fila. Para etapa que significa "ja falamos com o lead". '
  'Etapa de resultado (ganho/perdido) ja encerra por conta propria e nao '
  'precisa deste marcador.';

do $$
declare
  v_marcadas int;
begin
  -- As DUAS "Qualificação": a do SDR é onde isto importa hoje, e a de Vendas
  -- é vestigial (existe só para as ordens dos dois funis casarem) — marcá-la
  -- não custa nada e fecha a porta se um lead cair lá com cadência viva.
  update public.etapas_pipeline e
     set encerra_cadencia = true
   where e.nome = 'Qualificação';

  select count(*) into v_marcadas
    from public.etapas_pipeline where encerra_cadencia;

  if v_marcadas < 1 then
    raise exception 'Nenhuma etapa foi marcada com encerra_cadencia.';
  end if;

  raise notice 'Etapas que encerram cadencia: %.', v_marcadas;
end $$;

-- ---------------------------------------------------------------------------
-- O GATILHO, agora cobrindo as duas razões.
-- ---------------------------------------------------------------------------

create or replace function public.negocio_muda_de_etapa_encerra_cadencia()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_etapa record;
  v_motivo text;
begin
  if new.etapa_id is not distinct from old.etapa_id then
    return null;
  end if;

  select e.resultado, e.encerra_cadencia, e.nome
    into v_etapa
    from public.etapas_pipeline e
   where e.id = new.etapa_id;

  if not found then
    return null;
  end if;

  -- Etapa comum: a cadência segue viva, que é o certo. Inclui a volta de
  -- "Perdido" para o funil — reabrir um negócio não ressuscita a cadência
  -- sozinho, e não deve: quem reabre decide se inscreve de novo.
  if v_etapa.resultado is null and not v_etapa.encerra_cadencia then
    return null;
  end if;

  v_motivo := case
    when v_etapa.resultado = 'perdido' then 'Cancelada: o lead foi marcado como perdido.'
    when v_etapa.resultado = 'ganho'   then 'Cancelada: o negocio foi fechado como ganho.'
    else 'Cancelada: o lead foi movido para "' || v_etapa.nome || '" e a prospeccao automatica parou.'
  end;

  update public.cadencia_inscricoes
     set status = 'cancelada',
         proximo_envio_em = null
   where negocio_id = new.id
     and status in ('ativa', 'pausada');

  -- Os toques já escritos caem junto. Parar a inscrição e deixar a mensagem na
  -- fila manteria o card em "Toque pronto p/ enviar", com um botão que dispara
  -- mensagem de cadência morta.
  update public.mensagens
     set status = 'cancelada',
         ultimo_erro = v_motivo
   where negocio_id = new.id
     and status = 'aguardando_aprovacao';

  return null;
end;
$function$;

comment on function public.negocio_muda_de_etapa_encerra_cadencia() is
  'Ao entrar numa etapa com `resultado` (ganho/perdido) ou marcada com '
  '`encerra_cadencia`, cancela as inscricoes vivas e os toques em '
  '"aguardando_aprovacao". Substitui negocio_fechado_cancela_cadencia.';

-- O gatilho antigo sai junto com a funcao: dois gatilhos sobre `negocios`
-- fazendo quase a mesma coisa e a diferenca so no `if` de dentro e o tipo de
-- coisa que ninguem consegue depurar seis meses depois.
drop trigger if exists trg_negocio_fechado_cancela_cadencia on public.negocios;
drop function if exists public.negocio_fechado_cancela_cadencia();

drop trigger if exists trg_negocio_etapa_encerra_cadencia on public.negocios;
create trigger trg_negocio_etapa_encerra_cadencia
  after update of etapa_id on public.negocios
  for each row
  execute function public.negocio_muda_de_etapa_encerra_cadencia();

revoke all on function public.negocio_muda_de_etapa_encerra_cadencia() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O PASSIVO: quem JÁ está numa etapa dessas com cadência viva.
-- ---------------------------------------------------------------------------
do $$
declare
  v_inscricoes int;
  v_mensagens int;
  v_restam int;
begin
  update public.cadencia_inscricoes ci
     set status = 'cancelada', proximo_envio_em = null
    from public.negocios n
    join public.etapas_pipeline e on e.id = n.etapa_id
   where ci.negocio_id = n.id
     and (e.resultado is not null or e.encerra_cadencia)
     and ci.status in ('ativa', 'pausada');
  get diagnostics v_inscricoes = row_count;

  update public.mensagens m
     set status = 'cancelada',
         ultimo_erro = 'Cancelada: o lead ja estava numa etapa que encerra a cadencia.'
    from public.negocios n
    join public.etapas_pipeline e on e.id = n.etapa_id
   where m.negocio_id = n.id
     and (e.resultado is not null or e.encerra_cadencia)
     and m.status = 'aguardando_aprovacao';
  get diagnostics v_mensagens = row_count;

  select count(*) into v_restam
    from public.cadencia_inscricoes ci
    join public.negocios n on n.id = ci.negocio_id
    join public.etapas_pipeline e on e.id = n.etapa_id
   where (e.resultado is not null or e.encerra_cadencia)
     and ci.status in ('ativa', 'pausada');

  if v_restam > 0 then
    raise exception 'Sobraram % inscricoes vivas em etapa que encerra cadencia.', v_restam;
  end if;

  raise notice 'Passivo: % inscricoes e % mensagens canceladas.', v_inscricoes, v_mensagens;
end $$;
