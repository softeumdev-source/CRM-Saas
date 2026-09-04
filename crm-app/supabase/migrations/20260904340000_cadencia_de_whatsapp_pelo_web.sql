-- A cadência de WhatsApp volta — como TAREFA, não como envio automático.
--
-- O QUE FALTAVA, E FOI MEIO CAMINHO
--
-- A migração anterior tirou os 7 toques de WhatsApp da cadência porque a Meta
-- cobra ~R$ 0,32 por mensagem fria, e a decisão foi mandar pelo WhatsApp Web,
-- de graça. Só que aí o sistema deixou de dizer QUANDO mandar e QUAL texto —
-- e cadência sem calendário não é cadência, é lembrete na cabeça de alguém.
--
-- Agora o passo de WhatsApp volta ao calendário, e no vencimento o motor faz o
-- trabalho que ele sabe fazer: monta o texto com o nome e a empresa
-- substituídos, e deixa PRONTO. O que ele não faz é enviar. A pessoa abre o
-- WhatsApp Web em um clique, manda, e registra.
--
-- POR QUE UMA COLUNA, E NÃO UM STATUS NOVO
--
-- `status` responde "em que ponto do envio esta mensagem está". `envio_manual`
-- responde outra coisa: "por onde ela sai". São perguntas independentes — uma
-- tarefa manual pode estar pendente ou já enviada — e espremer as duas no mesmo
-- campo obrigaria a inventar `aguardando_aprovacao_manual` e
-- `enviada_manual`, dobrando cada teste que olha status.
--
-- A TRAVA QUE IMPORTA
--
-- `reservar_mensagens` só pega `status = 'aprovada'`, e mensagem manual nasce
-- em `aguardando_aprovacao` e vai direto para `enviada` quando a pessoa
-- registra — nunca passa por `aprovada`. Mesmo assim o filtro
-- `and not m.envio_manual` entra na reserva: se um dia alguém aprovar uma
-- dessas por engano na interface, o despachante tentaria mandar pela API, que
-- não está configurada, e o lead ficaria com uma falha que não foi culpa dele.
-- Duas travas para o mesmo erro, porque o custo de uma delas é uma linha.
--
-- QUANDO O LEAD RESPONDE, AS TAREFAS PENDENTES MORREM
--
-- Sem isso, o SDR abriria amanhã a lista e veria "mandar o toque 4" para
-- alguém que respondeu ontem — e o toque 4 é abordagem fria. É o mesmo erro
-- do "Pós-demonstração" que a biblioteca já corrigiu uma vez.

alter table public.mensagens
  add column if not exists envio_manual boolean not null default false;

comment on column public.mensagens.envio_manual is
  'A mensagem sai pela mao (WhatsApp Web), nao pela API. O despachante ignora; '
  'a tela oferece abrir a conversa com o texto pronto e registrar o envio.';

-- Índice do caso que a tela consulta: as tarefas ainda pendentes de um negócio.
create index if not exists mensagens_manuais_pendentes
  on public.mensagens (negocio_id)
  where envio_manual and status = 'aguardando_aprovacao';


-- ── 1. O DESPACHANTE NUNCA TOCA NO QUE É MANUAL ───────────────────────────
create or replace function public.reservar_mensagens(p_limite integer default 20)
returns setof public.mensagens
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_teto int := greatest(coalesce(p_limite, 20), 1);
begin
  -- 1. E-mail: sem freio de canal.
  return query
  with candidatas as (
    select m.id
      from public.mensagens m
     where m.canal = 'email'
       and not m.envio_manual
       and (
         (m.status = 'aprovada' and m.agendada_para <= now())
         or (m.status = 'enviando' and m.reservada_em < now() - interval '10 minutes')
       )
     order by m.agendada_para
     limit v_teto
     for update skip locked
  )
  update public.mensagens m
     set status = 'enviando', tentativas = m.tentativas + 1, reservada_em = now()
    from candidatas c
   where m.id = c.id
  returning m.*;

  -- 2. WhatsApp: uma por lead por rodada, dentro da folga do freio.
  return query
  with elegiveis as (
    select distinct on (m.negocio_id) m.id, m.agendada_para
      from public.mensagens m
     where m.canal = 'whatsapp'
       -- A trava: tarefa manual nunca entra na fila da API.
       and not m.envio_manual
       and (
         (m.status = 'aprovada' and m.agendada_para <= now())
         or (m.status = 'enviando' and m.reservada_em < now() - interval '10 minutes')
       )
       and public.whatsapp_folga(m.tenant_id) > 0
       and not public.whatsapp_lead_em_espera(m.tenant_id, m.negocio_id, m.id)
     order by m.negocio_id, m.agendada_para
  ),
  limitadas as (
    select e.id
      from elegiveis e
     order by e.agendada_para
     limit least(v_teto, coalesce((select max(public.whatsapp_folga(t.id)) from public.tenants t), 0))
  ),
  travadas as (
    select m.id
      from public.mensagens m
     where m.id in (select id from limitadas)
     for update skip locked
  )
  update public.mensagens m
     set status = 'enviando', tentativas = m.tentativas + 1, reservada_em = now()
    from travadas t
   where m.id = t.id
  returning m.*;
