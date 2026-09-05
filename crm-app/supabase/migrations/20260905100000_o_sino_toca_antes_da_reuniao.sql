-- O disparador do aviso de reunião.
--
-- Mesmo formato dos outros quatro crons: o `pg_cron` acorda, a função confere
-- se há o que fazer e só então chama a rota — que é onde moram o token da
-- Google e o segredo. Sem agenda conectada ela nem acorda a rota.
--
-- Por que um cron novo em vez de reusar `processar_lembretes`: aquele lê
-- `atividades.lembrete_data`, e evento do Google NÃO é linha do nosso banco.
-- Ele não dispara gatilho, não tem coluna de lembrete e o `processar_lembretes`
-- nunca o veria. A varredura da agenda é o único caminho.
--
-- O `public` na frente do revoke é obrigatório, e não estilo: no Postgres o
-- `execute` de função nasce concedido a PUBLIC, então revogar só de
-- `anon, authenticated` não tira nada — medido nesta mesma sessão, numa
-- transação revertida, quando o mesmo comando sem `public` deixou
-- `has_function_privilege('anon', ...)` em `true`.
--
-- Minuto 4 da janela de 5 para não competir com o despacho (minuto 2) nem com
-- a sincronização do Gmail (minuto 3).

create or replace function public.disparar_reunioes()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_secret text;
  v_contas int;
begin
  select count(*) into v_contas
    from public.integracoes_google where ultimo_erro is null;

  if v_contas = 0 then
    return 'nenhuma agenda conectada';
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    return format('%s agenda(s), mas o Vault nao tem app_url/cron_secret', v_contas);
  end if;

  perform net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/reunioes',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret)
  );

  return format('%s agenda(s), rota chamada', v_contas);
end;
$$;

revoke execute on function public.disparar_reunioes() from public, anon, authenticated;

select cron.schedule('disparar-reunioes', '4-59/5 * * * *', 'select public.disparar_reunioes();');
