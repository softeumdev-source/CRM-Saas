-- A cadência de reaquecimento, e a função escolhendo ela.
--
-- POR QUE UMA SEGUNDA CADÊNCIA
--
-- A migration anterior fez o lead em nutrição voltar para o SDR já inscrito na
-- cadência. Só que a única cadência que existia é de PRIMEIRO CONTATO — ela se
-- apresenta ("meu nome é X e faço parte da equipe da Softeum"). Mandar isso para
-- alguém que já conversou com um vendedor e pediu para ser procurado depois é
-- pior do que não mandar nada: mostra que o CRM esqueceu a conversa.
--
-- POR QUE `proposito`, E NÃO `tipo`
--
-- `cadencias.tipo` já existe e é `inbound | outbound` — fala de ONDE O LEAD
-- VEIO. Reaquecimento é o PAPEL da cadência, e os dois eixos são ortogonais: um
-- lead outbound também precisa ser reaquecido. Enfiar 'reaquecimento' no `tipo`
-- faria a coluna significar duas coisas, e a primeira consulta que precisasse
-- das duas ao mesmo tempo descobriria isso do jeito ruim.
--
-- A COLUNA NASCE COM DEFAULT, então a cadência que já existe continua sendo de
-- primeiro contato sem precisar de UPDATE nenhum.

alter table public.cadencias
  add column if not exists proposito text not null default 'primeiro_contato';

alter table public.cadencias drop constraint if exists cadencias_proposito_check;
alter table public.cadencias
  add constraint cadencias_proposito_check
  check (proposito in ('primeiro_contato', 'reaquecimento'));

comment on column public.cadencias.proposito is
  'Papel da cadência: primeiro_contato (lead novo) ou reaquecimento (lead que '
  'voltou da nutrição e JÁ conversou com alguém). Ortogonal a `tipo`, que diz de '
  'onde o lead veio.';

-- ── Os três toques ─────────────────────────────────────────────────────────
--
-- Só e-mail, de propósito: um passo de WhatsApp exige template aprovado na Meta
-- (`template_externo_id`), e a conta da Meta ainda não está configurada — o
-- toque entraria na fila e falharia. E-mail funciona assim que o Gmail conectar.
--
-- O ritmo é 0h → 72h → 168h (dez dias no total). Mais lento que o de primeiro
-- contato (0/48/120) porque quem pediu para ser procurado depois não quer três
-- e-mails na mesma semana.
--
-- Todos com `parar_se_respondeu`: respondeu, o SDR assume a conversa.

do $seed$
declare
  t record;
  v_cadencia uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_t3 uuid;
  v_sdr uuid;
