-- As 13 funções do schema base que faltavam no repositório.
--
-- As duas primeiras são as mais importantes do sistema inteiro e não estavam
-- descritas em lugar nenhum: **`usuario_tenant_id()` e `usuario_role()` são
-- lidas por TODAS as políticas de RLS**. Num ambiente novo sem elas, nenhuma
-- política sequer é criada — e um `create policy` que falha derruba a
-- migration, o que pelo menos é barulhento. O modo silencioso é pior: alguém
-- recria as políticas sem as funções e a RLS vira uma peneira.
--
-- Roda ANTES dos índices, porque `contatos_telefone_chave_idx` é um índice
-- funcional sobre `telefone_chave(...)`.
--
-- Todas são `create or replace`: aplicar em produção substitui cada função por
-- um texto idêntico ao que já está lá. Isso é conferido por diferença de
-- `pg_get_functiondef` antes e depois, não presumido.
--
-- O `set search_path` de cada uma é parte da definição, não enfeite: uma função
-- `security definer` sem search_path fixo é o vetor clássico de escalada de
-- privilégio no Postgres — quem chama controla o que `usuarios` significa.

-- ---------------------------------------------------------------------------
-- 1) As duas de que a RLS inteira depende.
-- ---------------------------------------------------------------------------
create or replace function public.usuario_tenant_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$ select tenant_id from public.usuarios where id = auth.uid() $function$;

create or replace function public.usuario_role()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$ select role from public.usuarios where id = auth.uid() $function$;

-- ---------------------------------------------------------------------------
-- 2) Gatilhos do ciclo de vida.
-- ---------------------------------------------------------------------------
-- A ponte entre `auth.users` e `public.usuarios`. Sem ela, quem se cadastra
-- existe para a autenticação e não existe para o CRM — e como `usuario_role()`
-- devolveria nulo, a pessoa não enxergaria nada e nem saberia por quê.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.usuarios (id, tenant_id, nome, email, role)
  values (
    new.id,
    coalesce(
      (new.raw_user_meta_data->>'tenant_id')::uuid,
      (select id from public.tenants order by criado_em limit 1)
    ),
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'vendedor')
  )
  on conflict (id) do nothing;

  update public.convites set status = 'aceito'
  where email = new.email and status = 'pendente';

  return new;
end;
$function$;

-- O histórico de etapa é escrito por GATILHO, e não pela aplicação, porque
-- existem quatro caminhos que movem um card (arrasto, botão, transferência de
-- funil, retomada de nutrição). Confiar na aplicação seria quatro lugares para
-- esquecer.
create or replace function public.negocio_etapa_historico_registrar()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.negocio_etapa_historico(tenant_id, negocio_id, etapa_id, entrou_em)
    values (new.tenant_id, new.id, new.etapa_id, coalesce(new.criado_em, now()));
    return new;
  end if;

  if tg_op = 'UPDATE' and new.etapa_id is distinct from old.etapa_id then
    update public.negocio_etapa_historico
      set saiu_em = now()
      where negocio_id = new.id and saiu_em is null;
    insert into public.negocio_etapa_historico(tenant_id, negocio_id, etapa_id, entrou_em)
    values (new.tenant_id, new.id, new.etapa_id, now());
  end if;
  return new;
end;
$function$;

create or replace function public.negocios_set_fechado_em()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.ganho is distinct from old.ganho then
    if new.ganho is not null and new.fechado_em is null then
      new.fechado_em := now();
    elsif new.ganho is null then
      new.fechado_em := null;
    end if;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Assinatura pública — chamadas por quem NÃO tem login.
