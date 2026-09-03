-- ---------------------------------------------------------------------------
-- A reserva da fila: quem o despachante pode enviar agora.
--
-- Marca como 'enviando' ANTES de devolver, dentro da mesma transacao, com
-- `skip locked`. Duas instancias da rota rodando ao mesmo tempo (a Vercel pode
-- muito bem invocar duas) pegam lotes diferentes em vez de enviarem a mesma
-- mensagem duas vezes.
--
-- Tambem destrava o que ficou preso: se a rota morreu no meio (timeout, deploy,
-- lambda derrubada), a mensagem ficaria 'enviando' para sempre e nunca mais
-- seria tentada. Depois de 10 minutos ela volta para a fila. O risco oposto —
-- reenviar algo que na verdade saiu — e limitado pelo Resend responder rapido;
-- 10 minutos e folga suficiente para nao pegar um envio em andamento.
-- ---------------------------------------------------------------------------

create or replace function public.reservar_mensagens(p_limite int default 20)
returns setof public.mensagens
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
  with candidatas as (
    select m.id
      from public.mensagens m
     where m.canal = 'email'
       and (
         (m.status = 'aprovada' and m.agendada_para <= now())
         -- presas: a rota caiu antes de dar o desfecho
         or (m.status = 'enviando' and m.criado_em < now() - interval '10 minutes')
       )
     order by m.agendada_para
     limit greatest(coalesce(p_limite, 20), 1)
     for update skip locked
  )
  update public.mensagens m
     set status = 'enviando',
         tentativas = m.tentativas + 1
    from candidatas c
   where m.id = c.id
  returning m.*;
end;
$$;

revoke execute on function public.reservar_mensagens(int) from public, anon, authenticated;
grant execute on function public.reservar_mensagens(int) to service_role;

-- ---------------------------------------------------------------------------
-- O desfecho de uma tentativa. Fica no banco, e nao na rota, porque a regra de
-- backoff e de desistencia e a mesma para qualquer chamador e nao deve ser
-- reescrita a cada lugar que envia.
--
-- Falha nao vira 'falhou' na primeira: volta para 'aprovada' com espera
-- dobrando (2, 4, 8, 16 minutos). So na quinta tentativa desiste — ai o erro
-- fica gravado e visivel, em vez de a mensagem sumir.
-- ---------------------------------------------------------------------------

create or replace function public.concluir_envio(
  p_id uuid,
  p_ok boolean,
  p_provedor_id text default null,
  p_erro text default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tentativas int;
begin
  select tentativas into v_tentativas from public.mensagens where id = p_id;
  if not found then
    return 'inexistente';
  end if;

  if p_ok then
    update public.mensagens
       set status = 'enviada', enviada_em = now(), provedor_id = p_provedor_id, ultimo_erro = null
     where id = p_id;
    return 'enviada';
  end if;

  if v_tentativas >= 5 then
    update public.mensagens
       set status = 'falhou', ultimo_erro = p_erro
     where id = p_id;
    return 'falhou';
  end if;

  update public.mensagens
     set status = 'aprovada',
         ultimo_erro = p_erro,
         proxima_tentativa_em = now() + make_interval(mins => power(2, v_tentativas)::int),
         agendada_para = now() + make_interval(mins => power(2, v_tentativas)::int)
   where id = p_id;
  return 'reagendada';
end;
$$;

revoke execute on function public.concluir_envio(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.concluir_envio(uuid, boolean, text, text) to service_role;
