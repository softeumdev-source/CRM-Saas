-- ---------------------------------------------------------------------------
-- WhatsApp: configuracao, freio e o monitor que pausa sozinho.
--
-- Este e o canal que o dono do projeto escolheu usar ciente do risco. As
-- mitigacoes combinadas entram como ESTRUTURA, nao como recomendacao:
--
--   1. numero separado do comercial — se queimar, queima o descartavel;
--   2. teto por hora, por dia e espacamento minimo por lead;
--   3. monitor que PAUSA o canal sozinho quando a taxa de falha sobe.
--
-- Tudo no banco, e nao na rota, por um motivo concreto: a rota pode rodar em
-- duas instancias ao mesmo tempo, e dois processos contando "quantas mandei
-- nesta hora" cada um na sua memoria nao sao freio nenhum. O unico ponto por
-- onde tudo passa e a reserva da fila.
--
-- O teto de 2 mensagens de MARKETING por pessoa por dia e da Meta e soma todas
-- as empresas — nao da para ver esse contador daqui. Por isso a preferencia por
-- template de categoria 'utilidade' e por isso os limites aqui sao
-- conservadores: e melhor mandar de menos do que perder o numero.
-- ---------------------------------------------------------------------------

create table if not exists public.whatsapp_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  numero_id text,
  numero_exibicao text,
  limite_por_hora int not null default 20 check (limite_por_hora >= 0),
  limite_por_dia int not null default 100 check (limite_por_dia >= 0),
  horas_entre_mensagens_por_lead int not null default 24 check (horas_entre_mensagens_por_lead >= 0),
  janela_monitor int not null default 20 check (janela_monitor >= 5),
  limite_taxa_falha numeric not null default 0.30 check (limite_taxa_falha > 0 and limite_taxa_falha <= 1),
  pausado boolean not null default true,
  pausado_automaticamente boolean not null default false,
  pausado_em timestamptz,
  pausado_motivo text,
  criado_em timestamptz default now()
);

comment on table public.whatsapp_config is
  'Configuracao e freio do canal WhatsApp. Nasce PAUSADO: ligar e uma decisao explicita, com numero e templates ja aprovados.';

alter table public.whatsapp_config enable row level security;
create policy whatsapp_config_select on public.whatsapp_config
  for select using (tenant_id = (select public.usuario_tenant_id()));
create policy whatsapp_config_admin on public.whatsapp_config
  for all using ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()))
  with check ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()));
alter table public.whatsapp_config replica identity full;

alter table public.mensagens add column if not exists erro_codigo text;

create index if not exists mensagens_whatsapp_recentes_idx
  on public.mensagens (tenant_id, criado_em desc) where canal = 'whatsapp';

insert into public.whatsapp_config (tenant_id)
select t.id from public.tenants t
where not exists (select 1 from public.whatsapp_config c where c.tenant_id = t.id);

-- ---------------------------------------------------------------------------
-- O monitor. Roda DEPOIS de cada desfecho de envio, e nao num cron, porque o
-- momento em que a informacao existe e exatamente o momento em que ela importa:
-- esperar cinco minutos para pausar significa mandar mais um lote contra um
-- numero que ja esta sendo bloqueado.
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_avaliar_bloqueio(p_tenant uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cfg record; v_total int; v_falhas int; v_taxa numeric;
begin
  select * into v_cfg from public.whatsapp_config where tenant_id = p_tenant;
  if not found or v_cfg.pausado then
    return false;
  end if;

  with recentes as (
    select status from public.mensagens
     where tenant_id = p_tenant and canal = 'whatsapp' and status in ('enviada','falhou')
     order by criado_em desc limit v_cfg.janela_monitor
  )
  select count(*), count(*) filter (where status = 'falhou') into v_total, v_falhas from recentes;

  -- Janela incompleta nao decide nada: 2 falhas em 2 tentativas e 100% e nao
  -- quer dizer nada. Pausar por isso seria desligar o canal no primeiro soluco.
  if v_total < v_cfg.janela_monitor then
    return false;
  end if;

  v_taxa := v_falhas::numeric / v_total;
  if v_taxa < v_cfg.limite_taxa_falha then
    return false;
  end if;

  update public.whatsapp_config
     set pausado = true, pausado_automaticamente = true, pausado_em = now(),
         pausado_motivo = format('%s de %s das ultimas mensagens falharam (%s%%), acima do limite de %s%%.',
           v_falhas, v_total, round(v_taxa * 100), round(v_cfg.limite_taxa_falha * 100))
   where tenant_id = p_tenant;
  return true;
end;
$$;

revoke execute on function public.whatsapp_avaliar_bloqueio(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_avaliar_bloqueio(uuid) to service_role;