-- ---------------------------------------------------------------------------
-- `security definer` aqui é obrigatório e é o desenho: o cliente que assina não
-- é usuário do CRM. O que substitui a RLS é o token, que tem 192 bits e é a
-- única entrada.
create or replace function public.salvar_pdf_assinado(p_token text, p_comercial_url text, p_tecnica_url text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_proposta_id uuid;
begin
  select e.proposta_id into v_proposta_id
  from public.signatarios s
  join public.envelopes e on e.id = s.envelope_id
  where s.token = p_token;

  if v_proposta_id is null then
    raise exception 'token invalido';
  end if;

  update public.propostas
  set pdf_assinado_comercial_path = p_comercial_url,
      pdf_assinado_tecnica_path = p_tecnica_url
  where id = v_proposta_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Convite e distribuição — escrevem em `auth`, e por isso são definer.
-- ---------------------------------------------------------------------------
-- `convidar_usuario` cria a linha em `auth.users` E a identidade, porque o
-- convite tem que funcionar sem o usuário nunca ter passado por um fluxo de
-- signup. A autorização é a PRIMEIRA linha do corpo: `security definer` sem a
-- checagem de papel seria dar criação de usuário a qualquer vendedor.
create or replace function public.convidar_usuario(p_email text, p_nome text, p_role text)
 returns table(convite_id uuid, token text)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_tenant_id uuid;
  v_user_id uuid;
  v_convite_id uuid;
  v_token text;
begin
  if public.usuario_role() <> 'admin' then
    raise exception 'apenas administradores podem convidar usuarios';
  end if;
  v_tenant_id := public.usuario_tenant_id();

  if exists (select 1 from public.usuarios u where u.email = p_email and u.tenant_id = v_tenant_id) then
    raise exception 'ja existe um usuario com este e-mail';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('tenant_id', v_tenant_id, 'role', p_role, 'nome', p_nome),
    false, '', '', '', ''
  )
  returning id into v_user_id;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.convites (tenant_id, email, role, status, convidado_por)
  values (v_tenant_id, p_email, p_role, 'pendente', auth.uid())
  returning id, convites.token into v_convite_id, v_token;

  return query select v_convite_id, v_token;
end;
$function$;

-- Chamada por quem AINDA NÃO tem login — é o único caminho em que o convidado
-- define a própria senha. As duas guardas (convite pendente e não expirado, e
-- senha de 8 caracteres) são o que substitui a autenticação aqui.
create or replace function public.aceitar_convite(p_token text, p_nova_senha text)
 returns table(email text)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_convite record;
begin
  select * into v_convite from public.convites c where c.token = p_token and c.status = 'pendente' and c.expira_em > now();
  if not found then
    raise exception 'convite invalido ou expirado';
  end if;
  if length(p_nova_senha) < 8 then
    raise exception 'a senha deve ter ao menos 8 caracteres';
  end if;

  update auth.users set encrypted_password = crypt(p_nova_senha, gen_salt('bf')), updated_at = now()
  where auth.users.email = v_convite.email;

  update public.convites set status = 'aceito' where id = v_convite.id;

  return query select v_convite.email;
end;
$function$;

