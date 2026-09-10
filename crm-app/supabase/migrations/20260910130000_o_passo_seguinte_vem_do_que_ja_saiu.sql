-- ---------------------------------------------------------------------------
-- O passo seguinte é decidido pelo que JÁ SAIU, e não pelo ponteiro.
--
-- A pedido, depois do estrago: "cuide para não acontecer com os próximos".
--
-- ---------------------------------------------------------------------------
-- POR QUE A CORREÇÃO ANTERIOR NÃO BASTAVA.
--
-- A migration 20260910100000 consertou a CAUSA conhecida: `passo_atual` parou
-- de andar na escrita e passou a andar no envio. Mas ela não mexeu na estrutura
-- do problema — `processar_cadencias` continuava perguntando o passo seguinte a
-- UMA coluna, e acreditando na resposta.
--
-- Conferido depois do conserto, forçando à mão o estado que causou o estrago:
--
--     update cadencia_inscricoes set passo_atual = 2, proximo_envio_em = now()
--     -- (a inscrição não tinha NENHUM envio)
--
--     resultado: escreveu o passo 3 — o segundo e-mail. De novo.
--
-- Ou seja: bastava qualquer caminho futuro adiantar o ponteiro — uma função
-- nova, um `update` manual, um import — para o lead voltar a receber "Escrevi
-- há alguns dias" sem nunca ter recebido nada. Consertar a causa conhecida não
-- protege contra a próxima causa.
--
-- ---------------------------------------------------------------------------
-- O CONSERTO: o ponteiro deixa de ser a verdade e vira um atalho.
--
-- A verdade sobre "até onde esta cadência andou" já estava em `mensagens` — é
-- o maior passo que tem um toque de VERDADE registrado. Agora é de lá que o
-- passo seguinte sai, e o ponteiro é conferido contra isso a cada ciclo. Se ele
-- discordar, ele é corrigido, e a cadência segue pelo caminho certo.
--
-- "Toque de verdade" é a linha cuja chave de idempotência NÃO foi liberada. A
-- distinção já existia e é a mesma da migration anterior:
--
--   chave normal ('<inscricao>:<passo>')  → o passo foi tratado: enviado,
--                                            falhou, ou pulado de propósito.
--   chave 'cancelado:<id>'                → a cadência foi DESLIGADA e o toque
--                                            caiu junto. O passo não aconteceu,
--                                            e será reescrito ao religar.
--
-- Com isso, o mesmo teste que reproduzia o defeito passa a escrever o passo 1.
--
-- ---------------------------------------------------------------------------
-- O PASSO PULADO AGORA DEIXA RASTRO — e isso não é enfeite, é o que fecha o
-- raciocínio acima.
--
-- Quando o contato não tem endereço no canal do passo (só e-mail, ou só
-- WhatsApp), nenhuma mensagem era escrita: o ponteiro simplesmente pulava. Isso
-- era invisível no histórico E incompatível com a regra nova — sem linha em
-- `mensagens`, o passo pulado não contaria como tratado e seria tentado para
-- sempre.
--
-- Agora ele grava uma linha 'cancelada' dizendo o motivo. Ganha-se as duas
-- coisas: a regra fecha, e quem abre o lead vê "pulado: o contato não tem
-- WhatsApp cadastrado" em vez de um buraco inexplicável na sequência.
-- ---------------------------------------------------------------------------

create or replace function public.processar_cadencias(p_inscricao_id uuid default null)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_count int := 0;
  r record;
  v_passo record;
  v_seguinte record;
  v_contato record;
  v_tpl record;
  v_assunto text;
  v_corpo text;
  v_primeiro_nome text;
  v_destino text;
  v_vendedor text;
  v_pular boolean;
  v_manual boolean;
  v_tem_algum_destino boolean;
  v_inseriu int;
  v_consumir boolean;
  v_tratado int;
