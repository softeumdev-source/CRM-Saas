-- ---------------------------------------------------------------------------
-- Duas pecas que a entrada de mensagem precisa antes de existir.
--
-- 1) O NONO DIGITO. A Meta devolve `wa_id` em E.164 sem `+`, e para numero BR
--    frequentemente SEM o nono digito (551187654321), enquanto o contato foi
--    digitado com ele ((11) 98765-4321). Igualdade de string falha, e o CRM
--    diria "contato desconhecido" para o cliente que acabou de escrever.
--
--    A chave descarta o nono digito DE PROPOSITO, para que as duas grafias
--    colidam. Descarta na CHAVE, nunca no dado: normalizar `contatos.whatsapp`
--    no armazenamento seria migracao destrutiva num campo que gente edita, com
--    ganho zero — o indice funcional resolve.
--
-- 2) A QUARENTENA. A RLS de `mensagens` exige
--    `exists (select 1 from negocios where id = negocio_id)` — e isso vale
--    tambem para o SELECT. Ou seja, uma linha com `negocio_id` nulo seria
--    gravavel pelo `service_role` e ILEGIVEL PARA TODO MUNDO, PARA SEMPRE,
--    ainda ocupando a `idempotency_key` e impedindo que a mesma mensagem fosse
--    gravada certo depois. Entao mensagem que nao casa com negocio nao entra
--    em `mensagens`: fica aqui, e SEM CORPO.
-- ---------------------------------------------------------------------------

create or replace function public.telefone_chave(p text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  with d as (
    select regexp_replace(p, '[^0-9]', '', 'g') as n
  ), com_pais as (
    select case
      -- So prefixa 55 quando o numero PARECE brasileiro sem o pais:
      --  * 11 digitos com o 3o digito = 9  -> movel (DDD + 9XXXXXXXX)
      --  * 10 digitos                      -> fixo  (DDD + XXXXXXXX)
      --
      -- Sem a checagem do 9, um numero de 11 digitos dos EUA (12125551234)
      -- ganhava 55 na frente e virava um brasileiro FALSO — que ainda podia
      -- colidir com um (12) 2555-1234 de verdade. Foi o teste que pegou isso;
      -- a versao anterior deste arquivo AFIRMAVA que numero estrangeiro passava
      -- inteiro, e nao passava.
      when length(n) = 11 and left(n, 2) <> '55' and substr(n, 3, 1) = '9' then '55' || n
      when length(n) = 10 and left(n, 2) <> '55' then '55' || n
      else n
    end as n from d
  )
  select case
    -- So mexe em numero BR de 12 ou 13 digitos: 55 + DDD + os ultimos 8. Assim
    -- 5511987654321 e 551187654321 dao a MESMA chave.
    -- Numero estrangeiro passa inteiro, sem mutilar.
    when left(n, 2) = '55' and length(n) in (12, 13) then left(n, 4) || right(n, 8)
    else nullif(n, '')
  end
  from com_pais;
$$;

comment on function public.telefone_chave(text) is
  'Chave canonica de telefone para CASAMENTO, nao para exibicao. Descarta o nono digito '
  'de proposito: a Meta manda o numero sem ele e o contato costuma estar com ele. '
  'LIMITE CONHECIDO: um numero de 10 digitos sem pais e lido como fixo brasileiro — num '
  'CRM brasileiro isso acerta em praticamente todo caso, e nao ha como distinguir de um '
  'numero estrangeiro de 10 digitos sem mais contexto.';

-- Os primeiros indices que `contatos` ganha para casar remetente. Antes nao
-- havia nenhum: a resolucao seria varredura sem garantia de unicidade.
create index if not exists contatos_whatsapp_chave_idx
  on public.contatos (public.telefone_chave(whatsapp))
  where whatsapp is not null and btrim(whatsapp) <> '';

-- Dois indices, e nao um sobre `coalesce`, porque `processar_cadencias` ja usa
-- `coalesce(nullif(whatsapp,''), telefone)` como destino: a busca de entrada
-- tem que aceitar as duas colunas do mesmo jeito.
create index if not exists contatos_telefone_chave_idx
  on public.contatos (public.telefone_chave(telefone))
  where telefone is not null and btrim(telefone) <> '';

create index if not exists contatos_email_normalizado_idx
  on public.contatos (lower(btrim(email)))
  where email is not null;

create table if not exists public.mensagens_sem_negocio (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  /** De quem e a caixa por onde isto chegou. */
  usuario_id uuid references public.usuarios(id) on delete set null,
  canal text not null check (canal in ('email', 'whatsapp')),
  remetente text not null,
  assunto text,
  /** Message-ID do e-mail ou wamid da Meta. Impede gravar duas vezes. */
  externo_id text unique,
  thread_externo text,
  recebida_em timestamptz,
  motivo text not null check (motivo in ('sem_negocio', 'ambiguo')),
  /** Os negocios que empataram, para a tela oferecer a escolha. */
  candidatos jsonb,
  resolvido_negocio_id uuid references public.negocios(id) on delete set null,
  resolvido_em timestamptz,
  criado_em timestamptz not null default now()
);

comment on table public.mensagens_sem_negocio is
  'Quarentena de mensagem recebida que nao casou com um negocio. SEM COLUNA DE CORPO, '
  'de proposito: o CRM nao vira espelho da caixa pessoal de ninguem. O corpo e buscado '
  'no provedor no momento em que alguem associa a mensagem a um negocio.';

create index if not exists mensagens_sem_negocio_pendentes_idx
  on public.mensagens_sem_negocio (tenant_id, criado_em desc)
  where resolvido_em is null;

alter table public.mensagens_sem_negocio enable row level security;

-- Quem ve: o admin do tenant, ou o dono da caixa por onde a mensagem chegou.
create policy mensagens_sem_negocio_select on public.mensagens_sem_negocio
  for select using (
    tenant_id = (select public.usuario_tenant_id())
    and ((select public.usuario_role()) = 'admin' or usuario_id = (select auth.uid()))
  );

-- Associar a um negocio e um UPDATE, e a autorizacao e da RLS, nao de um `if`:
-- o `exists` sobre `negocios` e filtrado pela policy de `negocios`, entao so
-- passa se voce ENXERGA o negocio de destino. Nao precisa de RPC para isso —
-- uma RPC `security definer` aqui DESLIGARIA a checagem que sai de graca.
create policy mensagens_sem_negocio_update on public.mensagens_sem_negocio
  for update using (
    tenant_id = (select public.usuario_tenant_id())
    and ((select public.usuario_role()) = 'admin' or usuario_id = (select auth.uid()))
  ) with check (
    resolvido_negocio_id is null
    or exists (select 1 from public.negocios n where n.id = resolvido_negocio_id)
  );
