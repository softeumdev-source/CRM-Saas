-- ---------------------------------------------------------------------------
-- O motor de cadencia: playbook, inscricao por lead, e o log do que sai e entra.
--
-- Decisao que foge do plano original, de proposito: NAO entra `pgmq`. A fila
-- que o despachante precisa e exatamente a tabela `mensagens` filtrada por
-- status — `for update skip locked` da a mesma garantia de "cada linha para um
-- consumidor so", com uma extensao a menos e, principalmente, com a fila
-- VISIVEL. A fila de aprovacao humana e a mesma tabela: se o que espera
-- aprovacao estivesse no `pgmq` e o log em `mensagens`, seriam duas verdades
-- sobre a mesma mensagem.
--
-- As mensagens da cadencia NAO viram `atividades`. Se virassem, cada envio
-- dispararia o gatilho `atividades_tocar_negocio`, que mexe em `negocios`, que
-- faz todo board conectado recarregar — e ainda pintaria de verde ("trabalhado
-- hoje") um lead que so recebeu e-mail automatico.
--
-- Visibilidade: em vez de repetir o predicado de `negocios` em cada policy,
-- elas perguntam "existe um negocio com este id?". Como a RLS de `negocios`
-- vale dentro da subconsulta, a regra vira "voce ve a mensagem se ve o negocio
-- dela" — e continua certa sozinha quando `negocios_select` mudar.
-- ---------------------------------------------------------------------------

create table if not exists public.templates_mensagem (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  nome text not null,
  canal text not null default 'email' check (canal in ('email', 'whatsapp')),
  -- 'utilidade' nao cai no teto de 2 mensagens de marketing por pessoa por dia
  -- do WhatsApp; so vale quando ha origem rastreavel (o lead pediu contato).
  categoria text not null default 'utilidade' check (categoria in ('utilidade', 'marketing')),
  assunto text,
  corpo text not null,
  template_externo_id text,
  ativo boolean not null default true,
  criado_em timestamptz default now()
);

comment on table public.templates_mensagem is
  'Modelos de mensagem. O corpo aceita {{contato}}, {{empresa}}, {{vendedor}} e {{primeiro_nome}}.';

create table if not exists public.cadencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  nome text not null,
  tipo text not null default 'inbound' check (tipo in ('inbound', 'outbound')),
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  -- O INTERRUPTOR DE AUTONOMIA. false = tudo passa por aprovacao humana.
  -- Comeca falso de proposito: mensagem enviada e irreversivel.
  autonoma boolean not null default false,
  ativa boolean not null default true,
  criado_em timestamptz default now()
);

comment on column public.cadencias.autonoma is
  'false = cada mensagem nasce aguardando_aprovacao. true = nasce aprovada e sai sozinha. Liga so quando houver confianca no que a IA escreve.';

create table if not exists public.cadencia_passos (
  id uuid primary key default gen_random_uuid(),
  cadencia_id uuid not null references public.cadencias(id) on delete cascade,
  ordem int not null,
  canal text not null default 'email' check (canal in ('email', 'whatsapp')),
  -- horas depois do passo anterior (ou da inscricao, no primeiro)
  atraso_horas int not null default 24 check (atraso_horas >= 0),
  template_id uuid references public.templates_mensagem(id) on delete set null,
  parar_se_respondeu boolean not null default true,
  unique (cadencia_id, ordem)
);

create table if not exists public.cadencia_inscricoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  cadencia_id uuid not null references public.cadencias(id) on delete cascade,
  passo_atual int not null default 0,
  status text not null default 'ativa'
    check (status in ('ativa', 'pausada', 'respondeu', 'concluida', 'cancelada')),
  proximo_envio_em timestamptz,
  inscrito_por uuid references public.usuarios(id),
  criado_em timestamptz default now(),
  -- impede inscrever o mesmo lead duas vezes na mesma cadencia, que e como um
  -- lead levaria a sequencia inteira em dobro
  unique (negocio_id, cadencia_id)
);

