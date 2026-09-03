-- Anexos existirem, os buckets estarem no repositório, e duas políticas
-- consertadas.
--
-- Três coisas medidas antes de escrever isto:
--
-- 1. Não há tabela nem coluna de anexo em lugar nenhum. O anexo do cliente é
--    destruído na leitura: `gmail/mime.ts` pula toda parte com `filename`, e o
--    webhook do WhatsApp grava "[documento: contrato.pdf]" sem guardar o id da
--    mídia — e o link da Meta expira, então o arquivo fica irrecuperável.
-- 2. NENHUM bucket está em migration. Não há uma linha de `storage.` no
--    diretório inteiro. Ambiente novo sobe e toda geração de proposta falha.
-- 3. As políticas de `documentos` são mais estreitas que a de `negocios`:
--    param em "admin OU sou o responsável" e não têm a cláusula do pool. Lead
--    sem dono no funil do SDR — que é o caso NORMAL lá — teria anexo ilegível
--    para o próprio SDR.

-- ---------------------------------------------------------------------------
-- 1) Os buckets, onde deveriam estar desde sempre.
-- ---------------------------------------------------------------------------
-- `on conflict do nothing` porque eles JÁ existem em produção, criados na mão:
-- esta migration é para o ambiente novo, e não pode mexer nos 36 arquivos de
-- `documentos` nem nos 4 de `assinatura-publica` que estão lá.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('documentos', 'documentos', false, 20971520),
  ('assinatura-publica', 'assinatura-publica', true, 20971520)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) A tabela de anexos.
-- ---------------------------------------------------------------------------
create table if not exists public.anexos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  -- A mensagem que trouxe o arquivo. Nulo quando alguém anexa direto no card.
  mensagem_id uuid references public.mensagens(id) on delete cascade,

  nome text not null,
  mime text,
  tamanho bigint,

  -- Caminho no bucket `documentos`, no formato `tenant/negocio/anexos/...`.
  -- O segundo segmento TEM que ser o id do negócio: é por ele que as políticas
  -- do bucket casam (`storage.foldername(name)[2]`).
  caminho text unique,

  origem text not null check (origem in ('gmail', 'whatsapp', 'upload', 'proposta')),

  -- `attachmentId` do Gmail ou id da mídia na Meta. Fica gravado MESMO quando o
  -- download falha — é o que torna a busca retentável. Sem ele, uma falha de
  -- rede no meio do webhook perderia o arquivo para sempre, porque o link da
  -- Meta expira.
  externo_id text,
  baixado_em timestamptz,
  erro text,

  criado_em timestamptz not null default now()
);

comment on table public.anexos is
  'Arquivos trocados com o cliente. `caminho` nulo = ainda não baixado; o par '
  '(externo_id, erro) diz por quê e permite tentar de novo.';

create index if not exists anexos_negocio_idx on public.anexos (negocio_id, criado_em desc);
create index if not exists anexos_mensagem_idx on public.anexos (mensagem_id);
-- A trava contra gravar o mesmo anexo duas vezes numa reentrega do provedor.
create unique index if not exists anexos_externo_idx
  on public.anexos (mensagem_id, externo_id)
  where externo_id is not null;

alter table public.anexos enable row level security;

-- Mesma delegação que `mensagens` usa: quem enxerga o negócio enxerga o anexo.
-- Escrever a regra de novo aqui seria a segunda verdade que diverge.
drop policy if exists anexos_select on public.anexos;
drop policy if exists anexos_insert on public.anexos;
drop policy if exists anexos_delete on public.anexos;

create policy anexos_select on public.anexos
  for select using (exists (select 1 from public.negocios n where n.id = negocio_id));
create policy anexos_insert on public.anexos
  for insert with check (exists (select 1 from public.negocios n where n.id = negocio_id));
create policy anexos_delete on public.anexos
  for delete using (exists (select 1 from public.negocios n where n.id = negocio_id));

-- ---------------------------------------------------------------------------
-- 3) A cláusula do pool nas políticas de `documentos`.
-- ---------------------------------------------------------------------------
-- Espelha `negocios_select` termo a termo. O terceiro OR é o que falta hoje:
-- lead sem dono, no funil do meu papel.
drop policy if exists documentos_select on storage.objects;
drop policy if exists documentos_insert on storage.objects;
drop policy if exists documentos_update on storage.objects;

create policy documentos_select on storage.objects
  for select using (
    bucket_id = 'documentos'
    and exists (
      select 1 from public.negocios n
       where n.id::text = (storage.foldername(name))[2]
         and n.tenant_id = (select public.usuario_tenant_id())
         and (
           (select public.usuario_role()) = 'admin'
           or n.responsavel_id = (select auth.uid())
           or (n.responsavel_id is null and n.pipeline_id in (select public.pipelines_do_meu_papel()))
         )
    )
  );

create policy documentos_insert on storage.objects
  for insert with check (
    bucket_id = 'documentos'
    and exists (
      select 1 from public.negocios n
       where n.id::text = (storage.foldername(name))[2]
         and n.tenant_id = (select public.usuario_tenant_id())
         and (
           (select public.usuario_role()) = 'admin'
           or n.responsavel_id = (select auth.uid())
           or (n.responsavel_id is null and n.pipeline_id in (select public.pipelines_do_meu_papel()))
         )
    )
  );

create policy documentos_update on storage.objects
  for update using (
    bucket_id = 'documentos'
    and exists (
      select 1 from public.negocios n
       where n.id::text = (storage.foldername(name))[2]
         and n.tenant_id = (select public.usuario_tenant_id())
         and (
           (select public.usuario_role()) = 'admin'
           or n.responsavel_id = (select auth.uid())
           or (n.responsavel_id is null and n.pipeline_id in (select public.pipelines_do_meu_papel()))
         )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Fechar a escrita anônima no bucket público.
-- ---------------------------------------------------------------------------
-- As duas políticas abaixo estavam no papel `{public}` — que inclui `anon` — e
-- a única condição era o nome do bucket. Ou seja: qualquer um de posse da chave
-- anônima subia arquivo, e SOBRESCREVIA um PDF já assinado, num bucket servido
-- publicamente.
--
-- E não eram necessárias: os dois únicos gravadores deste bucket
-- (`propostas/[id]/enviar` e `assinar/[token]`) usam o cliente de service role,
-- que ignora RLS. O SELECT continua, porque é o que serve o PDF para quem tem
-- o link de assinatura.
--
-- O `get_advisors` não pega isto.
drop policy if exists assinatura_publica_insert_auth on storage.objects;
drop policy if exists assinatura_publica_update_auth on storage.objects;
