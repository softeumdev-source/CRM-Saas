-- ---------------------------------------------------------------------------
-- A reserva da fila passa a valer para os dois canais, e o WhatsApp so passa
-- se couber no freio.
--
-- `reservada_em` existe por causa da contagem: para saber quantas mensagens
-- sairam na ultima hora, a data certa e a da RESERVA (quando a mensagem foi
-- entregue ao provedor), nao a da criacao — ela pode ter ficado dias esperando
-- aprovacao — nem so a de envio bem-sucedido, porque uma tentativa que falhou
-- tambem consumiu reputacao do numero.
--
-- ARMADILHA QUE O TESTE PEGOU: a regra de espacamento por lead olha uma
-- mensagem anterior JA reservada. Numa reserva unica, nenhuma candidata tem
-- `reservada_em` ainda — entao tres mensagens para o mesmo lead passavam as
-- tres, juntas, e a pessoa receberia as tres de uma vez. Reservou 4 quando o
-- certo eram 2. Faltava a regra DENTRO do lote: `distinct on (negocio_id)`, no
-- maximo uma por lead por rodada. Como o despachante roda de 5 em 5 minutos e a
-- janela por lead e de horas, as duas juntas dao a garantia inteira.
--
-- `distinct on` nao convive com `for update`, entao a escolha e feita numa CTE
-- e a trava vem depois, num select simples sobre `mensagens`.
-- ---------------------------------------------------------------------------

alter table public.mensagens add column if not exists reservada_em timestamptz;

create index if not exists mensagens_reservadas_idx
  on public.mensagens (tenant_id, reservada_em desc)
  where canal = 'whatsapp' and reservada_em is not null;

-- Quanto ainda cabe no freio deste tenant, agora. Negativo vira zero.
create or replace function public.whatsapp_folga(p_tenant uuid)
returns int
language sql stable security definer set search_path to ''
as $$
  select greatest(0, least(
    c.limite_por_hora - (select count(*) from public.mensagens m
       where m.tenant_id = c.tenant_id and m.canal = 'whatsapp'
         and m.reservada_em > now() - interval '1 hour'),
    c.limite_por_dia - (select count(*) from public.mensagens m
       where m.tenant_id = c.tenant_id and m.canal = 'whatsapp'
         and m.reservada_em > now() - interval '1 day')
  ))::int
  from public.whatsapp_config c
  where c.tenant_id = p_tenant and not c.pausado;
$$;

-- Este limite protege a PESSOA, e nao o numero: mesmo com folga de sobra no
-- teto por hora, mandar duas mensagens seguidas para quem nao respondeu e o
-- caminho mais curto para o botao de bloquear.
create or replace function public.whatsapp_lead_em_espera(p_tenant uuid, p_negocio uuid, p_mensagem uuid)
returns boolean
language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.mensagens anterior
      join public.whatsapp_config c on c.tenant_id = p_tenant
     where anterior.negocio_id = p_negocio and anterior.canal = 'whatsapp'
       and anterior.id <> p_mensagem
       and anterior.reservada_em > now() - make_interval(hours => c.horas_entre_mensagens_por_lead)
  );
$$;

create or replace function public.reservar_mensagens(p_limite int default 20)
returns setof public.mensagens
language plpgsql security definer set search_path to ''
as $$
declare
  v_teto int := greatest(coalesce(p_limite, 20), 1);
begin
  -- 1. E-mail: sem freio de canal.
  return query
  with candidatas as (
    select m.id from public.mensagens m
     where m.canal = 'email'
       and ((m.status = 'aprovada' and m.agendada_para <= now())
            or (m.status = 'enviando' and m.reservada_em < now() - interval '10 minutes'))
     order by m.agendada_para limit v_teto
     for update skip locked
  )
  update public.mensagens m
     set status = 'enviando', tentativas = m.tentativas + 1, reservada_em = now()
    from candidatas c where m.id = c.id
  returning m.*;

  -- 2. WhatsApp: uma por lead por rodada, dentro da folga do freio.
  return query
  with elegiveis as (
    select distinct on (m.negocio_id) m.id, m.agendada_para
      from public.mensagens m
     where m.canal = 'whatsapp'
       and ((m.status = 'aprovada' and m.agendada_para <= now())
            or (m.status = 'enviando' and m.reservada_em < now() - interval '10 minutes'))
       and public.whatsapp_folga(m.tenant_id) > 0
       and not public.whatsapp_lead_em_espera(m.tenant_id, m.negocio_id, m.id)
     order by m.negocio_id, m.agendada_para
  ),
  limitadas as (
    select e.id from elegiveis e order by e.agendada_para
     limit least(v_teto, coalesce((select max(public.whatsapp_folga(t.id)) from public.tenants t), 0))
  ),
  travadas as (
    select m.id from public.mensagens m
     where m.id in (select id from limitadas)
     for update skip locked
  )
  update public.mensagens m
     set status = 'enviando', tentativas = m.tentativas + 1, reservada_em = now()
    from travadas t where m.id = t.id
  returning m.*;
end;
$$;

revoke execute on function public.reservar_mensagens(int) from public, anon, authenticated;
grant execute on function public.reservar_mensagens(int) to service_role;
revoke execute on function public.whatsapp_folga(uuid) from public, anon, authenticated;
revoke execute on function public.whatsapp_lead_em_espera(uuid, uuid, uuid) from public, anon, authenticated;

-- O desfecho passa a guardar o codigo de erro do provedor e, no WhatsApp, a
-- chamar o monitor logo depois.
create or replace function public.concluir_envio(
  p_id uuid, p_ok boolean, p_provedor_id text default null,
  p_erro text default null, p_erro_codigo text default null
)
returns text
language plpgsql security definer set search_path to ''
as $$
declare
  v_tentativas int; v_canal text; v_tenant uuid;
begin
  select tentativas, canal, tenant_id into v_tentativas, v_canal, v_tenant
    from public.mensagens where id = p_id;
  if not found then return 'inexistente'; end if;

  if p_ok then
    update public.mensagens
       set status='enviada', enviada_em=now(), provedor_id=p_provedor_id, ultimo_erro=null, erro_codigo=null
     where id = p_id;
    if v_canal = 'whatsapp' then perform public.whatsapp_avaliar_bloqueio(v_tenant); end if;
    return 'enviada';
  end if;

  if v_tentativas >= 5 then
    update public.mensagens set status='falhou', ultimo_erro=p_erro, erro_codigo=p_erro_codigo where id=p_id;
    if v_canal = 'whatsapp' then perform public.whatsapp_avaliar_bloqueio(v_tenant); end if;
    return 'falhou';
  end if;

  update public.mensagens
     set status='aprovada', ultimo_erro=p_erro, erro_codigo=p_erro_codigo,
         proxima_tentativa_em = now() + make_interval(mins => power(2, v_tentativas)::int),
         agendada_para = now() + make_interval(mins => power(2, v_tentativas)::int)
   where id = p_id;
  return 'reagendada';
end;
$$;

revoke execute on function public.concluir_envio(uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.concluir_envio(uuid, boolean, text, text, text) to service_role;
drop function if exists public.concluir_envio(uuid, boolean, text, text);
