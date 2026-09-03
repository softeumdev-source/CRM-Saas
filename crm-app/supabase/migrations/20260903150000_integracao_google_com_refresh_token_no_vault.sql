-- ---------------------------------------------------------------------------
-- Conexao de cada pessoa com a conta Google dela.
--
-- A decisao que importa aqui e onde fica o refresh token. Ele NAO e uma
-- credencial qualquer: e permanente ate ser revogado, e vale por acesso
-- continuo a agenda e (na etapa seguinte) ao envio de e-mail em nome da
-- pessoa. Numa coluna comum ele estaria em texto puro, visivel para qualquer
-- backup, dump ou consulta de admin, e exposto pelo PostgREST no dia em que
-- alguem esquecesse uma policy.
--
-- Entao ele vai para o `vault`, e esta tabela guarda so o ID do segredo. O
-- schema `vault` nao e exposto pela API, e as funcoes abaixo sao as unicas
-- portas — todas SECURITY DEFINER e concedidas SO ao service_role, ou seja,
-- alcancaveis apenas pelo servidor, nunca pelo navegador.
--
-- Conferido no banco: guardar e ler devolve o mesmo valor; reconectar ATUALIZA
-- o segredo no lugar (mesmo id, nenhum orfao no vault); o token nao aparece em
-- nenhuma coluna da tabela; e um usuario `authenticated` nao consegue chamar a
-- funcao de leitura.
--
-- O access token nao e guardado em lugar nenhum: ele vale uma hora e sai barato
-- pedir outro a cada uso. Guardar um bearer token para economizar uma chamada
-- e trocar seguranca por quase nada.
-- ---------------------------------------------------------------------------

create table if not exists public.integracoes_google (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  usuario_id uuid not null unique references public.usuarios(id) on delete cascade,
  email_google text not null,
  escopos text[] not null default '{}',
  -- ponteiro para vault.secrets; o token em si nunca passa por aqui
  refresh_token_id uuid,
  conectado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  ultimo_erro text
);

comment on table public.integracoes_google is
  'Conexao Google por usuario. O refresh token vive no vault; aqui fica so o id do segredo.';

alter table public.integracoes_google enable row level security;

create policy google_select on public.integracoes_google
  for select using (
    usuario_id = (select auth.uid())
    or ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()))
  );
create policy google_delete on public.integracoes_google
  for delete using (
    usuario_id = (select auth.uid())
    or ((select public.usuario_role()) = 'admin' and tenant_id = (select public.usuario_tenant_id()))
  );

alter table public.integracoes_google replica identity full;

create or replace function public.google_guardar_refresh_token(
  p_usuario_id uuid,
  p_email text,
  p_refresh_token text,
  p_escopos text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tenant uuid;
  v_secret_id uuid;
  v_nome text := 'google_refresh_' || p_usuario_id::text;
begin
  select tenant_id into v_tenant from public.usuarios where id = p_usuario_id;
  if v_tenant is null then
    raise exception 'usuario nao encontrado';
  end if;

  select refresh_token_id into v_secret_id
    from public.integracoes_google where usuario_id = p_usuario_id;

  -- Reconectar nao pode acumular segredo orfao no vault.
  if v_secret_id is not null and exists (select 1 from vault.secrets s where s.id = v_secret_id) then
    perform vault.update_secret(v_secret_id, p_refresh_token, v_nome, 'Google refresh token');
  else
    v_secret_id := vault.create_secret(p_refresh_token, v_nome, 'Google refresh token');
  end if;

  insert into public.integracoes_google (
    tenant_id, usuario_id, email_google, escopos, refresh_token_id, atualizado_em, ultimo_erro
  ) values (
    v_tenant, p_usuario_id, p_email, coalesce(p_escopos, '{}'), v_secret_id, now(), null
  )
  on conflict (usuario_id) do update
    set email_google = excluded.email_google,
        escopos = excluded.escopos,
        refresh_token_id = excluded.refresh_token_id,
        atualizado_em = now(),
        ultimo_erro = null;

  return v_secret_id;
end;
$$;

revoke execute on function public.google_guardar_refresh_token(uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.google_guardar_refresh_token(uuid, text, text, text[]) to service_role;

create or replace function public.google_obter_refresh_token(p_usuario_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_token text;
begin
  select s.decrypted_secret into v_token
    from public.integracoes_google g
    join vault.decrypted_secrets s on s.id = g.refresh_token_id
   where g.usuario_id = p_usuario_id;
  return v_token;
end;
$$;

revoke execute on function public.google_obter_refresh_token(uuid) from public, anon, authenticated;
grant execute on function public.google_obter_refresh_token(uuid) to service_role;

-- Registra falha de renovacao (token revogado do lado da Google, por exemplo),
-- para a tela poder dizer "reconecte" em vez de so falhar em silencio.
create or replace function public.google_registrar_erro(p_usuario_id uuid, p_erro text)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.integracoes_google
     set ultimo_erro = p_erro, atualizado_em = now()
   where usuario_id = p_usuario_id;
$$;

revoke execute on function public.google_registrar_erro(uuid, text) from public, anon, authenticated;
grant execute on function public.google_registrar_erro(uuid, text) to service_role;
