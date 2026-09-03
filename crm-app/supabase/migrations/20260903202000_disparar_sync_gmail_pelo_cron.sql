-- ---------------------------------------------------------------------------
-- O banco acordando a sincronização do Gmail.
--
-- Mesmo molde de `disparar_despacho()`, e pelo mesmo motivo: o plano Hobby da
-- Vercel só permite um cron por dia, então quem bate de 5 em 5 minutos é o
-- `pg_cron` daqui, via `pg_net`. A URL e o segredo saem do Vault — são
-- configuração do ambiente, e nem esta migration nem o repositório precisam
-- conhecê-los.
--
-- Enquanto o Vault não tiver os dois, a função NÃO chama nada e devolve o
-- motivo, para quem olhar `cron.job_run_details` ler "vault sem
-- app_url/cron_secret" em vez de ver um job verde que nunca sincronizou nada.
-- ---------------------------------------------------------------------------

create or replace function public.disparar_sync_gmail()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_secret text;
  v_caixas int;
begin
  -- Só conta caixa que de fato concedeu o escopo do Gmail E ainda tem refresh
  -- token. Sem os dois recortes, quem conectou apenas a Agenda faria a rota
  -- tomar 403 a cada 5 minutos e pintaria `gmail_erro` de vermelho por uma
  -- permissão que a pessoa nunca pediu.
  select count(*) into v_caixas
    from public.integracoes_google
   where refresh_token_id is not null
     and escopos @> array['https://www.googleapis.com/auth/gmail.readonly'];

  if v_caixas = 0 then
    return 'nenhuma caixa com Gmail conectado';
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    return format('%s caixa(s), mas o Vault nao tem app_url/cron_secret — sync automatico desligado', v_caixas);
  end if;

  perform net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/gmail',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret)
  );

  return format('%s caixa(s), rota chamada', v_caixas);
end;
$$;

revoke execute on function public.disparar_sync_gmail() from public, anon, authenticated;

-- Minuto 3 de cada 5, e o desencontro é de propósito: `processar_cadencias`
-- está no `*/5` e `disparar_despacho` no `2-59/5`. Três jobs no mesmo minuto
-- competiriam pelas mesmas linhas de `negocios` e pelo mesmo `maxDuration` da
-- Vercel — e o sync é o mais lento dos três, porque fala com a Google.
select cron.schedule(
  'disparar-sync-gmail',
  '3-59/5 * * * *',
  'select public.disparar_sync_gmail();'
);