create or replace function public.distribuir_leads(p_contato_ids uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tenant_id uuid;
  v_reps uuid[];
  v_count int := 0;
  v_i int := 0;
  v_contato_id uuid;
begin
  if public.usuario_role() <> 'admin' then
    raise exception 'apenas administradores podem distribuir leads';
  end if;
  v_tenant_id := public.usuario_tenant_id();

  select array_agg(id order by criado_em) into v_reps
  from public.usuarios where tenant_id = v_tenant_id and role = 'vendedor' and ativo = true;

  if v_reps is null or array_length(v_reps, 1) = 0 then
    raise exception 'nenhum vendedor ativo para distribuir';
  end if;

  foreach v_contato_id in array p_contato_ids loop
    update public.contatos
      set responsavel_id = v_reps[(v_i % array_length(v_reps, 1)) + 1], atualizado_em = now()
      where id = v_contato_id and tenant_id = v_tenant_id;
    if found then
      v_i := v_i + 1;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Aprovação de desconto.
-- ---------------------------------------------------------------------------
-- O piso de desconto é defendido em DOIS lugares, e de propósito: os checks
-- `valor_*_nao_pode_ser_menor_que_base` em `propostas` impedem a proposta
-- abaixo da base por qualquer caminho, e este par de funções é o processo pelo
-- qual um admin libera a exceção. Um sem o outro seria ou uma parede sem porta
-- ou uma porta sem parede.
create or replace function public.solicitar_desconto(p_negocio_id uuid, p_plano_id uuid, p_valor_mensal numeric, p_valor_setup numeric, p_motivo text)
 returns solicitacoes_desconto
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant uuid;
  v_negocio record;
  v_plano record;
  v_valor_base numeric;
  v_row public.solicitacoes_desconto;
  v_nome text;
begin
  v_tenant := public.usuario_tenant_id();
  if v_tenant is null then
    raise exception 'usuario sem tenant';
  end if;

  select n.*, c.empresa as empresa, c.nome as contato_nome
    into v_negocio
  from public.negocios n
  left join public.contatos c on c.id = n.contato_id
  where n.id = p_negocio_id and n.tenant_id = v_tenant;
  if not found then
    raise exception 'negocio nao encontrado';
  end if;

  -- Vendedor só pede para negócio dele; admin não precisa pedir.
  if public.usuario_role() <> 'admin' and v_negocio.responsavel_id is distinct from auth.uid() then
    raise exception 'sem permissao para este negocio';
  end if;

  select p.* into v_plano from public.planos p where p.id = p_plano_id and p.tenant_id = v_tenant;
  v_valor_base := coalesce(v_plano.valor_plataforma_base,0) + coalesce(v_plano.valor_uso_base,0);

  -- Evita duplicidade: reaproveita solicitação pendente do mesmo negócio.
  update public.solicitacoes_desconto
    set plano_id = p_plano_id,
        valor_mensal_solicitado = p_valor_mensal,
        valor_setup_solicitado = coalesce(p_valor_setup,0),
        valor_mensal_base = v_valor_base,
        motivo = p_motivo,
        vendedor_id = auth.uid(),
        criado_em = now()
  where negocio_id = p_negocio_id and status = 'pendente'
  returning * into v_row;

  if not found then
    insert into public.solicitacoes_desconto
      (tenant_id, negocio_id, plano_id, vendedor_id, valor_mensal_solicitado, valor_setup_solicitado, valor_mensal_base, motivo)
    values
      (v_tenant, p_negocio_id, p_plano_id, auth.uid(), p_valor_mensal, coalesce(p_valor_setup,0), v_valor_base, p_motivo)
    returning * into v_row;
  end if;

  select nome into v_nome from public.usuarios where id = auth.uid();

  -- Notifica os admins do tenant
  insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
  select u.id, 'desconto_solicitado',
    'Aprovação de desconto solicitada',
    coalesce(v_nome,'Vendedor') || ' pediu desconto em ' || coalesce(v_negocio.empresa, v_negocio.contato_nome, v_negocio.titulo, 'negócio') ||
      ' — mensalidade ' || to_char(p_valor_mensal, 'FM999G999G990D00') || ' (base ' || to_char(v_valor_base,'FM999G999G990D00') || ')',
    '/negocios/' || p_negocio_id::text
  from public.usuarios u
  where u.tenant_id = v_tenant and u.role = 'admin';

  return v_row;
end;
$function$;

create or replace function public.decidir_desconto(p_solicitacao_id uuid, p_aprovar boolean, p_resposta text default null::text)
 returns solicitacoes_desconto
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant uuid;
  v_row public.solicitacoes_desconto;
  v_negocio record;
begin
  v_tenant := public.usuario_tenant_id();
  if public.usuario_role() <> 'admin' then
    raise exception 'apenas admin pode decidir desconto';
  end if;

  select * into v_row from public.solicitacoes_desconto
  where id = p_solicitacao_id and tenant_id = v_tenant;
  if not found then
    raise exception 'solicitacao nao encontrada';
  end if;
  if v_row.status <> 'pendente' then
    raise exception 'solicitacao ja decidida';
  end if;

  update public.solicitacoes_desconto
    set status = case when p_aprovar then 'aprovado' else 'recusado' end,
        resposta_admin = p_resposta,
        decidido_por = auth.uid(),
        decidido_em = now()
  where id = p_solicitacao_id
  returning * into v_row;

  select n.titulo, c.empresa, c.nome as contato_nome into v_negocio
  from public.negocios n left join public.contatos c on c.id = n.contato_id
  where n.id = v_row.negocio_id;

  -- Notifica o vendedor que solicitou
  if v_row.vendedor_id is not null then
    insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
    values (
      v_row.vendedor_id,
      'desconto_decidido',
      case when p_aprovar then 'Desconto aprovado' else 'Desconto recusado' end,
      case when p_aprovar
        then 'Seu desconto em ' || coalesce(v_negocio.empresa, v_negocio.contato_nome, v_negocio.titulo, 'negócio') || ' foi aprovado. Você já pode gerar a proposta.'
        else 'Seu desconto em ' || coalesce(v_negocio.empresa, v_negocio.contato_nome, v_negocio.titulo, 'negócio') || ' foi recusado.' end
        || coalesce(' — ' || p_resposta, ''),
      '/negocios/' || v_row.negocio_id::text
    );
  end if;

  return v_row;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6) A tela pública de assinatura, do lado do banco.
