-- O horário de atendimento — o que separa "livre" de "disponível".
--
-- A agenda do Google sabe o que está OCUPADO. Ela não sabe o que é
-- ATENDIMENTO: domingo às 3h da manhã está livre e não serve para sugerir a
-- ninguém. Sem esta tabela, "das 9h às 18h" viraria um número escondido no
-- código, e mudar o expediente exigiria um deploy.
--
-- É POR TENANT, e não por vendedor, de propósito: a agenda lida é sempre a de
-- QUEM está sugerindo (o token é o dele), mas o horário comercial é da
-- empresa. Quando alguém precisar de expediente próprio, a coluna
-- `usuario_id` entra aqui sem quebrar nada — a leitura já cai no padrão do
-- tenant quando não achar linha específica.
--
-- HORA É `time`, E NÃO TEXTO
--
-- O banco recusa "25:00" de graça, e a comparação `hora_fim > hora_inicio`
-- vira uma restrição de verdade em vez de um comentário. O supabase-js devolve
-- "09:00:00", que o `minutosDe` do módulo puro já lê.

create table if not exists public.preferencias_agenda (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- O fuso do comercial. As funções da Vercel rodam em UTC, então a conta de
  -- horário SEMPRE precisa deste valor — nunca do relógio do servidor.
  fuso text not null default 'America/Sao_Paulo',

  -- ISO: 1 = segunda … 7 = domingo.
  dias_semana int[] not null default '{1,2,3,4,5}',

  hora_inicio time not null default '09:00',
  hora_fim    time not null default '18:00',

  -- Os dois juntos ou nenhum: metade da pausa não descreve pausa nenhuma.
  almoco_inicio time default '12:00',
  almoco_fim    time default '13:00',

  -- 30 min porque os e-mails da cadência prometem "20 minutos", e a folga cabe.
  duracao_minutos    int not null default 30,
  -- Nada é sugerido antes de agora + isto. Ninguém marca para daqui a 10 min.
  antecedencia_horas int not null default 3,
  -- Folga antes e depois de cada compromisso, para dar tempo de respirar.
  intervalo_minutos  int not null default 15,

  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now(),

  constraint preferencias_agenda_tenant_unico unique (tenant_id),
  constraint preferencias_agenda_expediente check (hora_fim > hora_inicio),
  constraint preferencias_agenda_dias check (
    array_length(dias_semana, 1) between 1 and 7
    and dias_semana <@ array[1,2,3,4,5,6,7]
  ),
  constraint preferencias_agenda_almoco check (
    (almoco_inicio is null and almoco_fim is null)
    or (almoco_inicio is not null and almoco_fim is not null and almoco_fim > almoco_inicio)
  ),
  constraint preferencias_agenda_duracao check (duracao_minutos between 5 and 480),
  constraint preferencias_agenda_antecedencia check (antecedencia_horas between 0 and 168),
  constraint preferencias_agenda_intervalo check (intervalo_minutos between 0 and 120)
);

alter table public.preferencias_agenda enable row level security;

-- Qualquer pessoa do tenant LÊ: quem sugere horário é o vendedor, não o admin.
create policy preferencias_agenda_select on public.preferencias_agenda
  for select using (tenant_id = (select public.usuario_tenant_id()));

-- Só o admin ESCREVE: mexer no expediente muda o que o time inteiro oferece.
create policy preferencias_agenda_admin on public.preferencias_agenda
  for all using (
    (select public.usuario_role()) = 'admin'
    and tenant_id = (select public.usuario_tenant_id())
  );

-- Uma linha por tenant, já com os padrões. Sem isso a primeira sugestão cairia
-- no caminho "sem configuração" e ninguém saberia onde configurar.
insert into public.preferencias_agenda (tenant_id)
select t.id from public.tenants t
 where not exists (
   select 1 from public.preferencias_agenda p where p.tenant_id = t.id);