end;
$function$;


-- ── 2. O MOTOR: passo de WhatsApp sem Meta vira TAREFA, não pulo ──────────
create or replace function public.processar_cadencias()
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
           u.nome as nome_responsavel
      from public.cadencia_inscricoes i
      join public.cadencias c on c.id = i.cadencia_id
      join public.negocios n on n.id = i.negocio_id
      left join public.usuarios u on u.id = n.responsavel_id
     where i.status = 'ativa'
       and i.proximo_envio_em is not null
       and i.proximo_envio_em <= now()
       and c.ativa
     order by i.proximo_envio_em
     for update of i skip locked
  loop
    v_pular := false;
    v_manual := false;

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

      -- As tarefas manuais que ainda nao foram feitas MORREM aqui. Sem isto o
      -- SDR abriria a lista amanha e veria "mandar o toque 4" para quem
      -- respondeu ontem -- e o toque 4 e abordagem fria.
      update public.mensagens
         set status = 'cancelada',
             ultimo_erro = 'Cancelada: o lead respondeu antes deste toque sair.'
       where negocio_id = r.negocio_id
         and envio_manual
         and status = 'aguardando_aprovacao';
      continue;
    end if;

    select c.* into v_contato from public.contatos c where c.id = r.contato_id;

    -- Consentimento revogado CANCELA, e nao pula: quem pede para nao receber
    -- mais no WhatsApp esta pedindo para parar, nao para trocar de canal.
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
        -- Falta so ESTE canal. Pula o toque; os do outro canal continuam.
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

      -- AQUI ESTA A MUDANCA. Antes: WhatsApp sem template aprovado na Meta era
      -- PULADO, e a cadencia de WhatsApp simplesmente nao existia. Agora ele
      -- vira TAREFA: o motor monta o texto com o nome e a empresa
      -- substituidos, e a pessoa manda pelo WhatsApp Web em um clique.
      -- Quando o id da Meta existir, o mesmo passo volta a sair sozinho.
      if v_passo.canal = 'whatsapp' and coalesce(v_tpl.template_externo_id, '') = '' then
        v_manual := true;
      end if;
    end if;

    if not v_pular then
      v_primeiro_nome := split_part(coalesce(v_contato.nome, ''), ' ', 1);
      v_vendedor := coalesce(r.nome_responsavel, 'Softeum');
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
        -- Tarefa manual SEMPRE espera a pessoa, mesmo em cadencia autonoma:
        -- nao existe "enviar sozinho" quando quem envia e' uma pessoa.
        case when r.autonoma and not v_manual then 'aprovada' else 'aguardando_aprovacao' end,
        v_destino,
        case when v_passo.canal = 'email' then v_assunto else null end,
        v_corpo, 'template',
        case when v_passo.canal = 'whatsapp' then v_tpl.template_externo_id else null end,
        -- A ORDEM e' contrato com o template aprovado na Meta: {{1}} primeiro
        -- nome, {{2}} empresa, {{3}} vendedor.
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

    -- Toque pulado nao conta; tarefa manual CONTA, porque virou mensagem.
    if not v_pular then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;


-- ── 3. OS 7 TOQUES DE WHATSAPP VOLTAM AO CALENDÁRIO ───────────────────────
--
--   dia  0  e-mail    1 — apresentação          dia  1  whatsapp  1
--   dia  3  e-mail    2 — o formato             dia  5  whatsapp  2
--   dia  7  e-mail    3 — importação            dia  9  whatsapp  3
--   dia 12  e-mail    4 — o pico do mês         dia 14  whatsapp  4
--   dia 17  e-mail    5 — o custo do manual     dia 19  whatsapp  5
--   dia 22  e-mail    6 — quanto tempo          dia 24  whatsapp  6
--   dia 27  e-mail    7 — fecho o assunto?      dia 29  whatsapp  7
--
-- O eco de WhatsApp cai sempre DOIS DIAS depois do e-mail que ele repete: no
-- mesmo dia seria a mesma abordagem contada duas vezes, e muito depois ja
-- perdeu o assunto. E' o mesmo calendario que existia antes de os toques serem
-- removidos -- o que muda e' que agora eles sao tarefa, e nao envio pago.

