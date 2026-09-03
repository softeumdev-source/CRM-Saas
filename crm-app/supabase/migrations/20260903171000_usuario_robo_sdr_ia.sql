-- O SDR IA: o dono dos leads que a IA prospecta.
--
-- Nao e enfeite de organograma, e o que faz a RLS existente funcionar sem
-- alterar uma policy sequer. A regra atual libera `responsavel_id is null` para
-- todo mundo do tenant — e o pool. Se os leads do SDR ficassem sem dono, o
-- vendedor veria os milhares de leads de prospeccao misturados aos dele. Com um
-- dono que nao e vendedor, "admin ve tudo, vendedor ve o que e dele" ja resolve,
-- e a entrega continua sendo so trocar `responsavel_id` e `etapa_id`.
--
-- `handle_new_user` (gatilho em auth.users) cria a linha em public.usuarios
-- lendo `nome` e `role` do metadata — entao basta criar o usuario de auth.
--
-- O e-mail usa o TLD `.invalid`, reservado pela RFC 2606 e garantidamente sem
-- resolucao de DNS. E de proposito: a conta nunca recebe e-mail, nunca recebe
-- link de recuperacao de senha, e ninguem a sequestra por caixa de entrada.
-- A senha fica nula, entao nao ha login por senha. E uma identidade, nao um
-- acesso. Trocar por um endereco real depois e so um update.
do $$
declare v_id uuid := gen_random_uuid();
begin
  if exists (select 1 from public.usuarios where role = 'sdr') then
    raise notice 'ja existe usuario com papel sdr — nada a fazer';
    return;
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'sdr-ia@softeum.invalid',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"SDR IA","role":"sdr"}'::jsonb,
    now(),
    now()
  );
end $$;
