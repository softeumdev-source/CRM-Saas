-- A cadência passa a começar SOZINHA quando o lead chega na prospecção.
--
-- O QUE ESTAVA FALTANDO
--
-- Medido na produção: o card "tete" levou no-show, voltou certinho para
-- Prospecção → Qualificação, sem dono, com o histórico registrado. E parou ali.
-- Nenhuma cadência começou, nenhum e-mail foi gerado, e ninguém tinha como
-- saber disso sem abrir o card e reparar na ausência.
--
-- A causa é simples e vale escrever: em TODO o sistema, o único lugar que cria
-- inscrição é o botão "Inscrever" da aba Cadência. Nem a entrega para a
-- prospecção, nem o no-show, nem a criação de um lead novo inscreviam nada. A
-- cadência existia e esperava que alguém se lembrasse dela.
--
-- ONDE ISSO TEM QUE MORAR
--
-- No banco, como gatilho, e não em cada tela. São quatro caminhos diferentes
-- que levam um lead para a prospecção (o no-show, o "enviar para prospecção" do
-- admin, o arrastar no Kanban, o lead criado direto na coluna), e resolver na
-- interface significa lembrar dos quatro — e esquecer do quinto.
--
-- QUAL CADÊNCIA, E POR QUE NÃO A MESMA PARA OS DOIS CASOS
--
-- Chegar em "Novo Lead" (funcao='entrada') e voltar para "Qualificação"
-- (funcao='retorno') são situações opostas. Na primeira o cliente nunca ouviu
-- falar de nós. Na segunda ele marcou uma reunião e não apareceu — mandar
-- "conversamos há um tempo sobre automatizar…" para quem furou ontem é escrever
-- para outra pessoa. Por isso nasce aqui uma cadência de no-show, com três
-- toques curtos que falam de UMA coisa: remarcar.

-- ── 1. UMA INSCRIÇÃO VIVA POR VEZ, EM VEZ DE UMA PARA SEMPRE ──────────────
--
-- A UNIQUE (negocio_id, cadencia_id) impedia o lead de entrar duas vezes na
-- mesma sequência — e junto impedia ele de voltar a ela DEPOIS de a primeira
-- ter terminado. Um segundo no-show do mesmo cliente não geraria nada.
--
-- A trava certa é sobre o que está VIVO. Repetir uma sequência já encerrada é
-- legítimo; duas correndo ao mesmo tempo é que seria mensagem em dobro.
--
-- Isso é seguro por causa de um detalhe do motor: a chave de idempotência das
-- mensagens é `<id_da_inscricao>:<id_do_passo>`. Uma inscrição nova é uma linha
-- nova, com uuid novo — as chaves da segunda rodada não colidem com as da
-- primeira, e o histórico das duas fica inteiro.
alter table public.cadencia_inscricoes
  drop constraint if exists cadencia_inscricoes_negocio_id_cadencia_id_key;

create unique index if not exists cadencia_inscricoes_uma_viva
  on public.cadencia_inscricoes (negocio_id, cadencia_id)
  where status in ('ativa', 'pausada');


-- ── 1b. 'no_show' PASSA A SER UM PROPÓSITO VÁLIDO ────────────────────────
--
-- O CHECK só conhecia 'primeiro_contato' e 'reaquecimento'. Ele é justamente o
-- que impede um propósito escrito errado de criar uma cadência que nenhum
-- gatilho encontra — então o jeito de somar um terceiro é somá-lo aqui, e não
-- afrouxar a coluna.
alter table public.cadencias drop constraint if exists cadencias_proposito_check;
alter table public.cadencias add constraint cadencias_proposito_check
  check (proposito in ('primeiro_contato', 'reaquecimento', 'no_show'));


-- ── 2. OS TRÊS TEXTOS DO NO-SHOW ─────────────────────────────────────────
--
-- Curtos e sem cobrança. Quem furou uma reunião já sabe que furou; o e-mail que
-- lembra disso não remarca nada. Os três falam de remarcar e nada mais.
--
-- O do WhatsApp nasce sem `template_externo_id`, então o motor o trata como
-- TAREFA: monta o texto e espera a pessoa mandar pelo Web. Categoria
-- 'utilidade' porque é o que ele é — retomada de um compromisso que o próprio
-- cliente marcou, e não abordagem comercial.
do $textos$
declare
  t record;
