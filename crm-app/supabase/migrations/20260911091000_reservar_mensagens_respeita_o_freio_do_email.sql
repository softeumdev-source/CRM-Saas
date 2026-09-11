-- ---------------------------------------------------------------------------
-- `reservar_mensagens` passa a perguntar `email_folga` antes de pescar e-mail,
-- do mesmo jeito que ja pergunta `whatsapp_folga` antes de pescar WhatsApp.
--
-- A funcao abaixo e a versao que esta no banco (20260904340000), com APENAS o
-- bloco do e-mail alterado: entrou o `and public.email_folga(...) > 0` no where
-- e o `limit` deixou de ser o teto cru da rota.
--
-- O `limit` e o ponto que exige atencao. Antes:
--
--     limit v_teto                       -- 20, o LOTE da rota
--
-- Manter isso com o freio so no `where` NAO funcionaria: o `where` diz "ha
-- folga?" (sim/nao) e o `limit` diz "quantas" -- com folga de 1 e teto de 20, a
-- rodada pescaria 20. O freio precisa estar nos DOIS, e por isso o `limit`
-- passa a ser `least(v_teto, folga)`, exatamente como o bloco do WhatsApp ja
-- fazia.
--
-- O `max(...)` sobre `tenants` tambem e copia do bloco do WhatsApp, e tem a
-- mesma limitacao conhecida: com varios tenants, o teto global vira o do tenant
-- mais folgado. Ha um tenant. Nao vou consertar aqui um problema que nao existe
-- ainda e que mudaria o bloco do WhatsApp junto.
-- ---------------------------------------------------------------------------

create or replace function public.reservar_mensagens(p_limite integer default 20)
 returns setof public.mensagens
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_teto int := greatest(coalesce(p_limite, 20), 1);
begin
  return query
  with candidatas as (
    select m.id
      from public.mensagens m
     where m.canal = 'email'
       and not m.envio_manual
       and (
         (m.status = 'aprovada' and m.agendada_para <= now())
         or (m.status = 'enviando' and m.reservada_em < now() - interval '10 minutes')
       )
       and public.email_folga(m.tenant_id) > 0
     order by m.agendada_para
     limit least(v_teto, coalesce((select max(public.email_folga(t.id)) from public.tenants t), 0))
     for update skip locked
  )
  update public.mensagens m
     set status = 'enviando', tentativas = m.tentativas + 1, reservada_em = now()
    from candidatas c
   where m.id = c.id
  returning m.*;

  return query
  with elegiveis as (
    select distinct on (m.negocio_id) m.id, m.agendada_para
      from public.mensagens m
     where m.canal = 'whatsapp'
       and not m.envio_manual
       and (
         (m.status = 'aprovada' and m.agendada_para <= now())
         or (m.status = 'enviando' and m.reservada_em < now() - interval '10 minutes')
       )
       and public.whatsapp_folga(m.tenant_id) > 0
       and not public.whatsapp_lead_em_espera(m.tenant_id, m.negocio_id, m.id)
     order by m.negocio_id, m.agendada_para
  ),
  limitadas as (
    select e.id
      from elegiveis e
     order by e.agendada_para
     limit least(v_teto, coalesce((select max(public.whatsapp_folga(t.id)) from public.tenants t), 0))
  ),
  travadas as (
    select m.id
      from public.mensagens m
     where m.id in (select id from limitadas)
     for update skip locked
  )
  update public.mensagens m
     set status = 'enviando', tentativas = m.tentativas + 1, reservada_em = now()
    from travadas t
   where m.id = t.id
  returning m.*;
end;
$function$;

revoke execute on function public.reservar_mensagens(integer) from public, anon;
