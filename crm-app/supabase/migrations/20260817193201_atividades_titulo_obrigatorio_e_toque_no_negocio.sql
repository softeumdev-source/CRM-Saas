-- ---------------------------------------------------------------------------
-- 1. Titulo da atividade passa a ser obrigatorio (nao nulo e nao vazio)
-- ---------------------------------------------------------------------------
update public.atividades
   set titulo = 'Atividade sem titulo'
 where titulo is null or btrim(titulo) = '';

alter table public.atividades alter column titulo set not null;

alter table public.atividades drop constraint if exists atividades_titulo_preenchido;
alter table public.atividades
  add constraint atividades_titulo_preenchido check (btrim(titulo) <> '');

-- ---------------------------------------------------------------------------
-- 2. Quando a atividade foi efetivamente concluida
-- ---------------------------------------------------------------------------
alter table public.atividades add column if not exists concluida_em timestamptz;

update public.atividades
   set concluida_em = criado_em
 where concluida is true and concluida_em is null;

create or replace function public.atividades_sincronizar_conclusao()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.concluida is true and new.concluida_em is null then
    new.concluida_em := now();
  elsif new.concluida is not true then
    new.concluida_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_atividades_conclusao on public.atividades;
create trigger trg_atividades_conclusao
before insert or update on public.atividades
for each row execute function public.atividades_sincronizar_conclusao();

-- ---------------------------------------------------------------------------
-- 3. Toda atividade registrada/concluida "toca" o negocio:
--    negocios.ultima_atividade_em passa a refletir o contato mais recente.
--    E o que faz a bolinha do card ficar verde e o card ir para o fim da coluna.
-- ---------------------------------------------------------------------------
create or replace function public.atividades_tocar_negocio()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_quando timestamptz;
begin
  if new.negocio_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_quando := coalesce(new.concluida_em, new.criado_em, now());
  elsif new.concluida is distinct from old.concluida and new.concluida is true then
    v_quando := coalesce(new.concluida_em, now());
  else
    return new;
  end if;

  update public.negocios
     set ultima_atividade_em = greatest(coalesce(ultima_atividade_em, v_quando), v_quando),
         atualizado_em = now()
   where id = new.negocio_id;

  return new;
end;
$$;

drop trigger if exists trg_atividades_tocar_negocio on public.atividades;
create trigger trg_atividades_tocar_negocio
after insert or update on public.atividades
for each row execute function public.atividades_tocar_negocio();

-- ---------------------------------------------------------------------------
-- 4. Backfill: negocios que ja tinham atividades mas ficaram com a bolinha laranja
-- ---------------------------------------------------------------------------
update public.negocios n
   set ultima_atividade_em = a.ultima
  from (
    select negocio_id, max(coalesce(concluida_em, criado_em)) as ultima
      from public.atividades
     where negocio_id is not null
     group by negocio_id
  ) a
 where a.negocio_id = n.id
   and (n.ultima_atividade_em is null or n.ultima_atividade_em < a.ultima);

-- ---------------------------------------------------------------------------
-- 5. Indices de agenda (proximos passos por negocio e por vendedor)
-- ---------------------------------------------------------------------------
create index if not exists atividades_agenda_negocio_idx
  on public.atividades (negocio_id, data_agendada)
  where concluida is not true and data_agendada is not null;

create index if not exists atividades_agenda_usuario_idx
  on public.atividades (usuario_id, data_agendada)
  where concluida is not true and data_agendada is not null;

create index if not exists negocios_ultima_atividade_idx
  on public.negocios (tenant_id, ultima_atividade_em desc nulls first);