begin
  for r in
    select i.id, i.negocio_id, i.cadencia_id, i.passo_atual, i.tenant_id, i.criado_em as inscrito_em,
           c.autonoma, n.contato_id, n.titulo as negocio_titulo,
           u.nome as nome_responsavel,
           t.caixa_email_nome as nome_da_caixa
      from public.cadencia_inscricoes i
      join public.cadencias c on c.id = i.cadencia_id
      join public.negocios n on n.id = i.negocio_id
      left join public.usuarios u on u.id = n.responsavel_id
      left join public.tenants t on t.id = i.tenant_id
     where i.status = 'ativa'
       and i.proximo_envio_em is not null
       and i.proximo_envio_em <= now()
       and c.ativa
       and (p_inscricao_id is null or i.id = p_inscricao_id)
     order by i.proximo_envio_em
     for update of i skip locked
  loop
    v_pular := false;
    v_manual := false;
    v_consumir := false;

    -- O TOQUE ANTERIOR AINDA NAO SAIU: nao gera o proximo.
    if exists (
      select 1 from public.mensagens m
       where m.inscricao_id = r.id
         and m.status = 'aguardando_aprovacao'
    ) then
      continue;
    end if;

    -- ─────────────────────────────────────────────────────────────────────
    -- ATÉ ONDE ESTA CADÊNCIA ANDOU DE VERDADE.
    --
    -- Não vem de `passo_atual`: vem do maior passo com um toque REGISTRADO.
    -- Toque que caiu junto com o desligamento da cadência não conta — a chave
    -- 'cancelado:' é o que marca essa diferença.
    --
    -- É esta consulta que impede a repetição do defeito relatado. Mesmo que o
    -- ponteiro esteja adiantado por qualquer motivo, o lead que nunca recebeu
    -- nada recebe a mensagem 1.
    -- ─────────────────────────────────────────────────────────────────────
    select coalesce(max(cp.ordem), 0) into v_tratado
      from public.mensagens m
      join public.cadencia_passos cp on cp.id = m.passo_id
     where m.inscricao_id = r.id
       and coalesce(m.idempotency_key, '') not like 'cancelado:%';

    if v_tratado is distinct from r.passo_atual then
      update public.cadencia_inscricoes
         set passo_atual = v_tratado
       where id = r.id;
    end if;

    select p.* into v_passo
      from public.cadencia_passos p
     where p.cadencia_id = r.cadencia_id and p.ordem = v_tratado + 1;

    if not found then
      update public.cadencia_inscricoes set status='concluida', proximo_envio_em=null where id=r.id;
      continue;
    end if;

    if v_passo.parar_se_respondeu and exists (
      select 1 from public.mensagens m
       where m.negocio_id = r.negocio_id and m.direcao = 'entrada'
         and not m.automatica
         and coalesce(m.recebida_em, m.criado_em) > r.inscrito_em
    ) then
      update public.cadencia_inscricoes set status='respondeu', proximo_envio_em=null where id=r.id;

      update public.mensagens
         set status = 'cancelada',
             ultimo_erro = 'Cancelada: o lead respondeu antes deste toque sair.'
       where negocio_id = r.negocio_id
         and envio_manual
         and status = 'aguardando_aprovacao';
      continue;
    end if;

    select c.* into v_contato from public.contatos c where c.id = r.contato_id;

    if exists (
      select 1 from public.consentimentos k
       where k.contato_id = r.contato_id and k.canal = v_passo.canal and k.revogado_em is not null
    ) then
      update public.cadencia_inscricoes set status='cancelada', proximo_envio_em=null where id=r.id;
      update public.mensagens
         set status = 'cancelada',
             ultimo_erro = 'Cancelada: o contato revogou o consentimento neste canal.'
       where negocio_id = r.negocio_id
         and envio_manual
         and status = 'aguardando_aprovacao';
      continue;
    end if;

    v_destino := case when v_passo.canal = 'whatsapp'
                      then coalesce(nullif(v_contato.whatsapp, ''), v_contato.telefone)
                      else v_contato.email end;

    if coalesce(v_destino, '') = '' then
      v_tem_algum_destino :=
        coalesce(v_contato.email, '') <> ''
        or coalesce(nullif(v_contato.whatsapp, ''), v_contato.telefone, '') <> '';

      if v_tem_algum_destino then
        v_pular := true;
      else
        update public.cadencia_inscricoes set status='pausada', proximo_envio_em=null where id=r.id;
        insert into public.mensagens (
          tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
          canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
        ) values (
          r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
          v_passo.canal, 'falhou',
          'Cadencia pausada: o contato nao tem e-mail, WhatsApp nem telefone cadastrado.',
          'template', r.id::text || ':' || v_passo.id::text,
          'contato sem nenhum canal'
        ) on conflict (idempotency_key) do nothing;
        continue;
      end if;
    end if;

    if not v_pular then
      select t.* into v_tpl from public.templates_mensagem t where t.id = v_passo.template_id;

      if not found then
        update public.cadencia_inscricoes set status='pausada', proximo_envio_em=null where id=r.id;
        insert into public.mensagens (
          tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
          canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
        ) values (
          r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
          v_passo.canal, 'falhou',
          'Cadencia pausada: o passo ' || v_passo.ordem || ' esta sem modelo de mensagem.',
          'template', r.id::text || ':' || v_passo.id::text,
          'passo sem modelo'
        ) on conflict (idempotency_key) do nothing;
        continue;
      end if;

      if v_passo.canal = 'whatsapp' and coalesce(v_tpl.template_externo_id, '') = '' then
        v_manual := true;
      end if;
    end if;

    if v_pular then
      -- O PASSO PULADO DEIXA RASTRO.
      --
      -- Sem esta linha o passo não contaria como tratado pela consulta lá em
      -- cima, e seria tentado de novo a cada minuto, para sempre. E o histórico
      -- do lead teria um buraco sem explicação.
      insert into public.mensagens (
        tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
        canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
      ) values (
        r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
        v_passo.canal, 'cancelada',
        'Passo pulado: o contato nao tem ' ||
          case when v_passo.canal = 'whatsapp' then 'WhatsApp' else 'e-mail' end ||
          ' cadastrado.',
        'template', r.id::text || ':' || v_passo.id::text,
        'contato sem endereco neste canal'
      ) on conflict (idempotency_key) do nothing;

      v_consumir := true;
    else
      v_primeiro_nome := split_part(coalesce(v_contato.nome, ''), ' ', 1);
      v_vendedor := coalesce(r.nome_da_caixa, r.nome_responsavel, 'Softeum');
      v_assunto := coalesce(v_tpl.assunto, 'Sobre ' || coalesce(v_contato.empresa, r.negocio_titulo));
      v_corpo := coalesce(v_tpl.corpo, '');

      v_assunto := replace(replace(replace(replace(v_assunto,
        '{{primeiro_nome}}', v_primeiro_nome), '{{contato}}', coalesce(v_contato.nome, '')),
        '{{empresa}}', coalesce(v_contato.empresa, '')), '{{vendedor}}', v_vendedor);
      v_corpo := replace(replace(replace(replace(v_corpo,
        '{{primeiro_nome}}', v_primeiro_nome), '{{contato}}', coalesce(v_contato.nome, '')),
        '{{empresa}}', coalesce(v_contato.empresa, '')), '{{vendedor}}', v_vendedor);

      insert into public.mensagens (
        tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
        canal, status, destino, assunto, corpo, gerado_por,
        template_externo, variaveis, idempotency_key, agendada_para, envio_manual
      ) values (
        r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
        v_passo.canal,
        case when r.autonoma and not v_manual then 'aprovada' else 'aguardando_aprovacao' end,
        v_destino,
        case when v_passo.canal = 'email' then v_assunto else null end,
        v_corpo, 'template',
        case when v_passo.canal = 'whatsapp' then v_tpl.template_externo_id else null end,
        case when v_passo.canal = 'whatsapp'
             then array[v_primeiro_nome, coalesce(v_contato.empresa, ''), v_vendedor]
             else null end,
        r.id::text || ':' || v_passo.id::text,
        now(),
        v_manual
      ) on conflict (idempotency_key) do nothing;

      get diagnostics v_inseriu = row_count;

      -- A chave já existia e a linha não entrou: este passo já teve um toque
      -- que NÃO foi devolvido à fila. Consome o passo, senão a inscrição
      -- ficaria estacionada nele para sempre.
      if v_inseriu = 0 then
        v_consumir := true;
      end if;
    end if;

    if v_consumir then
      select p.* into v_seguinte
        from public.cadencia_passos p
       where p.cadencia_id = r.cadencia_id and p.ordem = v_passo.ordem + 1;

      if found then
        update public.cadencia_inscricoes
           set passo_atual = v_passo.ordem,
               proximo_envio_em = now() + make_interval(hours => v_seguinte.atraso_horas)
         where id = r.id;
      else
        update public.cadencia_inscricoes
           set passo_atual = v_passo.ordem, status = 'concluida', proximo_envio_em = null
         where id = r.id;
      end if;
      continue;
    end if;

    -- O TOQUE FOI ESCRITO, E SÓ ISSO. `passo_atual` fica onde está: quem o
    -- avança é `trg_toque_move_a_cadencia`, no envio de verdade.
    update public.cadencia_inscricoes
       set proximo_envio_em = null
     where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

comment on function public.processar_cadencias(uuid) is
  'Escreve o proximo toque de cada inscricao vencida. O passo seguinte vem do '
  'MAIOR PASSO COM TOQUE REGISTRADO em `mensagens` (chave nao liberada), e nao '
  'de `passo_atual` -- o ponteiro e conferido contra isso e corrigido se '
  'discordar. E o que impede o lead de receber o segundo e-mail sem ter '
  'recebido o primeiro, mesmo que algo adiante o ponteiro no futuro.';
