-- ---------------------------------------------------------------------------
-- negocios.pipeline_id deixa de depender de quem escreve.
--
-- A coluna e desnormalizada de proposito (o filtro de realtime do Supabase nao
-- atravessa join, e etapa_id e nulavel), mas coluna desnormalizada mantida na
-- mao diverge — basta um insert que esqueca dela para o negocio sumir do
-- board. Entao o banco passa a manter, e o app nunca precisa escrever.
--
-- Duas fontes de divergencia, uma trigger para cada:
--   1. o negocio muda de etapa  -> pipeline_id segue a etapa nova;
--   2. a etapa muda de pipeline -> todos os negocios dela seguem junto.
--
-- Nenhuma das duas e SECURITY DEFINER, e a busca da etapa e presa ao
-- tenant_id do proprio negocio: uma etapa de outro tenant nao consegue
-- definir o pipeline daqui nem por RLS desligada.
--
-- Quando etapa_id fica NULL o pipeline_id ANTERIOR e preservado: perder a
-- etapa nao tira o negocio do funil, so o tira da coluna.
-- ---------------------------------------------------------------------------

create or replace function public.negocios_definir_pipeline()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_pipeline uuid;
begin
  if new.etapa_id is null then
    -- Sem etapa nao ha o que deduzir: mantem o pipeline que o negocio ja tinha.
    if tg_op = 'UPDATE' then
      new.pipeline_id := coalesce(new.pipeline_id, old.pipeline_id);
    end if;
    return new;
  end if;

  select e.pipeline_id
    into v_pipeline
    from public.etapas_pipeline e
   where e.id = new.etapa_id
     and e.tenant_id = new.tenant_id;

  new.pipeline_id := coalesce(v_pipeline, new.pipeline_id);
  return new;
end;
$$;

revoke execute on function public.negocios_definir_pipeline() from anon, authenticated;

drop trigger if exists trg_negocios_pipeline on public.negocios;
create trigger trg_negocios_pipeline
  before insert or update of etapa_id on public.negocios
  for each row execute function public.negocios_definir_pipeline();


create or replace function public.etapas_pipeline_propagar_pipeline()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  update public.negocios
     set pipeline_id = new.pipeline_id
   where etapa_id = new.id
     and pipeline_id is distinct from new.pipeline_id;
  return new;
end;
$$;

revoke execute on function public.etapas_pipeline_propagar_pipeline() from anon, authenticated;

drop trigger if exists trg_etapas_pipeline_propagar on public.etapas_pipeline;
create trigger trg_etapas_pipeline_propagar
  after update of pipeline_id on public.etapas_pipeline
  for each row when (new.pipeline_id is distinct from old.pipeline_id)
  execute function public.etapas_pipeline_propagar_pipeline();
