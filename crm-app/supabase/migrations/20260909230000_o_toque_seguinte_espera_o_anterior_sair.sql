-- ---------------------------------------------------------------------------
-- O toque seguinte só nasce depois que o anterior saiu de verdade.
--
-- O BUG, relatado e confirmado: leads com o toque de WhatsApp (passo 2)
-- liberado sem o e-mail (passo 1) ter sido enviado. Medido neste banco no
-- momento da correção: 171 leads nessa situação.
--
-- A CAUSA. `processar_cadencias()` avançava `passo_atual` e agendava o próximo
-- toque no instante em que ESCREVIA a mensagem:
--
--     update public.cadencia_inscricoes
--        set passo_atual = v_passo.ordem,
--            proximo_envio_em = now() + make_interval(hours => v_seguinte.atraso_horas)
--
-- Como `cadencias.autonoma = false`, toda mensagem nasce em
-- 'aguardando_aprovacao' e espera um clique humano. O relógio, porém, já tinha
-- começado a correr. Vinte e quatro horas depois o cron gerava o passo 2 com o
-- passo 1 ainda parado na fila — e o card aparecia com dois toques prontos,
-- e-mail e WhatsApp, sem nenhum dos dois ter saído.
--
-- Não era um caso raro: era o comportamento normal de toda cadência não
-- autônoma. Os 213 leads inscritos estavam TODOS em `passo_atual = 2`.
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO, EM DUAS PARTES — e as duas são necessárias.
--
-- 1) `processar_cadencias` passa a PULAR a inscrição enquanto houver mensagem
--    dela em 'aguardando_aprovacao'. O `continue` não toca em `passo_atual`
--    nem em `proximo_envio_em`: a inscrição continua vencida e é reavaliada a
--    cada minuto, sem gerar nada, até alguém enviar o que está parado.
--
-- 2) Sozinha, a parte 1 criaria outro defeito: no minuto seguinte ao envio do
--    e-mail, o WhatsApp sairia — porque `proximo_envio_em` ficou lá atrás. O
--    espaçamento de 1 dia viraria 1 minuto.
--
--    Por isso o gatilho `trg_toque_enviado_reagenda`: quando um toque de
--    cadência vira 'enviada', ele remarca o próximo para
--    `enviada_em + atraso do passo seguinte`. O intervalo passa a ser contado
--    a partir do ENVIO DE VERDADE, que é o que "3 dias depois do e-mail"
--    sempre quis dizer.
--
-- ---------------------------------------------------------------------------
-- O QUE ISSO MUDA NA PRÁTICA
--
-- Antes: o robô cuspia os 7 toques no calendário, você mandasse ou não.
-- Agora: um toque por vez. O próximo só existe depois que o anterior saiu, e a
-- contagem de dias começa no envio.
--
-- Efeito colateral aceito: quem nunca envia o toque parado trava a cadência
-- daquele lead. É o certo — não dá para mandar o segundo argumento para quem
-- nunca recebeu o primeiro, e o card fica visível em "Toque pronto p/ enviar"
-- justamente para cobrar esse clique.
--
-- A função abaixo é a versão do repositório
-- (20260905070000_o_primeiro_toque_nasce_no_clique.sql), conferida por md5
-- contra a que está no banco, com APENAS o bloco de guarda acrescentado.
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

    -- ─────────────────────────────────────────────────────────────────────
    -- O TOQUE ANTERIOR AINDA NAO SAIU: nao gera o proximo.
    --
    -- Esta funcao avancava `passo_atual` e agendava o toque seguinte no
    -- momento em que ESCREVIA a mensagem, e nao quando ela era enviada. Com
    -- `cadencias.autonoma = false` toda mensagem nasce em
    -- 'aguardando_aprovacao' e espera um clique — entao 24h depois o passo 2
    -- (WhatsApp) era gerado com o passo 1 (e-mail) ainda parado na fila.
    -- Medido: 171 leads com WhatsApp liberado sem o e-mail ter saido.
    --
    -- `continue` sem tocar em `passo_atual` nem em `proximo_envio_em`: a
    -- inscricao continua vencida e volta a ser avaliada no minuto seguinte.
    -- Quem a destrava e o envio, e e o gatilho `trg_toque_enviado_reagenda`
    -- que remarca o proximo toque a partir da hora do envio de verdade.
    -- ─────────────────────────────────────────────────────────────────────
    if exists (
      select 1 from public.mensagens m
       where m.inscricao_id = r.id
         and m.status = 'aguardando_aprovacao'
    ) then
      continue;
    end if;

    select p.* into v_passo
      from public.cadencia_passos p
     where p.cadencia_id = r.cadencia_id and p.ordem = r.passo_atual + 1;

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

    if not v_pular then
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
    end if;

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
         set passo_atual = v_passo.ordem, status='concluida', proximo_envio_em=null
       where id = r.id;
    end if;

    if not v_pular then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;
-- ---------------------------------------------------------------------------
-- PARTE 2: o relógio do próximo toque começa no envio.
-- ---------------------------------------------------------------------------

create or replace function public.toque_enviado_reagenda_proximo()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_insc record;
  v_atraso int;
begin
  if new.status <> 'enviada' or old.status is not distinct from new.status then
    return null;
  end if;
  if new.inscricao_id is null then
    return null;
  end if;

  select i.id, i.cadencia_id, i.passo_atual, i.status
    into v_insc
    from public.cadencia_inscricoes i
   where i.id = new.inscricao_id;

  -- Inscrição parada (pausada, cancelada, concluída, respondeu) não volta a
  -- correr por causa de um envio: quem a religa é uma decisão, não um efeito.
  if not found or v_insc.status <> 'ativa' then
    return null;
  end if;

  select cp.atraso_horas into v_atraso
    from public.cadencia_passos cp
   where cp.cadencia_id = v_insc.cadencia_id
     and cp.ordem = v_insc.passo_atual + 1;

  -- Sem passo seguinte a cadência acabou; quem a conclui é a própria
  -- `processar_cadencias`, no ciclo dela.
  if not found then
    return null;
  end if;

  update public.cadencia_inscricoes
     set proximo_envio_em = coalesce(new.enviada_em, now()) + make_interval(hours => v_atraso)
   where id = new.inscricao_id;

  return null;
end;
$function$;

comment on function public.toque_enviado_reagenda_proximo() is
  'Ao um toque de cadencia virar "enviada", remarca o proximo para '
  '`enviada_em + atraso do passo seguinte`. O espacamento passa a ser contado '
  'do envio real, e nao da escrita da mensagem.';

drop trigger if exists trg_toque_enviado_reagenda on public.mensagens;
create trigger trg_toque_enviado_reagenda
  after update of status on public.mensagens
  for each row
  execute function public.toque_enviado_reagenda_proximo();

revoke all on function public.toque_enviado_reagenda_proximo() from public, anon, authenticated;
