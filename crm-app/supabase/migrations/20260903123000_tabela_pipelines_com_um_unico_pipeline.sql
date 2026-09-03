-- ---------------------------------------------------------------------------
-- Separacao de funis: tabela `pipelines`, com UM UNICO pipeline existindo.
--
-- Esta e a migration que tira o risco do projeto: a separacao e provada
-- correta enquanto ainda nao existe nada para separar. Se algo quebrar aqui,
-- quebra visivel, com um pipeline so, e reverte em uma linha.
--
-- Por que tabela e nao uma coluna `pipeline text`:
-- o SDR precisa referenciar pipeline como VALOR, nao como literal — o handoff
-- precisa de um pipeline de destino, a cadencia se liga a um pipeline, e a
-- fila de reagendamento aponta para o pipeline do SDR. Com coluna de texto,
-- cada um vira um 'sdr' cravado espalhado por policies, gatilhos e TypeScript.
--
-- `negocios.pipeline_id` desnormalizado NAO e opcional: `etapa_id` e nulavel,
-- e o filtro de realtime do Supabase nao atravessa join — ele precisa da
-- coluna na propria tabela para separar o board do SDR do board do vendedor.
-- Por isso ela e mantida por gatilho, e nao pela aplicacao.
-- ---------------------------------------------------------------------------

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  -- chave imutavel: e o que o codigo referencia, para o nome poder ser trocado
  chave text not null check (chave in ('vendas', 'sdr')),
  nome text not null,
  -- qual papel opera este board (o SDR da Fase 4 usa 'sdr')
  role_operador text not null default 'vendedor',
  -- para onde o lead vai quando este pipeline termina (handoff SDR -> vendedor)
  pipeline_destino_id uuid references public.pipelines(id) on delete set null,
  criado_em timestamptz default now(),
  unique (tenant_id, chave)
);

comment on table public.pipelines is
  'Funis. Hoje so existe o de vendas; o do SDR entra na Fase 4 sem tocar neste schema.';

alter table public.pipelines enable row level security;

create policy pipelines_select on public.pipelines
  for select using (tenant_id = usuario_tenant_id());
create policy pipelines_admin_insert on public.pipelines
  for insert with check (usuario_role() = 'admin' and tenant_id = usuario_tenant_id());
create policy pipelines_admin_update on public.pipelines
  for update using (usuario_role() = 'admin' and tenant_id = usuario_tenant_id());
create policy pipelines_admin_delete on public.pipelines
  for delete using (usuario_role() = 'admin' and tenant_id = usuario_tenant_id());

-- filtro de realtime precisa da linha inteira no WAL
alter table public.pipelines replica identity full;

-- Um pipeline de vendas por tenant, com as etapas que ja existem.
insert into public.pipelines (tenant_id, chave, nome, role_operador)
select t.id, 'vendas', 'Vendas', 'vendedor'
from public.tenants t
on conflict (tenant_id, chave) do nothing;

alter table public.etapas_pipeline
  add column if not exists pipeline_id uuid references public.pipelines(id) on delete cascade;

update public.etapas_pipeline e
set pipeline_id = p.id
from public.pipelines p
where p.tenant_id is not distinct from e.tenant_id
  and p.chave = 'vendas'
  and e.pipeline_id is null;

alter table public.negocios
  add column if not exists pipeline_id uuid references public.pipelines(id) on delete set null;

update public.negocios n
set pipeline_id = e.pipeline_id
from public.etapas_pipeline e
where e.id = n.etapa_id and n.pipeline_id is distinct from e.pipeline_id;

-- Negocio sem etapa fica no pipeline de vendas do proprio tenant.
update public.negocios n
set pipeline_id = p.id
from public.pipelines p
where n.etapa_id is null
  and n.pipeline_id is null
  and p.tenant_id is not distinct from n.tenant_id
  and p.chave = 'vendas';

create index if not exists negocios_pipeline_id_idx on public.negocios (pipeline_id);
create index if not exists etapas_pipeline_pipeline_id_idx on public.etapas_pipeline (pipeline_id);