create index if not exists cadencia_inscricoes_vencidas_idx
  on public.cadencia_inscricoes (proximo_envio_em)
  where status = 'ativa' and proximo_envio_em is not null;

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  negocio_id uuid references public.negocios(id) on delete cascade,
  contato_id uuid references public.contatos(id) on delete set null,
  inscricao_id uuid references public.cadencia_inscricoes(id) on delete set null,
  passo_id uuid references public.cadencia_passos(id) on delete set null,

  direcao text not null default 'saida' check (direcao in ('saida', 'entrada')),
  canal text not null default 'email' check (canal in ('email', 'whatsapp')),
  status text not null default 'aguardando_aprovacao' check (status in (
    'aguardando_aprovacao', 'aprovada', 'enviando', 'enviada', 'falhou', 'cancelada', 'recebida'
  )),

  destino text,
  assunto text,
  corpo text not null,
  gerado_por text not null default 'template' check (gerado_por in ('template', 'ia', 'humano')),

  -- A chave da idempotencia: rodar o despachante duas vezes sobre a mesma fila
  -- nao pode enviar duas vezes. Uma linha por (inscricao, passo).
  idempotency_key text unique,

  agendada_para timestamptz default now(),
  aprovada_por uuid references public.usuarios(id),
  aprovada_em timestamptz,
  enviada_em timestamptz,

  tentativas int not null default 0,
  proxima_tentativa_em timestamptz,
  ultimo_erro text,
  provedor_id text,

  criado_em timestamptz default now()
);

comment on table public.mensagens is
  'Log de tudo que sai e entra, e ao mesmo tempo a fila do despachante e a fila de aprovacao humana. Uma verdade so por mensagem.';

create index if not exists mensagens_prontas_idx
  on public.mensagens (agendada_para)
  where status = 'aprovada';

create index if not exists mensagens_negocio_idx on public.mensagens (negocio_id, criado_em desc);
create index if not exists mensagens_aprovacao_idx on public.mensagens (tenant_id, criado_em desc)
  where status = 'aguardando_aprovacao';

create table if not exists public.consentimentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp')),
  -- o texto que a pessoa aceitou, guardado por inteiro: o onus da prova do
  -- opt-in e da empresa, e "ela marcou um checkbox" nao e prova de nada sem
  -- o que estava escrito nele
  texto_aceito text,
  origem text,
  ip text,
  user_agent text,
  aceito_em timestamptz default now(),
  revogado_em timestamptz
);

create index if not exists consentimentos_contato_idx on public.consentimentos (contato_id, canal);

alter table public.templates_mensagem enable row level security;
alter table public.cadencias enable row level security;
alter table public.cadencia_passos enable row level security;
alter table public.cadencia_inscricoes enable row level security;
alter table public.mensagens enable row level security;
alter table public.consentimentos enable row level security;

create policy templates_select on public.templates_mensagem
  for select using (tenant_id = (select public.usuario_tenant_id()));
create policy templates_admin on public.templates_mensagem
  for all using ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()))
  with check ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()));

create policy cadencias_select on public.cadencias
  for select using (tenant_id = (select public.usuario_tenant_id()));
create policy cadencias_admin on public.cadencias
  for all using ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()))
  with check ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()));

create policy cadencia_passos_select on public.cadencia_passos
  for select using (exists (select 1 from public.cadencias c where c.id = cadencia_id));
create policy cadencia_passos_admin on public.cadencia_passos
  for all using (
    (select public.usuario_role()) = 'admin'
    and exists (select 1 from public.cadencias c where c.id = cadencia_id)
  )
  with check (
    (select public.usuario_role()) = 'admin'
    and exists (select 1 from public.cadencias c where c.id = cadencia_id)
  );

-- Inscricoes e mensagens seguem o negocio: a RLS de `negocios` vale dentro do
-- exists, entao "vejo a mensagem se vejo o negocio dela" sai de graca.
create policy inscricoes_tudo on public.cadencia_inscricoes
  for all using (exists (select 1 from public.negocios n where n.id = negocio_id))
  with check (exists (select 1 from public.negocios n where n.id = negocio_id));

create policy mensagens_select on public.mensagens
  for select using (exists (select 1 from public.negocios n where n.id = negocio_id));
create policy mensagens_update on public.mensagens
  for update using (exists (select 1 from public.negocios n where n.id = negocio_id))
  with check (exists (select 1 from public.negocios n where n.id = negocio_id));
create policy mensagens_insert on public.mensagens
  for insert with check (exists (select 1 from public.negocios n where n.id = negocio_id));

create policy consentimentos_select on public.consentimentos
  for select using (tenant_id = (select public.usuario_tenant_id()));
create policy consentimentos_insert on public.consentimentos
  for insert with check (tenant_id = (select public.usuario_tenant_id()));

-- Realtime: a linha do tempo do card acompanha as mensagens daquele negocio.
-- O board NAO assina esta tabela, entao envio de cadencia nao recarrega board
-- de ninguem.
alter table public.templates_mensagem replica identity full;
alter table public.cadencias replica identity full;
alter table public.cadencia_passos replica identity full;
alter table public.cadencia_inscricoes replica identity full;
alter table public.mensagens replica identity full;
alter table public.consentimentos replica identity full;

alter publication supabase_realtime add table public.mensagens;
alter publication supabase_realtime add table public.cadencia_inscricoes;
