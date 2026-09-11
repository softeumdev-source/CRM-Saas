-- ---------------------------------------------------------------------------
-- O e-mail de cadencia passa a ter freio: 50 por dia, so em horario comercial,
-- espalhados -- e nao 50 de uma vez as 9h01.
--
-- HOJE NAO HA FREIO NENHUM no e-mail. `reservar_mensagens` pesca ate `p_limite`
-- (20, o LOTE da rota) por rodada, e o cron bate de 5 em 5 minutos, 24h por
-- dia: 240 e-mails por hora de teto teorico, a qualquer hora da madrugada. O
-- que segurava o volume era a aprovacao humana, nao o sistema. Ligar a
-- autonomia sem isto aqui despejaria a fila inteira em minutos.
--
-- O MOLDE JA EXISTE: `whatsapp_folga` freia o WhatsApp por hora e por dia
-- (20260903160000). Esta funcao e a mesma ideia com uma diferenca que importa,
-- explicada abaixo.
--
-- ---------------------------------------------------------------------------
-- POR QUE RITMO, E NAO UM TETO POR HORA
--
-- Um teto por hora (50/8h = 7) resolveria o "50 de uma vez" e criaria outro:
-- os 7 sairiam todos na PRIMEIRA rodada de cada hora e depois 55 minutos de
-- silencio. Continua sendo rajada, so que menor.
--
-- Entao a folga vem do RITMO ESPERADO: a esta altura do expediente, quanto ja
-- deveria ter saido?
--
--     cota = limite * (minutos comerciais decorridos / minutos comerciais do dia)
--     folga = cota - o que ja saiu hoje
--
-- Com 09:00-18:00 menos uma hora de almoco (480 minutos uteis) e limite 50, da
-- um e-mail a cada ~9,6 minutos. Como o cron roda de 5 em 5, a folga alterna
-- entre 0 e 1 -- que e exatamente "nao tudo de uma vez".
--
-- E a formula se autocorrige: se o cron ficar parado uma hora, a cota acumula e
-- a fila recupera o atraso sozinha, sem nunca passar de 50 no dia. Um teto por
-- hora perderia a cota da hora que passou.
--
-- ---------------------------------------------------------------------------
-- DUAS DECISOES QUE PRECISAM ESTAR ESCRITAS
--
-- 1) O HORARIO COMERCIAL VEM DE `preferencias_agenda`, que ja e o "Horario de
--    Atendimento" que o admin configura na tela. Nao inventei um segundo lugar
--    para dizer a mesma coisa. Fuso, dias da semana, inicio, fim e almoco saem
--    todos de la.
--
--    `dias_semana` e 1=segunda...7=domingo -- convencao ISO, conferida em
--    `HorarioDeAtendimento.tsx`. Por isso `isodow` e NAO `dow`: `dow` e
--    0=domingo...6=sabado, e com ele o `{1,2,3,4,5}` do padrao viraria
--    segunda-a-sexta deslocado, mandando e-mail no domingo e nunca na sexta.
--
-- 2) A CONTA E DE TENTATIVAS, NAO DE ENTREGAS: conto `reservada_em`, como
--    `whatsapp_folga` faz. Uma mensagem reservada que falhou consumiu a cota do
--    dia. E o lado seguro -- o outro lado deixaria uma falha em looping furar
--    o teto de 50.
-- ---------------------------------------------------------------------------

create table if not exists public.email_config (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null unique references public.tenants(id) on delete cascade,
  limite_por_dia int not null default 50 check (limite_por_dia >= 0),
  pausado       boolean not null default false,
  criado_em     timestamptz default now()
);

comment on table public.email_config is
  'Freio do e-mail de cadencia, por tenant. `limite_por_dia` e teto de '
  'TENTATIVAS por dia; o ritmo dentro do dia sai de `email_folga`.';

alter table public.email_config enable row level security;

-- As mesmas duas politicas de `whatsapp_config`: todo mundo do tenant le, so
-- admin escreve.
drop policy if exists email_config_select on public.email_config;
create policy email_config_select on public.email_config
  for select using (tenant_id = (select public.usuario_tenant_id()));

drop policy if exists email_config_admin on public.email_config;
create policy email_config_admin on public.email_config
  for all
  using      ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()))
  with check ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()));

insert into public.email_config (tenant_id)
select t.id from public.tenants t
on conflict (tenant_id) do nothing;

-- ---------------------------------------------------------------------------

create or replace function public.email_folga(p_tenant uuid)
 returns integer
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_limite    int  := 50;
  v_pausado   boolean := false;
  v_pref      record;
  v_local     timestamp;
  v_hora      time;
  v_almoco    int := 0;
  v_total     int;
  v_decorrido int;
  v_enviados  int;
  v_cota      int;
begin
  -- Sem linha de config o tenant usa o padrao e NAO fica mudo. A linha existe
  -- para mexer no numero e para ter o botao de pausa, nao para autorizar o
  -- envio -- quem autoriza e `cadencias.autonoma`, e quem limita a janela e o
  -- horario comercial logo abaixo.
  select c.limite_por_dia, c.pausado into v_limite, v_pausado
    from public.email_config c where c.tenant_id = p_tenant;
  if v_pausado then return 0; end if;
  v_limite := coalesce(v_limite, 50);

  select p.* into v_pref
    from public.preferencias_agenda p where p.tenant_id = p_tenant;
  -- Sem horario de atendimento definido nao ha "horario comercial" para
  -- respeitar, e o pedido era explicito quanto a isso. Melhor nao mandar do que
  -- mandar de madrugada.
  if not found then return 0; end if;

  v_local := now() at time zone v_pref.fuso;
  v_hora  := v_local::time;

  if not (extract(isodow from v_local)::int = any(v_pref.dias_semana)) then return 0; end if;
  if v_hora < v_pref.hora_inicio or v_hora >= v_pref.hora_fim then return 0; end if;

  if v_pref.almoco_inicio is not null and v_pref.almoco_fim is not null then
    if v_hora >= v_pref.almoco_inicio and v_hora < v_pref.almoco_fim then return 0; end if;
    v_almoco := (extract(epoch from (v_pref.almoco_fim - v_pref.almoco_inicio)) / 60)::int;
  end if;

  v_total := (extract(epoch from (v_pref.hora_fim - v_pref.hora_inicio)) / 60)::int - v_almoco;

  v_decorrido := (extract(epoch from (v_hora - v_pref.hora_inicio)) / 60)::int;
  -- Passado o almoco, os minutos dele nao contam como expediente decorrido --
  -- senao a cota daria um salto ao meio-dia e sairia uma rajada as 13h.
  if v_pref.almoco_fim is not null and v_hora >= v_pref.almoco_fim then
    v_decorrido := v_decorrido - v_almoco;
  end if;

  select count(*) into v_enviados
    from public.mensagens m
   where m.tenant_id = p_tenant
     and m.canal = 'email'
     and m.reservada_em is not null
     and (m.reservada_em at time zone v_pref.fuso)::date = v_local::date;

  v_cota := ceil(v_limite::numeric * greatest(v_decorrido, 0) / greatest(v_total, 1))::int;

  return greatest(0, least(v_cota, v_limite) - v_enviados);
end;
$function$;

comment on function public.email_folga(uuid) is
  'Quantos e-mails de cadencia ainda cabem AGORA: 0 fora do horario comercial '
  'do tenant, e dentro dele o que falta para alcancar o ritmo esperado do dia.';

revoke execute on function public.email_folga(uuid) from public, anon, authenticated;
