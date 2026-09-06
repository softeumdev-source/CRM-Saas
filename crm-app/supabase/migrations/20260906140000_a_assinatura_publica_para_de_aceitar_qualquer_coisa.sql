-- Duas frestas na assinatura pública, que é a única porta do sistema aberta
-- para fora.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. `salvar_pdf_assinado` gravava QUALQUER string como URL do documento.
--
-- A função é SECURITY DEFINER e alcançável por `anon` em
-- /rest/v1/rpc/salvar_pdf_assinado (é o que o advisor do Supabase aponta).
-- Ela só conferia que o token existe, e depois gravava `p_comercial_url` como
-- veio.
--
-- Do outro lado, `src/lib/storage.ts` tem o atalho de legado
-- `if (caminho.startsWith("http")) return caminho;` e `abrirPdf` faz
-- `window.open`. Ou seja: quem tivesse um token de assinatura fazia o botão
-- "Baixar assinada" DO CRM abrir a página que quisesse — com cara de contrato
-- assinado, dentro da sessão de quem clicou.
--
-- O conserto NÃO pode ser "recusar http": o chamador legítimo
-- (`api/assinar/[token]/route.ts:272`) grava exatamente uma URL absoluta,
-- `<SUPABASE_URL>/storage/v1/object/public/assinatura-publica/<token>/…pdf`.
-- Recusar `http` desligaria o download do documento assinado.
--
-- Então a validação amarra a URL AO PRÓPRIO TOKEN de quem chamou: tem de ser
-- o bucket público de assinatura, na pasta daquele token, e terminar em .pdf.
-- Com isso o pior que um token consegue é apontar para um arquivo inexistente
-- da própria pasta — link quebrado, não link para fora.
create or replace function public.salvar_pdf_assinado(
  p_token text, p_comercial_url text, p_tecnica_url text)
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_proposta_id uuid;
  v_padrao text;
begin
  select e.proposta_id into v_proposta_id
  from public.signatarios s
  join public.envelopes e on e.id = s.envelope_id
  where s.token = p_token;

  if v_proposta_id is null then
    raise exception 'token invalido';
  end if;

  -- `\m` e `\M` prendem começo e fim; o token entra escapado para não poder
  -- injetar metacaractere na própria expressão.
  v_padrao := '^https://[a-z0-9-]+\.supabase\.(co|in)/storage/v1/object/public/'
              || 'assinatura-publica/' || regexp_replace(p_token, '([^a-zA-Z0-9])', '\\\1', 'g')
              || '/[A-Za-z0-9._-]+\.pdf$';

  if p_comercial_url !~ v_padrao or p_tecnica_url !~ v_padrao then
    raise exception 'caminho de documento assinado invalido';
  end if;

  update public.propostas
  set pdf_assinado_comercial_path = p_comercial_url,
      pdf_assinado_tecnica_path = p_tecnica_url
  where id = v_proposta_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. `registrar_assinatura` não olhava o estado do envelope, nem a idade dele.
--
-- Conferia três coisas: token existe, aquele signatário ainda não assinou,
-- tipo válido. Nada sobre o ENVELOPE. Consequência concreta: um envelope
-- CANCELADO pela empresa continuava assinável pelo link antigo — e a
-- assinatura o marcava como `concluido`, punha a proposta em `assinada` e
-- disparava a notificação de "todos assinaram". E o link não expirava nunca:
-- o e-mail reencontrado dois anos depois ainda assinava.
--
-- O CHECK da tabela já previa `cancelado` e `expirado`; faltava alguém
-- olhar. Os dois envelopes de hoje estão `concluido`, então a regra nova não
-- alcança nada que esteja em aberto.
--
-- 90 dias sai de `envelopes.criado_em` — sem coluna nova e sem migrar dado.
-- É prazo de proposta comercial, não de link de sessão: curto o bastante para
-- o link velho morrer, longo o bastante para uma negociação real caber.
create or replace function public.registrar_assinatura(
  p_token text, p_tipo text, p_dados text, p_ip text, p_user_agent text,
  p_email_faturamento text default null::text)
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
    -- Só recusa, sem marcar `expirado` na linha. A primeira versão desta
    -- migration fazia `update … set status='expirado'` aqui antes do raise, e
    -- o teste mostrou que a coluna continuava `enviado`: em PL/pgSQL o
    -- `raise exception` desfaz TUDO que a chamada escreveu, inclusive esse
    -- update. Era código morto se passando por conserto. Quem decide o estado
    -- é esta checagem, a cada tentativa — não uma coluna que alguém precisa
    -- lembrar de atualizar.
    raise exception 'o prazo deste link de assinatura terminou';
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

  return json_build_object('envelope_concluido', v_pendentes = 0);
end;
$function$;
