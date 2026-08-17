-- ---------------------------------------------------------------------------
-- A numeracao era feita no app com count(*) + 1: apagar uma proposta fazia o
-- contador voltar e o numero se repetir. Numero repetido no mesmo negocio =
-- mesmo caminho no storage (upsert) = documento duplicado/sobrescrito.
-- Agora o numero e a versao sao atribuidos pelo banco, dentro da transacao do
-- insert, com lock por tenant.
-- ---------------------------------------------------------------------------

-- Resolve a duplicidade existente reaproveitando o numero 0002, que ficou livre.
update public.propostas
   set numero = '2026-0002'
 where id = '0d0d4d49-e5f5-431b-bccf-6d87566bc418'
   and numero = '2026-0005';

alter table public.propostas alter column numero set default '';

create or replace function public.propostas_definir_numero()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ano text := to_char(now(), 'YYYY');
  v_seq int;
begin
  if new.tenant_id is null then
    return new;
  end if;

  if new.numero is null or btrim(new.numero) = '' then
    perform pg_advisory_xact_lock(hashtext('proposta_numero:' || new.tenant_id::text));

    select coalesce(max(nullif(regexp_replace(split_part(numero, '-', 2), '[^0-9]', '', 'g'), '')::int), 0)
      into v_seq
      from public.propostas
     where tenant_id = new.tenant_id
       and numero like v_ano || '-%';

    new.numero := v_ano || '-' || lpad((v_seq + 1)::text, 4, '0');
  end if;

  if new.negocio_id is not null then
    select coalesce(max(versao), 0) + 1
      into new.versao
      from public.propostas
     where negocio_id = new.negocio_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_propostas_numero on public.propostas;
create trigger trg_propostas_numero
before insert on public.propostas
for each row execute function public.propostas_definir_numero();

create unique index if not exists propostas_tenant_numero_uidx
  on public.propostas (tenant_id, numero);
