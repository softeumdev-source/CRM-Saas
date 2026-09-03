-- ---------------------------------------------------------------------------
-- A passagem de um negocio entre funis vira uma RPC.
--
-- Por que nao da para fazer por policy: num UPDATE, o Postgres exige que a
-- linha NOVA tambem passe na policy de SELECT. Entregar o lead troca o dono,
-- e a partir dai a linha deixa de ser visivel para quem entregou — entao o
-- proprio banco recusa:
--
--     new row violates row-level security policy for table "negocios"
--
-- Comprovado no banco: com `negocios_select` derrubada, a mesma entrega passa;
-- com um `with check (true)` no `negocios_update`, continua falhando. Ou seja,
-- o bloqueio nunca esteve no WITH CHECK — e nenhuma policy de UPDATE resolveria.
--
-- Afrouxar o SELECT seria o remedio errado: daria ao SDR visao do funil inteiro
-- do vendedor, que e exatamente o que a Fase 4.1 fechou. Entao a travessia
-- passa por uma funcao que confere a autorizacao ela mesma:
--
--   1. o negocio tem que ser do meu tenant;
--   2. tenho que poder mexer nele (admin, ou dono, ou esta no pool do funil que
--      eu opero) — as mesmas regras do `negocios_update`;
--   3. o funil de destino tem que ser VIZINHO do meu: ou o destino do meu
--      (entrega SDR -> vendedor) ou aquele cujo destino e o meu (no-show
--      voltando vendedor -> SDR).
--
-- Nada de tenant cruzado: todo lookup aqui dentro filtra por tenant na mao,
-- porque SECURITY DEFINER nao passa pela RLS.
--
-- De quebra, a troca de etapa e o registro na cadencia viram uma transacao so.
-- Do lado do cliente eram dois writes, e o segundo podia falhar sozinho.
-- ---------------------------------------------------------------------------

create or replace function public.transferir_negocio_de_funil(
  p_negocio_id uuid,
  p_etapa_destino_id uuid,
  p_responsavel_id uuid,
  p_titulo text,
  p_descricao text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.usuario_role();
  v_tenant uuid := public.usuario_tenant_id();
  v_negocio record;
  v_etapa record;
  v_vizinho boolean;
begin
  if v_uid is null or v_tenant is null then
    raise exception 'sem sessao';
  end if;

  select n.id, n.tenant_id, n.responsavel_id, n.pipeline_id, n.etapa_id
    into v_negocio
    from public.negocios n
   where n.id = p_negocio_id and n.tenant_id = v_tenant;
  if not found then
    raise exception 'negocio nao encontrado neste tenant';
  end if;

  if not (
    v_role = 'admin'
    or v_negocio.responsavel_id = v_uid
    or (
      v_negocio.responsavel_id is null
      and exists (
        select 1 from public.pipelines p
         where p.id = v_negocio.pipeline_id
           and p.tenant_id = v_tenant
           and p.role_operador = v_role
      )
    )
  ) then
    raise exception 'sem permissao sobre este negocio';
  end if;

  select e.id, e.pipeline_id, e.probabilidade, e.resultado, e.nome
    into v_etapa
    from public.etapas_pipeline e
   where e.id = p_etapa_destino_id and e.tenant_id = v_tenant;
  if not found then
    raise exception 'etapa de destino nao encontrada neste tenant';
  end if;

  select exists (
    select 1
      from public.pipelines meu
     where meu.tenant_id = v_tenant
       and meu.role_operador = v_role
       and (meu.pipeline_destino_id = v_etapa.pipeline_id
            or exists (
              select 1 from public.pipelines origem
               where origem.id = v_etapa.pipeline_id
                 and origem.pipeline_destino_id = meu.id
            ))
  ) into v_vizinho;

  if not v_vizinho and v_role <> 'admin' then
    raise exception 'o funil de destino nao e vizinho do seu';
  end if;

  if p_responsavel_id is not null and not exists (
    select 1 from public.usuarios u where u.id = p_responsavel_id and u.tenant_id = v_tenant
  ) then
    raise exception 'responsavel nao pertence a este tenant';
  end if;

  update public.negocios
     set etapa_id = v_etapa.id,
         pipeline_id = v_etapa.pipeline_id,
         responsavel_id = p_responsavel_id,
         probabilidade = coalesce(v_etapa.probabilidade, 10),
         ganho = case v_etapa.resultado when 'ganho' then true when 'perdido' then false else null end,
         retomar_em = null,
         atualizado_em = now()
   where id = p_negocio_id;

  insert into public.atividades (negocio_id, usuario_id, tipo, titulo, descricao)
  values (p_negocio_id, v_uid, 'mudanca_etapa',
          coalesce(nullif(btrim(p_titulo), ''), 'Negocio movido de funil'),
          p_descricao);

  return v_etapa.pipeline_id;
end;
$$;

revoke execute on function public.transferir_negocio_de_funil(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.transferir_negocio_de_funil(uuid, uuid, uuid, text, text) to authenticated;

-- Uma tentativa anterior tinha alargado o WITH CHECK de `negocios_update` com
-- uma clausula de "funil vizinho". Nao resolvia nada (o bloqueio era a policy
-- de SELECT) e so alargava a policy a toa. Volta ao que era: sem WITH CHECK
-- explicito, o Postgres reaproveita o USING.
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

drop function if exists public.funis_vizinhos_do_meu_papel();
