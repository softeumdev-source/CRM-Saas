-- ---------------------------------------------------------------------------
-- O papel `sdr` passa a existir, e o pool de leads deixa de ser global.
--
-- 1. Os CHECKs de `usuarios.role` e `convites.role` so aceitavam 'admin' e
--    'vendedor'. Sem isto nao ha como convidar um SDR.
--
-- 2. O problema que vem junto: as policies de `negocios` liberam
--    `responsavel_id IS NULL` para QUALQUER pessoa do tenant. Ou seja, no dia
--    em que o SDR criar os primeiros leads sem dono, todos eles apareceriam no
--    board do vendedor. O pool nunca foi global de verdade — ele e do FUNIL —,
--    so nao havia funil para amarrar.
--
--    Agora ha: `pipelines.role_operador` diz qual papel opera cada funil, e o
--    pool passa a ser "sem dono E no funil que eu opero". Para o vendedor de
--    hoje nada muda: o funil de vendas tem role_operador = 'vendedor'.
--
--    Negocio sem `pipeline_id` fica fora do pool de todo mundo (so o admin ve).
--    E falha segura de proposito: some da tela de quem nao deveria ver, em vez
--    de vazar para todo mundo. O gatilho `trg_negocios_pipeline` faz esse caso
--    nao acontecer.
--
-- Conferido com um funil de SDR de mentira e um lead sem dono dentro dele,
-- numa transacao revertida: o vendedor continuou vendo 25 negocios e ZERO do
-- SDR; o admin viu os 26.
-- ---------------------------------------------------------------------------

alter table public.usuarios drop constraint if exists usuarios_role_check;
alter table public.usuarios add constraint usuarios_role_check
  check (role = any (array['admin', 'vendedor', 'sdr']));

alter table public.convites drop constraint if exists convites_role_check;
alter table public.convites add constraint convites_role_check
  check (role = any (array['admin', 'vendedor', 'sdr']));

-- Os funis que o papel de quem esta consultando opera.
--
-- SECURITY INVOKER de proposito: ela e chamada de dentro de uma policy, entao
-- TEM que ser executavel por `authenticated` — nao adianta revogar. Como
-- `pipelines` tem RLS por tenant, o invoker ja da o recorte certo sozinho, sem
-- privilegio elevado e sem aviso do linter.
create or replace function public.pipelines_do_meu_papel()
returns setof uuid
language sql
stable
security invoker
set search_path to ''
as $$
  select p.id
    from public.pipelines p
   where p.role_operador = public.usuario_role();
$$;

drop policy if exists negocios_select on public.negocios;
create policy negocios_select on public.negocios
  for select using (
    tenant_id = (select public.usuario_tenant_id())
    and (
      (select public.usuario_role()) = 'admin'
      or responsavel_id = (select auth.uid())
      or (responsavel_id is null and pipeline_id in (select public.pipelines_do_meu_papel()))
    )
  );

drop policy if exists negocios_update on public.negocios;
create policy negocios_update on public.negocios
  for update using (
    tenant_id = (select public.usuario_tenant_id())
    and (
      (select public.usuario_role()) = 'admin'
      or responsavel_id = (select auth.uid())
      or (responsavel_id is null and pipeline_id in (select public.pipelines_do_meu_papel()))
    )
  );
