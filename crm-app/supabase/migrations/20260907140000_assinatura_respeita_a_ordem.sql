-- A `ordem` do signatário deixa de ser decoração.
--
-- Ela existe na tabela desde o começo, é gravada no envio (1 para o interno
-- Softeum, 2 em diante para os clientes) e é usada para ORDENAR a lista na
-- tela. O que ela nunca fez foi valer como regra: `registrar_assinatura`
-- conferia se o token existe, se aquele signatário ainda não assinou e se o
-- envelope está aberto — nunca se era a vez dele. Com o link indo para todos no
-- mesmo laço do envio, três signatários podiam assinar em qualquer sequência, e
-- o terceiro podia assinar antes de o primeiro abrir o documento.
--
-- Isso importa porque o documento MUDA entre uma assinatura e outra: quem
-- assina depois assina um PDF que já traz a rubrica de quem veio antes. Fora de
-- ordem, cada um assina uma versão diferente do mesmo contrato.
--
-- A função passa a recusar quando existe signatário com `ordem` menor ainda não
-- assinado, e passa a devolver QUEM é o próximo, para a rota de assinatura
-- conseguir mandar o link dele.
--
-- O signatário interno Softeum não atrapalha: ele nasce com `ordem = 1` e
-- `status = 'assinado'`, então nunca aparece como pendente à frente de ninguém.
--
-- `ordem` é anulável na tabela. `coalesce(ordem, 0)` trata nulo como o começo
-- da fila em vez de deixar a comparação virar nulo e a guarda sumir em
-- silêncio — que é como uma regra de negócio deixa de existir sem ninguém
-- perceber.

create or replace function public.registrar_assinatura(
  p_token text, p_tipo text, p_dados text, p_ip text, p_user_agent text,
  p_email_faturamento text default null::text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sig record;
  v_env record;
  v_pendentes int;
  v_proposta_id uuid;
  v_prop record;
  v_negocio_responsavel uuid;
  v_negocio_titulo text;
  v_anteriores int;
  v_proximo record;
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

  select * into v_env from public.envelopes e where e.id = v_sig.envelope_id;
  if not found then
    raise exception 'link de assinatura invalido';
  end if;
  if v_env.status not in ('enviado', 'aguardando') then
    raise exception 'este documento nao esta mais aberto para assinatura';
  end if;
  if v_env.criado_em < now() - interval '90 days' then
    raise exception 'o prazo deste link de assinatura terminou';
  end if;

  -- A VEZ DELE. A mensagem não diz QUEM falta: quem abre este link é o
  -- signatário, não necessariamente alguém que deveria saber a lista inteira de
  -- quem mais assina o contrato.
  select count(*) into v_anteriores
  from public.signatarios s
  where s.envelope_id = v_sig.envelope_id
    and coalesce(s.ordem, 0) < coalesce(v_sig.ordem, 0)
    and s.status <> 'assinado';

  if v_anteriores > 0 then
    raise exception 'este documento ainda esta com outra pessoa para assinar. Voce recebera um e-mail quando for a sua vez.';
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

  -- QUEM É O PRÓXIMO. A rota usa isto para mandar o link dele — sem isso, o
  -- segundo signatário nunca recebe nada e o envelope morre esperando.
  --
  -- O `token` NÃO sai daqui. Esta função é `security definer` e é chamada pela
  -- chave anônima, de dentro do navegador de quem acabou de assinar: devolver o
  -- token do próximo entregaria a credencial dele para a pessoa errada. A rota
  -- roda no servidor e busca o token pelo id.
  select s.id, s.nome, s.email into v_proximo
  from public.signatarios s
  where s.envelope_id = v_sig.envelope_id
    and s.status <> 'assinado'
    and s.papel <> 'softeum'
  order by coalesce(s.ordem, 0)
  limit 1;

  return json_build_object(
    'envelope_concluido', v_pendentes = 0,
    'proximo', case when v_proximo.id is null then null else json_build_object(
      'id', v_proximo.id, 'nome', v_proximo.nome, 'email', v_proximo.email
    ) end
  );
end;
$function$;
