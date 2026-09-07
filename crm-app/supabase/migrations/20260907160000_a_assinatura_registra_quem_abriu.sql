-- Endurecer o que sustenta uma assinatura eletrônica.
--
-- Três buracos, todos do mesmo tipo: o sistema afirma coisas que não consegue
-- provar.
--
-- 1. A VISUALIZAÇÃO não registrava IP nem user-agent. A assinatura registra os
--    dois (`ip_assinatura`, `user_agent`), mas o momento em que a pessoa ABRIU
--    o documento — que é o que o certificado chama de "visualizado em" — vinha
--    de uma chamada feita direto do navegador, e o banco não tem como saber o
--    IP de quem chamou. Agora a página carrega por uma rota de servidor, que já
--    recebe o `x-forwarded-for`, e passa os dois adiante.
--
-- 2. O ENVIO DO LINK não ficava gravado em lugar nenhum. Sem isso não dá para
--    responder "para qual endereço este link foi, e quando" — que é a primeira
--    pergunta de qualquer contestação de assinatura.
--
-- 3. O PDF ASSINADO era gravado como URL PÚBLICA e o bucket era público. A URL
--    não expira: qualquer pessoa que a tivesse lia o contrato assinado para
--    sempre. Passa a ser CAMINHO, servido pelo proxy que já existe.
--
-- Não há ramo de compatibilidade para linhas antigas porque não há linhas
-- antigas: medido antes de escrever esta migration — 0 envelopes, 0
-- signatários, 0 propostas com PDF assinado.

-- 1. VISUALIZAÇÃO ------------------------------------------------------------

alter table public.signatarios
  add column if not exists ip_visualizacao text,
  add column if not exists user_agent_visualizacao text;

comment on column public.signatarios.ip_visualizacao is
  'IP de quem ABRIU o documento pela primeira vez. Vem do x-forwarded-for na rota de servidor — a página não consegue saber o próprio IP.';
comment on column public.signatarios.user_agent_visualizacao is
  'User-agent de quem abriu o documento pela primeira vez.';

-- Os parâmetros entram COM DEFAULT para a função continuar chamável na assinatura
-- antiga durante a janela de deploy: por alguns segundos convivem a página velha
-- (que chama sem eles) e a nova (que chama com).
create or replace function public.obter_envelope_publico(
  p_token text,
  p_ip text default null,
  p_user_agent text default null
)
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
    update public.signatarios set
      status = 'visualizado',
      visualizado_em = now(),
      -- `coalesce` para o caso de a página velha chamar sem os parâmetros: o
      -- que já estiver gravado não é apagado por uma chamada mais pobre.
      ip_visualizacao = coalesce(p_ip, ip_visualizacao),
      user_agent_visualizacao = coalesce(p_user_agent, user_agent_visualizacao)
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
    -- Continua sendo o SINAL de "os assinados existem". O que mudou é o
    -- conteúdo da coluna: agora é caminho, não URL pública. Quem monta o
    -- endereço de download é a tela, apontando para o proxy.
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

-- 2. O ENVIO DO LINK ---------------------------------------------------------

alter table public.signatarios
  add column if not exists link_enviado_em timestamptz,
  add column if not exists link_enviado_para text;

comment on column public.signatarios.link_enviado_em is
  'Quando o link de assinatura foi enviado por e-mail a este signatário (primeiro envio, vez na fila ou reenvio).';
comment on column public.signatarios.link_enviado_para is
  'Endereço para onde o link FOI. Fica separado de `email` porque `email` pode ser corrigido depois, e a prova é de onde o link chegou naquele momento.';

-- 3. O PDF ASSINADO ----------------------------------------------------------

-- Passa a receber e gravar CAMINHO dentro do bucket (`<token>/arquivo.pdf`),
-- não URL pública. Os nomes dos parâmetros mudam junto, porque um parâmetro
-- chamado `_url` recebendo caminho é a próxima pessoa lendo errado — e por isso
-- a versão antiga é derrubada explicitamente: `create or replace` não substitui
-- uma função cujos nomes de parâmetro mudaram, ele cria uma SEGUNDA sobrecarga,
-- e as duas ficariam de pé ao mesmo tempo.
drop function if exists public.salvar_pdf_assinado(text, text, text);

create function public.salvar_pdf_assinado(p_token text, p_comercial_path text, p_tecnica_path text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

  -- O caminho tem que começar pelo token de QUEM CHAMOU. É o que impede esta
  -- função (SECURITY DEFINER, alcançável pela chave anônima) de apontar a
  -- proposta para o arquivo de outro envelope.
  v_padrao := '^' || regexp_replace(p_token, '([^a-zA-Z0-9])', '\\\1', 'g')
              || '/[A-Za-z0-9._-]+\.pdf$';

  if p_comercial_path !~ v_padrao or p_tecnica_path !~ v_padrao then
    raise exception 'caminho de documento assinado invalido';
  end if;

  update public.propostas
  set pdf_assinado_comercial_path = p_comercial_path,
      pdf_assinado_tecnica_path = p_tecnica_path
  where id = v_proposta_id;
end;
$function$;

-- 4. O BUCKET FECHA ----------------------------------------------------------

-- Era `public = true`: a URL do PDF assinado não expira e não pede nada. Quem a
-- tivesse — de um encaminhamento de e-mail, de um histórico de navegador — lia
-- o contrato assinado para sempre. Quem serve estes arquivos agora é
-- `/api/pdf-publico/[token]/[arquivo]`, que baixa com service role.
update storage.buckets set public = false where id = 'assinatura-publica';
