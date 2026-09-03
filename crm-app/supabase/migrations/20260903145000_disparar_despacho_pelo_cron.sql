-- ---------------------------------------------------------------------------
-- O elo que faltava: o banco acordando a rota que envia.
--
-- `processar_cadencias()` so materializa a mensagem; quem fala com o Resend e
-- a rota do Next, porque e la que estao o SDK e as chaves. Como o plano Hobby
-- da Vercel so permite um cron por dia, quem chama a rota e o `pg_cron` daqui,
-- via `pg_net`.
--
-- A URL e o segredo ficam no Vault, nao cravados nesta funcao: sao
-- configuracao do ambiente, e o segredo e do dono do projeto — nem esta
-- migration nem o repositorio precisam conhece-lo.
--
-- Enquanto o Vault nao tiver os dois, a funcao NAO chama nada e devolve o
-- motivo. Melhor do que falhar em silencio: quem for olhar
-- `cron.job_run_details` le "vault sem app_url/cron_secret" em vez de ver um
-- job verde que nunca entregou nada.
--
-- Para ligar, com o mesmo valor que ja esta em CRON_SECRET na Vercel:
--   select vault.create_secret('https://SEU-APP.vercel.app', 'app_url');
--   select vault.create_secret('SEU_CRON_SECRET',            'cron_secret');
-- ---------------------------------------------------------------------------

create or replace function public.disparar_despacho()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_secret text;
  v_pendentes int;
begin
  select count(*) into v_pendentes
    from public.mensagens
   where status = 'aprovada' and agendada_para <= now();

  -- Nao acorda a rota a toa: sem fila, sem chamada.
  if v_pendentes = 0 then
    return 'nada a despachar';
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    return format('%s na fila, mas o Vault nao tem app_url/cron_secret — despacho automatico desligado', v_pendentes);
  end if;

  perform net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/despachar',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret)
  );

  return format('%s na fila, rota chamada', v_pendentes);
end;
$$;

revoke execute on function public.disparar_despacho() from public, anon, authenticated;

-- Dois minutos depois do processador, para a mensagem ja existir quando a rota
-- for acordada.
select cron.schedule(
  'disparar-despacho',
  '2-59/5 * * * *',
  'select public.disparar_despacho();'
);