begin
  for t in select id from public.tenants loop
    select p.id into v_sdr
      from public.pipelines p
     where p.tenant_id = t.id and p.chave = 'sdr'
     limit 1;

    -- Sem funil de SDR não há onde pendurar a cadência.
    continue when v_sdr is null;

    -- Guarda contra reinserção: a tabela não tem unique em nome, então o
    -- critério é o par (tenant, propósito) — e só pode haver uma ativa.
    continue when exists (
      select 1 from public.cadencias c
       where c.tenant_id = t.id and c.proposito = 'reaquecimento'
    );

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (
      t.id, 'Reaquecimento 1 — voltando como combinado', 'email', 'utilidade',
      '{{primeiro_nome}}, retomando nossa conversa sobre automação de pedidos',
      '<p>Olá, {{primeiro_nome}}, tudo bem?</p>'
      '<p>Conversamos há um tempo sobre automatizar o recebimento e o processamento de pedidos na {{empresa}}, e ficou combinado de eu voltar mais para a frente. Chegou a hora.</p>'
      '<p>Mudou alguma coisa por aí desde então? Se fizer sentido retomar, me diga um horário e eu mostro em 20 minutos como a operação fica.</p>'
      '<p>Abraço,<br />{{vendedor}}</p>',
      true
    ) returning id into v_t1;

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (
      t.id, 'Reaquecimento 2 — ainda faz sentido?', 'email', 'utilidade',
      'Ainda faz sentido, {{primeiro_nome}}?',
      '<p>Oi, {{primeiro_nome}}!</p>'
      '<p>Só uma linha para saber se a automação de pedidos voltou a ser prioridade na {{empresa}} — ou se prefere que eu procure de novo mais para a frente.</p>'
      '<p>Qualquer uma das duas respostas me ajuda.</p>'
      '<p>Abraço,<br />{{vendedor}}</p>',
      true
    ) returning id into v_t2;

    -- O último toque dá permissão para dizer não. É o que costuma trazer
    -- resposta — e, quando não traz, encerra sem queimar o contato.
    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (
      t.id, 'Reaquecimento 3 — fecho o assunto?', 'email', 'utilidade',
      'Fecho o assunto por aqui, {{primeiro_nome}}?',
      '<p>Olá, {{primeiro_nome}},</p>'
      '<p>Como não consegui retorno, vou parar de procurar para não virar insistência.</p>'
      '<p>Se em algum momento a {{empresa}} quiser retomar a conversa sobre automatizar os pedidos, é só responder este e-mail — o histórico fica guardado e seguimos de onde paramos.</p>'
      '<p>Obrigado pelo tempo até aqui.<br />{{vendedor}}</p>',
      true
    ) returning id into v_t3;

    insert into public.cadencias (tenant_id, nome, tipo, proposito, pipeline_id, autonoma, ativa)
    values (
      t.id, 'Reaquecimento — 3 toques', 'inbound', 'reaquecimento', v_sdr,
      -- `autonoma = false`, igual à outra: cada toque espera aprovação humana
      -- antes de sair. A automação põe o lead na esteira; quem aperta enviar
      -- continua sendo gente.
      false, true
    ) returning id into v_cadencia;

    insert into public.cadencia_passos (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
    values (v_cadencia, 1, 'email', 0,   v_t1, true),
           (v_cadencia, 2, 'email', 72,  v_t2, true),
           (v_cadencia, 3, 'email', 168, v_t3, true);
  end loop;
end
$seed$;

-- ── A função passa a preferir a de reaquecimento ───────────────────────────
--
-- `order by (proposito = 'reaquecimento') desc` e não um `where`: se a cadência
-- de reaquecimento for desativada ou apagada, a função cai na primeira ativa em
-- vez de parar de inscrever. Degradar para "cadência errada" é ruim; degradar
-- para "nenhuma cadência" é pior, porque o lead volta e ninguém toca nele.

create or replace function public.retomar_leads_em_nutricao()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_count int := 0;
  r record;
  v_sdr_pipeline uuid;
  v_sdr_entrada uuid;
  v_sdr_prob int;
  v_cadencia_id uuid;
  v_primeiro_atraso int;
  v_destino_sdr boolean;
begin
  select e.pipeline_id, e.id, e.probabilidade
    into v_sdr_pipeline, v_sdr_entrada, v_sdr_prob
    from public.etapas_pipeline e
    join public.pipelines p on p.id = e.pipeline_id
   where p.chave = 'sdr' and e.funcao = 'entrada'
   order by e.ordem
   limit 1;

  select c.id, cp.atraso_horas
    into v_cadencia_id, v_primeiro_atraso
    from public.cadencias c
    join public.cadencia_passos cp
      on cp.cadencia_id = c.id
     and cp.ordem = (select min(cp2.ordem) from public.cadencia_passos cp2 where cp2.cadencia_id = c.id)
   where c.pipeline_id = v_sdr_pipeline
     and c.ativa
   order by (c.proposito = 'reaquecimento') desc, c.criado_em
   limit 1;

  for r in
    select n.id,
           n.tenant_id,
           n.contato_id,
           n.responsavel_id,
           n.retomar_em,
           nutricao.pipeline_id as pipeline_atual,
           entrada.id as etapa_entrada,
           entrada.probabilidade,
           coalesce(c.empresa, c.nome, n.titulo) as rotulo,
           exists (select 1 from public.propostas pr where pr.negocio_id = n.id) as tem_proposta
      from public.negocios n
      join public.etapas_pipeline nutricao
        on nutricao.id = n.etapa_id and nutricao.funcao = 'nutricao'
      join public.etapas_pipeline entrada
        on entrada.pipeline_id = nutricao.pipeline_id and entrada.funcao = 'entrada'
      left join public.contatos c on c.id = n.contato_id
     where n.retomar_em is not null
       and n.retomar_em <= now()
  loop
    v_destino_sdr := false;

    if v_sdr_entrada is not null
       and r.pipeline_atual is distinct from v_sdr_pipeline
       and not r.tem_proposta
    then
      update public.negocios
         set etapa_id = v_sdr_entrada,
             responsavel_id = null,
             vendedor_origem_id = coalesce(r.responsavel_id, vendedor_origem_id),
             probabilidade = coalesce(v_sdr_prob, 10),
             retomar_em = null,
             atualizado_em = now()
       where id = r.id;

      v_destino_sdr := true;

      if r.responsavel_id is not null then
        insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
        values (
          r.responsavel_id,
          'lead_retomado',
          'Foi para reaquecimento: ' || r.rotulo,
          'A data de retomada (' || to_char(r.retomar_em, 'DD/MM/YYYY') || ') chegou. '
            || 'O lead voltou para a prospeccao do SDR'
            || case when v_cadencia_id is not null then ', ja inscrito na cadencia' else '' end
            || '. Quando a reuniao for remarcada, ele volta para voce.',
          '/negocios/' || r.id
        );
      end if;
    else
      v_destino_sdr := r.pipeline_atual is not distinct from v_sdr_pipeline;

      update public.negocios
         set etapa_id = r.etapa_entrada,
             probabilidade = coalesce(r.probabilidade, 10),
             retomar_em = null,
             atualizado_em = now()
       where id = r.id;

      if r.responsavel_id is not null then
        insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
        values (
          r.responsavel_id,
          'lead_retomado',
          'Lead retomado: ' || r.rotulo,
          'A data de retomada (' || to_char(r.retomar_em, 'DD/MM/YYYY') || ') chegou. O lead voltou para o inicio do funil.',
          '/negocios/' || r.id
        );
      end if;
    end if;

    if v_destino_sdr and v_cadencia_id is not null then
      insert into public.cadencia_inscricoes
        (tenant_id, negocio_id, cadencia_id, inscrito_por, proximo_envio_em)
      values
        (r.tenant_id, r.id, v_cadencia_id, null,
         now() + make_interval(hours => coalesce(v_primeiro_atraso, 0)))
      on conflict (negocio_id, cadencia_id) do nothing;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;