do $volta$
declare
  t record;
  v_cad uuid;
  v_w uuid;
  i int;
  v_nomes text[] := array[
    'Prospecção 1 — apresentação (WhatsApp)',
    'Prospecção 2 — o formato não importa (WhatsApp)',
    'Prospecção 3 — importação ou integração (WhatsApp)',
    'Prospecção 4 — o pico do mês (WhatsApp)',
    'Prospecção 5 — o custo do manual (WhatsApp)',
    'Prospecção 6 — quanto tempo para começar (WhatsApp)',
    'Prospecção 7 — fecho o assunto? (WhatsApp)'
  ];
begin
  for t in select id from public.tenants loop

    select c.id into v_cad
      from public.cadencias c
      join public.pipelines p on p.id = c.pipeline_id
     where c.tenant_id = t.id and c.proposito = 'primeiro_contato' and p.chave = 'sdr'
     order by c.criado_em limit 1;

    continue when v_cad is null;

    -- Já convertida? (existe passo de WhatsApp) Nada a fazer.
    continue when exists (
      select 1 from public.cadencia_passos p
       where p.cadencia_id = v_cad and p.canal = 'whatsapp');

    -- Quem está no meio do caminho: o e-mail N vira o passo 2N-1.
    -- Vem ANTES da renumeração, pela mesma razão de sempre.
    update public.cadencia_inscricoes
       set passo_atual = passo_atual * 2 - 1
     where cadencia_id = v_cad and status = 'ativa' and passo_atual between 1 and 7;

    -- Os 7 e-mails passam a ocupar as posições ímpares. Desvio de +100 porque
    -- a UNIQUE (cadencia_id, ordem) não é adiável.
    update public.cadencia_passos set ordem = ordem + 100 where cadencia_id = v_cad;

    update public.cadencia_passos set ordem =  1, atraso_horas =  0 where cadencia_id = v_cad and ordem = 101;
    update public.cadencia_passos set ordem =  3, atraso_horas = 48 where cadencia_id = v_cad and ordem = 102;
    update public.cadencia_passos set ordem =  5, atraso_horas = 48 where cadencia_id = v_cad and ordem = 103;
    update public.cadencia_passos set ordem =  7, atraso_horas = 72 where cadencia_id = v_cad and ordem = 104;
    update public.cadencia_passos set ordem =  9, atraso_horas = 72 where cadencia_id = v_cad and ordem = 105;
    update public.cadencia_passos set ordem = 11, atraso_horas = 72 where cadencia_id = v_cad and ordem = 106;
    update public.cadencia_passos set ordem = 13, atraso_horas = 72 where cadencia_id = v_cad and ordem = 107;

    -- E os 7 de WhatsApp entram nas pares, 48h depois do e-mail que ecoam.
    --
    -- MENOS O PRIMEIRO, que vem 24h depois. O toque 1 e a apresentacao: quem
    -- acabou de receber um e-mail de apresentacao ainda lembra dele no dia
    -- seguinte, e esperar dois dias ja e' outra conversa. Do segundo em diante
    -- o ritmo abre para 48h. (Este 24 vs 48 foi o que meu proprio teste de
    -- calendario pegou: com 48 em todos, a cadencia inteira andava um dia.)
    for i in 1..7 loop
      select id into v_w from public.templates_mensagem
       where tenant_id = t.id and canal = 'whatsapp' and nome = v_nomes[i];
      continue when v_w is null;

      insert into public.cadencia_passos
        (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
      values (v_cad, i * 2, 'whatsapp', case when i = 1 then 24 else 48 end, v_w, true)
      on conflict (cadencia_id, ordem) do update
         set canal = excluded.canal,
             atraso_horas = excluded.atraso_horas,
             template_id = excluded.template_id;
    end loop;

    update public.cadencias
       set nome = 'Primeiro contato — 7 e-mails + 7 WhatsApp'
     where id = v_cad;
  end loop;
end
$volta$;
