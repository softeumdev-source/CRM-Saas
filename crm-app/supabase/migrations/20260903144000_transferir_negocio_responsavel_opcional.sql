-- ---------------------------------------------------------------------------
-- `p_responsavel_id` ganha DEFAULT NULL em transferir_negocio_de_funil().
--
-- Sem o default, o parametro e obrigatorio, e "entregar sem dono" (o lead cai
-- no pool do funil de destino) so era expressavel mandando null explicito. Os
-- tipos gerados do Supabase nao modelam argumento nulavel, entao o TypeScript
-- recusava justamente o caso que a funcao trata de proposito.
--
-- Com o default, omitir o parametro E deixar no pool — a mesma coisa dita de
-- um jeito que o cliente consegue escrever. O corpo da funcao nao muda; a
-- versao integral esta em 20260903133000_rpc_transferir_negocio_de_funil.sql.
-- ---------------------------------------------------------------------------

create or replace function public.transferir_negocio_de_funil(
  p_negocio_id uuid,
  p_etapa_destino_id uuid,
  p_responsavel_id uuid default null,
  p_titulo text default null,
  p_descricao text default null
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
