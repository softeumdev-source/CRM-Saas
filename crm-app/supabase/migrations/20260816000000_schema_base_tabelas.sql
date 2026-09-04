-- O schema base, finalmente descrito no repositório.
--
-- Medido antes: 26 tabelas em produção, 11 em migration. As 15 daqui — o
-- núcleo inteiro do CRM — existiam **só em produção**. Consequências práticas
-- que isso já teve nesta sessão: não há ambiente novo, não há staging, e toda
-- migration escrita aqui foi aplicada direto em produção porque não existe
-- outro lugar para aplicá-la.
--
-- **Isto não é uma reescrita: é uma transcrição.** O DDL abaixo foi gerado do
-- catálogo vivo (`pg_attribute`, `pg_constraint`, `pg_get_constraintdef`) e não
-- digitado à mão — digitar 195 colunas é copiar errado. Um schema que o
-- repositório descreve *quase* certo é pior do que nenhum, porque alguém
-- confia nele.
--
-- Tudo é `if not exists`: aplicar em produção não pode mudar uma linha, e isso
-- é provado por diferença, não afirmado.
--
-- **Uma nota de operação, porque a data destes arquivos é deliberadamente
-- ANTIGA (20260816).** Eles precisam rodar antes do primeiro arquivo que o
-- repositório já tinha (20260817193201), que altera tabelas criadas aqui. Em
-- produção esses números não estão no histórico, então `supabase db push` os
-- vê como migrations fora de ordem e pede `--include-all` para aplicá-los.
-- Aplicar é seguro: a transcrição foi conferida objeto a objeto contra o
-- catálogo vivo (160 de 160 idênticos), então não há o que mudar.
--
-- As FKs saem daqui para o arquivo de constraints, de propósito: `tenants`
-- aponta para `usuarios` (a caixa de e-mail do tenant) e `usuarios` aponta para
-- `tenants`. É um ciclo, e não existe ordem de criação que o resolva com FK
-- embutida.

-- ---------------------------------------------------------------------------
-- Extensões de que o schema depende.
-- ---------------------------------------------------------------------------
-- `gen_random_uuid()` é o default de quase toda chave primária daqui. Sem
-- pgcrypto, um ambiente novo falha no primeiro insert, e não na migration.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) A raiz: empresa e pessoas.
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  slug text not null,
  logo_url text,
  cor_primaria text default '#4f46e5'::text,
  criado_em timestamp with time zone default now(),
  caixa_email_usuario_id uuid,
  constraint tenants_pkey PRIMARY KEY (id),
  constraint tenants_slug_key UNIQUE (slug)
);

-- `usuarios.id` NÃO tem default: é o mesmo uuid de `auth.users`. Uma linha aqui
-- só existe para alguém que já existe na autenticação.
create table if not exists public.usuarios (
  id uuid not null,
  tenant_id uuid,
  nome text not null,
  email text not null,
  role text not null default 'vendedor'::text,
  avatar_url text,
  meta_mensal numeric default 0,
  ativo boolean default true,
  criado_em timestamp with time zone default now(),
  constraint usuarios_pkey PRIMARY KEY (id),
  constraint usuarios_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'vendedor'::text, 'sdr'::text])))
);

create table if not exists public.planos (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid,
  nome text not null,
  descricao text,
  franquia_pedidos integer not null default 1000,
  valor_setup_plataforma numeric not null default 0,
  valor_setup_erp numeric not null default 0,
  valor_setup_catalogo numeric not null default 0,
  valor_plataforma_base numeric not null default 0,
  valor_uso_base numeric not null default 0,
  valor_excedente_pedido numeric not null default 2.00,
  ativo boolean default true,
  criado_em timestamp with time zone default now(),
  constraint planos_pkey PRIMARY KEY (id)
);

create table if not exists public.etapas_pipeline (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid,
  nome text not null,
  ordem integer not null,
  cor text default '#6366f1'::text,
  probabilidade integer default 0,
  resultado text,
  pipeline_id uuid,
  funcao text,
  constraint etapas_pipeline_pkey PRIMARY KEY (id),
  constraint etapas_pipeline_funcao_check CHECK ((funcao = ANY (ARRAY['entrada'::text, 'retorno'::text, 'nutricao'::text, 'entrega'::text]))),
  constraint etapas_pipeline_resultado_check CHECK ((resultado = ANY (ARRAY['ganho'::text, 'perdido'::text])))
);