-- ---------------------------------------------------------------------------
-- Chamada por `anon`: o cliente que assina não tem login. Toda a autorização é
-- o token de 192 bits, e por isso a função devolve um JSON MONTADO À MÃO em vez
-- de expor as tabelas — o cliente enxerga só os campos listados aqui, e nada da
-- linha de `propostas` que não esteja nesta lista.
--
-- Ela também tem efeito colateral de propósito: a primeira abertura marca
-- `visualizado`, notifica o dono do negócio e grava a atividade. É assim que o
-- vendedor sabe que o cliente abriu o contrato — o sinal mais útil do fluxo, e
-- ele não existiria se a leitura fosse um `select` puro.
create or replace function public.obter_envelope_publico(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sig record;
  v_result json;
  v_prop record;
  v_responsavel uuid;
begin
  select s.* into v_sig from public.signatarios s where s.token = p_token;
  if not found then
    raise exception 'link de assinatura invalido';
  end if;

  if v_sig.status = 'pendente' then
    update public.signatarios set status = 'visualizado', visualizado_em = now()
    where id = v_sig.id;

    update public.envelopes set status = 'aguardando'
    where id = v_sig.envelope_id and status = 'enviado';

    select p.id, p.numero, p.tenant_id, p.negocio_id into v_prop
    from public.envelopes e
    join public.propostas p on p.id = e.proposta_id
    where e.id = v_sig.envelope_id;

    if v_prop.id is not null then
      select n.responsavel_id into v_responsavel from public.negocios n where n.id = v_prop.negocio_id;

      insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
      select u.id, 'proposta_visualizada',
        'Cliente visualizou a proposta ' || coalesce(v_prop.numero, ''),
        v_sig.nome || ' acabou de abrir o documento de assinatura.',
        '/negocios/' || v_prop.negocio_id
      from public.usuarios u
      where u.tenant_id = v_prop.tenant_id
        and (u.role = 'admin' or u.id = v_responsavel);

      insert into public.atividades (negocio_id, tipo, titulo, descricao)
      values (
        v_prop.negocio_id,
        'proposta',
        'Proposta ' || coalesce(v_prop.numero, '') || ' visualizada pelo cliente',
        v_sig.nome || ' (' || v_sig.email || ') abriu o documento de assinatura.'
      );

      update public.negocios set ultima_atividade_em = now() where id = v_prop.negocio_id;
    end if;
  end if;

  select json_build_object(
    'signatario', json_build_object('id', s.id, 'nome', s.nome, 'email', s.email, 'papel', s.papel, 'status', s.status, 'ordem', s.ordem),
    'envelope', json_build_object('id', e.id, 'status', e.status, 'campos_assinatura', e.campos_assinatura),
    'outros_signatarios', (
      select json_agg(json_build_object('nome', s2.nome, 'papel', s2.papel, 'status', s2.status) order by s2.ordem)
      from public.signatarios s2 where s2.envelope_id = e.id
    ),
    'proposta', json_build_object(
      'numero', p.numero, 'versao', p.versao, 'aviso_previo_dias', p.aviso_previo_dias,
      'prazo_contrato_meses', p.prazo_contrato_meses,
      'valor_plataforma', p.valor_plataforma,
      'valor_uso', p.valor_uso, 'valor_excedente_pedido', p.valor_excedente_pedido
    ),
    'negocio', json_build_object('titulo', n.titulo),
    'contato', json_build_object('nome', c.nome, 'empresa', c.empresa, 'cnpj', c.cnpj, 'email', c.email),
    'tenant', json_build_object('nome', t.nome, 'cor_primaria', t.cor_primaria),
    'documentos_assinados', case
      when e.status = 'concluido' and p.pdf_assinado_comercial_path is not null then json_build_object(
        'comercial', p.pdf_assinado_comercial_path,
        'tecnica', p.pdf_assinado_tecnica_path
      )
      else null
    end
  ) into v_result
  from public.signatarios s
  join public.envelopes e on e.id = s.envelope_id
  join public.propostas p on p.id = e.proposta_id
  join public.negocios n on n.id = p.negocio_id
  join public.contatos c on c.id = n.contato_id
  join public.tenants t on t.id = p.tenant_id
  where s.id = v_sig.id;

  return v_result;
end;
$function$;

-- O ato de assinar, também por `anon` e também com o token como única chave.
-- Duas guardas que valem apontar: `status = 'assinado'` recusa a segunda
-- assinatura (o link continua válido depois, e sem isto alguém assinaria duas
-- vezes por recarregar a página), e a conclusão do envelope só acontece quando
-- a contagem de pendentes chega a zero — não quando o último signatário da
-- lista assina, que não é a mesma coisa se alguém for adicionado no meio.
create or replace function public.registrar_assinatura(p_token text, p_tipo text, p_dados text, p_ip text, p_user_agent text, p_email_faturamento text default null::text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sig record;
  v_pendentes int;
  v_proposta_id uuid;
  v_prop record;
  v_negocio_responsavel uuid;
  v_negocio_titulo text;
begin
  select * into v_sig from public.signatarios s where s.token = p_token;
  if not found then
    raise exception 'link de assinatura invalido';
  end if;
  if v_sig.status = 'assinado' then
    raise exception 'este signatario ja assinou o documento';
  end if;
  if p_tipo not in ('desenhada', 'digitada') then
    raise exception 'tipo de assinatura invalido';
  end if;

  update public.signatarios set
    status = 'assinado', assinado_em = now(), ip_assinatura = p_ip,
    user_agent = p_user_agent, assinatura_tipo = p_tipo, assinatura_dados = p_dados,
    email_faturamento = coalesce(p_email_faturamento, email_faturamento)
  where id = v_sig.id;

  select e.proposta_id into v_proposta_id from public.envelopes e where e.id = v_sig.envelope_id;
  select p.numero, p.tenant_id, p.negocio_id into v_prop from public.propostas p where p.id = v_proposta_id;
  select n.responsavel_id, n.titulo into v_negocio_responsavel, v_negocio_titulo
  from public.negocios n where n.id = v_prop.negocio_id;

  -- Notifica a assinatura deste signatário imediatamente
  insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
  select u.id, 'assinatura_registrada',
    v_sig.nome || ' assinou a proposta ' || coalesce(v_prop.numero, ''),
    'Assinatura eletrônica registrada agora' || case when v_negocio_titulo is not null then ' — ' || v_negocio_titulo else '' end || '.',
    '/negocios/' || v_prop.negocio_id
  from public.usuarios u
  where u.tenant_id = v_prop.tenant_id
    and (u.role = 'admin' or u.id = v_negocio_responsavel);

  insert into public.atividades (negocio_id, tipo, titulo, descricao)
  values (
    v_prop.negocio_id,
    'proposta',
    'Proposta ' || coalesce(v_prop.numero, '') || ' assinada por ' || v_sig.nome,
    v_sig.nome || ' (' || v_sig.email || ') assinou eletronicamente o documento.'
  );

  update public.negocios set ultima_atividade_em = now() where id = v_prop.negocio_id;

  select count(*) into v_pendentes from public.signatarios where envelope_id = v_sig.envelope_id and status <> 'assinado';

  if v_pendentes = 0 then
    update public.envelopes set status = 'concluido', concluido_em = now() where id = v_sig.envelope_id;
    update public.propostas set status = 'assinada' where id = v_proposta_id;

    insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
    select u.id, 'proposta_assinada', 'Proposta assinada: ' || coalesce(v_negocio_titulo, ''),
      'Todos os signatarios concluiram a assinatura.', '/negocios/' || v_prop.negocio_id
    from public.usuarios u
    where u.tenant_id = v_prop.tenant_id
      and (u.role = 'admin' or u.id = v_negocio_responsavel);
  end if;

  return json_build_object('envelope_concluido', v_pendentes = 0);
end;
$function$;
