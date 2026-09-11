-- ---------------------------------------------------------------------------
-- O board da prospeccao passa a mostrar quantos e-mails ja sairam hoje.
--
-- A pedido: "no painel de kanban de prospeccao mostre a quantidade de email que
-- ja foi enviada no dia".
--
-- E UM RPC E NAO UMA CONSULTA NA TELA, por um motivo so: a tela nao pode ter uma
-- segunda definicao de "hoje". `email_folga` conta o dia no FUSO DO TENANT
-- (`preferencias_agenda.fuso`), nao no fuso do navegador de quem abriu o board.
-- Um `new Date()` no cliente daria numero diferente para quem abrisse de outro
-- fuso -- e, pior, daria numero diferente do que o freio esta usando para
-- decidir. A tela mostraria 48/50 enquanto o motor ja parou em 50.
--
-- Por isso os dois numeros saem da mesma funcao, com a mesma conta de data.
--
-- DEVOLVE OS DOIS, e a diferenca importa:
--
--   enviados   -- o que de fato saiu (`enviada_em` hoje). E o que foi pedido,
--                 e e o numero que a pessoa reconhece.
--   reservados -- o que CONSUMIU cota (`reservada_em` hoje), incluindo o que
--                 falhou depois de reservado. E o numero que o freio usa.
--
-- Em dia normal os dois sao iguais. Quando divergem, e porque algo falhou no
-- envio -- e ai a tela precisa mostrar o segundo, senao o board diz "47/50" e
-- para de mandar, sem explicar por que.
-- ---------------------------------------------------------------------------

create or replace function public.cota_de_email_do_dia()
 returns table (
   enviados int,
   reservados int,
   limite int,
   folga int,
   pausado boolean,
   dentro_do_expediente boolean
 )
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_tenant uuid := public.usuario_tenant_id();
  v_pref   record;
  v_local  timestamp;
  v_hora   time;
begin
  if v_tenant is null then return; end if;

  select coalesce(c.limite_por_dia, 50), coalesce(c.pausado, false)
    into limite, pausado
    from public.email_config c where c.tenant_id = v_tenant;
  limite  := coalesce(limite, 50);
  pausado := coalesce(pausado, false);

  select p.* into v_pref
    from public.preferencias_agenda p where p.tenant_id = v_tenant;

  if found then
    v_local := now() at time zone v_pref.fuso;
    v_hora  := v_local::time;
    dentro_do_expediente :=
      (extract(isodow from v_local)::int = any(v_pref.dias_semana))
      and v_hora >= v_pref.hora_inicio and v_hora < v_pref.hora_fim
      and not (v_pref.almoco_inicio is not null and v_pref.almoco_fim is not null
               and v_hora >= v_pref.almoco_inicio and v_hora < v_pref.almoco_fim);
  else
    v_local := now();
    dentro_do_expediente := false;
  end if;

  select count(*) filter (where m.enviada_em is not null
                            and (m.enviada_em at time zone coalesce(v_pref.fuso, 'UTC'))::date = v_local::date),
         count(*) filter (where m.reservada_em is not null
                            and (m.reservada_em at time zone coalesce(v_pref.fuso, 'UTC'))::date = v_local::date)
    into enviados, reservados
    from public.mensagens m
   where m.tenant_id = v_tenant and m.canal = 'email';

  folga := public.email_folga(v_tenant);
  return next;
end;
$function$;

comment on function public.cota_de_email_do_dia() is
  'E-mails de cadencia do dia para o board: enviados, reservados (o que consome '
  'cota), teto, folga do momento e se estamos no expediente. Dia contado no '
  'fuso do tenant, igual a `email_folga` -- a tela nao tem definicao propria.';

revoke execute on function public.cota_de_email_do_dia() from public, anon;
grant execute on function public.cota_de_email_do_dia() to authenticated;