-- ---------------------------------------------------------------------------
-- 2) O funil: quem é o cliente, qual é o negócio, e o que aconteceu nele.
-- ---------------------------------------------------------------------------
create table if not exists public.contatos (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid,
  nome text not null,
  empresa text,
  cnpj text,
  email text,
  telefone text,
  cargo text,
  cidade text,
  estado text,
  origem text default 'manual'::text,
  tags text[] default '{}'::text[],
  responsavel_id uuid,
  criado_em timestamp with time zone default now(),
  atualizado_em timestamp with time zone default now(),
  sobrenome text,
  area text,
  telefone_comercial text,
  whatsapp text,
  constraint contatos_pkey PRIMARY KEY (id)
);

-- `respostas_nao_lidas` e `ultima_resposta_*` são o sinal que o card do board
-- mostra. Ficam aqui, no negócio, e não numa consulta agregada sobre
-- `mensagens`: o board lê 25 cards por vez e não pode pagar um count por card.
create table if not exists public.negocios (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid,
  contato_id uuid,
  responsavel_id uuid,
  etapa_id uuid,
  titulo text not null,
  valor numeric default 0,
  prioridade text default 'media'::text,
  probabilidade integer default 10,
  data_fechamento_prevista date,
  ganho boolean,
  motivo_perda text,
  criado_em timestamp with time zone default now(),
  atualizado_em timestamp with time zone default now(),
  ultima_atividade_em timestamp with time zone,
  fechado_em timestamp with time zone,
  pipeline_id uuid,
  retomar_em timestamp with time zone,
  ultima_resposta_em timestamp with time zone,
  ultima_resposta_canal text,
  respostas_nao_lidas integer not null default 0,
  respostas_lidas_em timestamp with time zone,
  ultima_resposta_whatsapp_em timestamp with time zone,
  constraint negocios_pkey PRIMARY KEY (id),
  constraint negocios_prioridade_check CHECK ((prioridade = ANY (ARRAY['alta'::text, 'media'::text, 'baixa'::text]))),
  constraint negocios_ultima_resposta_canal_check CHECK ((ultima_resposta_canal = ANY (ARRAY['email'::text, 'whatsapp'::text])))
);

create table if not exists public.atividades (
  id uuid not null default gen_random_uuid(),
  negocio_id uuid,
  usuario_id uuid,
  tipo text not null default 'nota'::text,
  titulo text not null,
  descricao text,
  data_agendada timestamp with time zone,
  concluida boolean default false,
  lembrete_data timestamp with time zone,
  lembrete_enviado boolean default false,
  criado_em timestamp with time zone default now(),
  confirmada boolean default false,
  concluida_em timestamp with time zone,
  compareceu boolean,
  google_evento_id text,
  google_meet_link text,
  google_resposta text,
  constraint atividades_pkey PRIMARY KEY (id),
  constraint atividades_tipo_check CHECK ((tipo = ANY (ARRAY['ligacao'::text, 'email'::text, 'demo'::text, 'proposta'::text, 'nota'::text, 'whatsapp'::text, 'reuniao'::text, 'mudanca_etapa'::text]))),
  constraint atividades_titulo_preenchido CHECK ((btrim(titulo) <> ''::text))
);

create table if not exists public.negocio_etapa_historico (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  negocio_id uuid not null,
  etapa_id uuid,
  entrou_em timestamp with time zone not null default now(),
  saiu_em timestamp with time zone,
  constraint negocio_etapa_historico_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 3) Proposta, envelope e assinatura.
-- ---------------------------------------------------------------------------
-- Os dois checks de "não pode ser menor que a base" são a trava de desconto no
-- banco: sem eles, um desconto abaixo do piso passaria por qualquer caminho que
-- não fosse a tela.
create table if not exists public.propostas (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid,
  negocio_id uuid,
  plano_id uuid,
  gerado_por uuid,
  numero text not null default ''::text,
  versao integer not null default 1,
  aviso_previo_dias integer not null default 180,
  prazo_contrato_meses integer not null default 12,
  valor_setup_plataforma numeric not null default 0,
  valor_setup_erp numeric not null default 0,
  valor_setup_catalogo numeric not null default 0,
  valor_plataforma numeric not null default 0,
  valor_uso numeric not null default 0,
  valor_excedente_pedido numeric not null default 2.00,
  valor_plataforma_base_snapshot numeric not null default 0,
  valor_uso_base_snapshot numeric not null default 0,
  qtd_caixas_email integer default 0,
  valor_modulo_email numeric default 0,
  qtd_numeros_whatsapp integer default 0,
  valor_modulo_whatsapp numeric default 0,
  forma_pagamento text default 'Pix ou Boleto'::text,
  status text not null default 'rascunho'::text,
  pdf_comercial_path text,
  pdf_tecnica_path text,
  criado_em timestamp with time zone default now(),
  enviada_em timestamp with time zone,
  pdf_assinado_comercial_path text,
  pdf_assinado_tecnica_path text,
  constraint propostas_pkey PRIMARY KEY (id),
  constraint propostas_aviso_previo_dias_check CHECK ((aviso_previo_dias = ANY (ARRAY[30, 60, 90, 120, 150, 180]))),
  constraint propostas_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'enviada'::text, 'assinada'::text, 'cancelada'::text]))),
  constraint valor_plataforma_nao_pode_ser_menor_que_base CHECK ((valor_plataforma >= valor_plataforma_base_snapshot)),
  constraint valor_uso_nao_pode_ser_menor_que_base CHECK ((valor_uso >= valor_uso_base_snapshot))
);