begin
  for t in select id from public.tenants loop

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo)
    values (
      t.id,
      'No-show 1 — não consegui te encontrar',
      'email',
      'utilidade',
      '{{primeiro_nome}}, não consegui te encontrar hoje',
      '<p>Olá, {{primeiro_nome}}, tudo bem?</p>'
      '<p>Entrei na sala no horário que a gente tinha combinado e acabamos não conseguindo '
      'conversar — imagino que tenha aparecido alguma coisa aí na {{empresa}}. Acontece.</p>'
      '<p>Quero remarcar. Me diga dois horários que funcionam para você nos próximos dias e eu '
      'mando o convite novo.</p>'
      '<p>Abraço,<br>{{vendedor}}</p>'
    )
    on conflict do nothing;

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, corpo)
    values (
      t.id,
      'No-show 2 — remarcamos? (WhatsApp)',
      'whatsapp',
      'utilidade',
      'Oi, {{primeiro_nome}}! Aqui é {{vendedor}}, da Softeum. A gente tinha uma conversa marcada '
      'sobre a automação de pedidos da {{empresa}} e acabou não rolando. Quer remarcar? Me diz um '
      'dia e um horário que funcionam para você que eu mando o convite.'
    )
    on conflict do nothing;

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo)
    values (
      t.id,
      'No-show 3 — deixo para outro momento?',
      'email',
      'utilidade',
      'Deixo para outro momento, {{primeiro_nome}}?',
      '<p>Olá, {{primeiro_nome}},</p>'
      '<p>Tentei remarcar a nossa conversa e não consegui retorno, então vou parar por aqui para '
      'não virar insistência.</p>'
      '<p>Se em algum momento fizer sentido retomar a automação de pedidos na {{empresa}}, é só '
      'responder este e-mail que eu remarco na hora.</p>'
      '<p>Abraço,<br>{{vendedor}}</p>'
    )
    on conflict do nothing;

  end loop;
end
$textos$;


-- ── 3. A CADÊNCIA DE NO-SHOW: dia 0, dia 1 e dia 4 ───────────────────────
--
-- Três toques em quatro dias, e não catorze em trinta: quem furou uma reunião
-- responde nos primeiros dias ou não responde mais. Uma sequência longa aqui
-- só transformaria um "não deu" em "esse povo não para".
do $cad$
declare
  t record;
  v_pipe uuid;
  v_cad uuid;
  v_tpl uuid;
begin
  for t in select id from public.tenants loop

    select p.id into v_pipe
      from public.pipelines p where p.tenant_id = t.id and p.chave = 'sdr' limit 1;
    continue when v_pipe is null;

    select c.id into v_cad
      from public.cadencias c
     where c.tenant_id = t.id and c.proposito = 'no_show' and c.pipeline_id = v_pipe
     limit 1;

    if v_cad is null then
      insert into public.cadencias (tenant_id, nome, tipo, pipeline_id, autonoma, ativa, proposito)
      values (t.id, 'No-show — remarcar em 3 toques', 'outbound', v_pipe, false, true, 'no_show')
      returning id into v_cad;
    end if;

    -- Idempotente: rodar de novo não duplica passo nem apaga o que foi ajustado
    -- à mão além do modelo.
    select id into v_tpl from public.templates_mensagem
     where tenant_id = t.id and nome = 'No-show 1 — não consegui te encontrar';
    if v_tpl is not null then
      insert into public.cadencia_passos (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
      values (v_cad, 1, 'email', 0, v_tpl, true)
      on conflict (cadencia_id, ordem) do update set template_id = excluded.template_id;
    end if;

    select id into v_tpl from public.templates_mensagem
     where tenant_id = t.id and nome = 'No-show 2 — remarcamos? (WhatsApp)';
    if v_tpl is not null then
      insert into public.cadencia_passos (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
      values (v_cad, 2, 'whatsapp', 24, v_tpl, true)
      on conflict (cadencia_id, ordem) do update set template_id = excluded.template_id;
    end if;

    select id into v_tpl from public.templates_mensagem
     where tenant_id = t.id and nome = 'No-show 3 — deixo para outro momento?';
    if v_tpl is not null then
      insert into public.cadencia_passos (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
      values (v_cad, 3, 'email', 72, v_tpl, true)
      on conflict (cadencia_id, ordem) do update set template_id = excluded.template_id;
    end if;

  end loop;
end
$cad$;


-- ── 4. O GATILHO ─────────────────────────────────────────────────────────
create or replace function public.inscrever_ao_chegar_na_prospeccao()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_funcao text;
  v_pipeline uuid;
  v_proposito text;
  v_cad uuid;
  v_atraso int;
begin
  -- `update of etapa_id` dispara sempre que a coluna é MENCIONADA, mesmo com o
  -- mesmo valor. Sem esta linha, salvar o card sem mover nada re-inscreveria.
  if tg_op = 'UPDATE' and new.etapa_id is not distinct from old.etapa_id then
    return new;
  end if;

  select e.funcao, e.pipeline_id into v_funcao, v_pipeline
    from public.etapas_pipeline e where e.id = new.etapa_id;

  if v_funcao = 'entrada' then
    v_proposito := 'primeiro_contato';
  elsif v_funcao = 'retorno' then
    -- Só é no-show se houve no-show. Mover um lead antigo para "Qualificação" na
    -- mão não pode disparar "não consegui te encontrar hoje" — seria escrever
    -- sobre uma reunião que nunca existiu. A janela de 30 dias é o que separa
    -- "acabou de furar" de "furou no trimestre passado".
    if not exists (
      select 1 from public.atividades a
       where a.negocio_id = new.id
         and a.compareceu is false
         and a.data_agendada > now() - interval '30 days'
    ) then
      return new;
    end if;
    v_proposito := 'no_show';
  else
    return new;
  end if;

  -- Uma cadência viva por lead. Duas correndo juntas é o cliente recebendo dois
  -- assuntos diferentes da mesma empresa no mesmo dia.
  if exists (
    select 1 from public.cadencia_inscricoes i
     where i.negocio_id = new.id and i.status in ('ativa', 'pausada')
  ) then
    return new;
  end if;

  select c.id into v_cad
    from public.cadencias c
   where c.pipeline_id = v_pipeline and c.proposito = v_proposito and c.ativa
   order by c.criado_em
   limit 1;
  if v_cad is null then return new; end if;

  select p.atraso_horas into v_atraso
    from public.cadencia_passos p where p.cadencia_id = v_cad order by p.ordem limit 1;
  -- Cadência sem passo nenhum: inscrever criaria uma inscrição que nunca anda.
  if v_atraso is null then return new; end if;

  -- `inscrito_por` fica nulo de propósito: não foi pessoa nenhuma que inscreveu.
  -- A tela lê isso como "entrou sozinha", que é a verdade.
  insert into public.cadencia_inscricoes
    (tenant_id, negocio_id, cadencia_id, proximo_envio_em)
  values
    (new.tenant_id, new.id, v_cad, now() + make_interval(hours => v_atraso))
  on conflict do nothing;

  return new;
end;
$function$;

comment on function public.inscrever_ao_chegar_na_prospeccao() is
  'Comeca a cadencia sozinha quando o lead chega na etapa de entrada (primeiro '
  'contato) ou volta para a de retorno depois de um no-show (cadencia de '
  'remarcacao). Mora no banco porque sao quatro caminhos de interface levando '
  'ao mesmo lugar.';

drop trigger if exists trg_negocios_inscrever_cadencia on public.negocios;
create trigger trg_negocios_inscrever_cadencia
  after insert or update of etapa_id on public.negocios
  for each row execute function public.inscrever_ao_chegar_na_prospeccao();