create table if not exists public.envelopes (
  id uuid not null default gen_random_uuid(),
  proposta_id uuid,
  tenant_id uuid,
  status text not null default 'enviado'::text,
  criado_em timestamp with time zone default now(),
  concluido_em timestamp with time zone,
  copias_emails text[] default '{}'::text[],
  campos_assinatura jsonb default '[]'::jsonb,
  constraint envelopes_pkey PRIMARY KEY (id),
  constraint envelopes_status_check CHECK ((status = ANY (ARRAY['enviado'::text, 'aguardando'::text, 'concluido'::text, 'expirado'::text, 'cancelado'::text])))
);

-- O `token` é o que dá acesso público à tela de assinatura, sem login. Por isso
-- ele é `unique` e nasce de `gen_random_bytes(24)`: 192 bits de aleatoriedade
-- criptográfica, e não um uuid sequencial que alguém adivinha.
create table if not exists public.signatarios (
  id uuid not null default gen_random_uuid(),
  envelope_id uuid,
  nome text not null,
  email text not null,
  papel text not null default 'cliente'::text,
  ordem integer default 1,
  token text not null default encode(gen_random_bytes(24), 'hex'::text),
  status text not null default 'pendente'::text,
  visualizado_em timestamp with time zone,
  assinado_em timestamp with time zone,
  ip_assinatura text,
  user_agent text,
  assinatura_tipo text,
  assinatura_dados text,
  criado_em timestamp with time zone default now(),
  email_faturamento text,
  constraint signatarios_pkey PRIMARY KEY (id),
  constraint signatarios_token_key UNIQUE (token),
  constraint signatarios_assinatura_tipo_check CHECK ((assinatura_tipo = ANY (ARRAY['desenhada'::text, 'digitada'::text]))),
  constraint signatarios_papel_check CHECK ((papel = ANY (ARRAY['cliente'::text, 'softeum'::text]))),
  constraint signatarios_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'visualizado'::text, 'assinado'::text])))
);

-- ---------------------------------------------------------------------------
-- 4) Operação: convite, notificação, distribuição e aprovação de desconto.
-- ---------------------------------------------------------------------------
create table if not exists public.convites (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid,
  email text not null,
  role text not null default 'vendedor'::text,
  status text not null default 'pendente'::text,
  convidado_por uuid,
  criado_em timestamp with time zone default now(),
  token text not null default encode(gen_random_bytes(24), 'hex'::text),
  expira_em timestamp with time zone not null default (now() + '7 days'::interval),
  constraint convites_pkey PRIMARY KEY (id),
  constraint convites_token_key UNIQUE (token),
  constraint convites_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'vendedor'::text, 'sdr'::text]))),
  constraint convites_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aceito'::text])))
);

create table if not exists public.notificacoes (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid,
  tipo text not null,
  titulo text not null,
  corpo text,
  link text,
  lida boolean default false,
  criado_em timestamp with time zone default now(),
  constraint notificacoes_pkey PRIMARY KEY (id)
);

create table if not exists public.regras_distribuicao (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid,
  usuario_id uuid,
  tipo text not null default 'round_robin'::text,
  valor text,
  prioridade integer default 1,
  ativo boolean default true,
  criado_em timestamp with time zone default now(),
  constraint regras_distribuicao_pkey PRIMARY KEY (id),
  constraint regras_distribuicao_tipo_check CHECK ((tipo = ANY (ARRAY['round_robin'::text, 'tag'::text])))
);

create table if not exists public.solicitacoes_desconto (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  negocio_id uuid not null,
  plano_id uuid,
  vendedor_id uuid,
  valor_mensal_solicitado numeric not null default 0,
  valor_setup_solicitado numeric not null default 0,
  valor_mensal_base numeric not null default 0,
  motivo text,
  status text not null default 'pendente'::text,
  resposta_admin text,
  decidido_por uuid,
  decidido_em timestamp with time zone,
  criado_em timestamp with time zone default now(),
  constraint solicitacoes_desconto_pkey PRIMARY KEY (id),
  constraint solicitacoes_desconto_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'recusado'::text])))
);
