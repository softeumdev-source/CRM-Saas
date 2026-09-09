-- ---------------------------------------------------------------------------
-- A cadência de prospecção encurta: 12 toques viram 7 — 4 e-mails e 3 WhatsApp.
--
-- Doze toques em 29 dias era muito. A sequência nova tem sete em 21 dias, com o
-- espaçamento ABRINDO conforme o lead não responde: 1, 3, 3, 4, 4, 6 dias.
-- Insistir no mesmo ritmo depois do quarto silêncio não aumenta resposta,
-- aumenta descadastro.
--
-- ---------------------------------------------------------------------------
-- A RESTRIÇÃO QUE DESENHOU ESTA MIGRATION: 213 LEADS ESTÃO NO MEIO DA FILA.
--
-- Medido agora, neste banco: as 213 inscrições ativas estão TODAS em
-- `passo_atual = 2`. Ou seja, todo mundo já recebeu os passos 1 e 2 e espera o
-- 3. E as mensagens confirmam: os passos 1 e 2 geraram 209 mensagens cada; do
-- passo 3 ao 12, ZERO.
--
-- Isso decide duas coisas:
--
-- 1. OS PASSOS 1 E 2 NÃO SÃO TOCADOS. Nem template, nem canal, nem atraso —
--    as linhas não aparecem em nenhum `update` abaixo. É o "não mude a mensagem
--    inicial", e é também o que impede um lead de receber de novo o que já
--    recebeu: `processar_cadencias` procura `ordem = passo_atual + 1`, então
--    quem está no 2 vai para o 3, e o 3 continua sendo o mesmo e-mail
--    "Prospecção 2" que ele receberia antes desta migration.
--
-- 2. DO 3 EM DIANTE DÁ PARA REESCREVER À VONTADE, porque nenhum lead chegou lá
--    e nenhuma mensagem aponta para esses passos. Não há histórico a preservar.
--
-- `mensagens.passo_id` é `on delete set null`, então apagar os passos 8..12 não
-- apagaria histórico nenhum de qualquer forma — mas, como eles nunca foram
-- usados, nem isso acontece.
--
-- ---------------------------------------------------------------------------
-- A SEQUÊNCIA NOVA, e por que cada peça está onde está.
--
--   #  canal     dia  template
--   1  email      0   Prospecção 1 — apresentação          ← INTOCADO
--   2  whatsapp   1   Prospecção 1 — apresentação (WA)     ← INTOCADO
--   3  email      4   Prospecção 2 — o formato não importa
--   4  whatsapp   7   Prospecção 2 — o formato não importa (WA)
--   5  email     11   Prospecção 4 — o pico do mês
--   6  whatsapp  15   Prospecção 4 — o pico do mês (WA)
--   7  email     21   Prospecção 7 — fecho o assunto?
--
-- Três TEMAS em par e-mail + WhatsApp (apresentação, objeção do formato, o pico
-- do mês) e um fecho sozinho. O par existe porque os dois canais dizem a mesma
-- coisa em formatos diferentes — o WhatsApp é o lembrete curto do e-mail que
-- ficou sem resposta, e por isso vem depois dele, não antes.
--
-- O último é e-mail e é o "fecho o assunto?": o toque de despedida precisa de
-- espaço para a frase inteira, e é o que mais gera resposta na cadência. Ele
-- ficar por último também casa com a regra nova de encerramento (migration
-- 20260909190000), em que a cadência esgotada manda o lead para "Perdido" — o
-- lead recebe o aviso antes de o CRM desistir dele.
--
-- Saem da sequência: "Prospecção 3 — importação ou integração", "Prospecção 5 —
-- o custo do manual" e "Prospecção 6 — quanto tempo para começar". Os templates
-- CONTINUAM na biblioteca, e podem ser usados à mão pela aba Cadência ou
-- voltarem a uma sequência futura. Nenhum é apagado.
-- ---------------------------------------------------------------------------

do $$
declare
  v_cad uuid;
  v_emails int;
  v_whats int;
  v_passos int;
  v_p1 uuid; v_p2 uuid;
  v_t3 uuid; v_t4 uuid; v_t5 uuid; v_t6 uuid; v_t7 uuid;
  v_assinatura_antes text;
  v_assinatura_depois text;
begin
  select c.id into v_cad
    from public.cadencias c
    join public.pipelines p on p.id = c.pipeline_id
   where c.proposito = 'primeiro_contato' and p.chave = 'sdr'
   order by c.criado_em
   limit 1;

  if v_cad is null then
    raise exception 'Cadencia de primeiro contato do funil do SDR nao encontrada.';
  end if;

  -- A "assinatura" dos passos 1 e 2 ANTES de mexer em qualquer coisa. No fim da
  -- migration ela e conferida de novo: se algo aqui tocar nesses dois passos,
  -- a migration aborta em vez de reenviar a primeira mensagem para 213 leads.
  select string_agg(cp.ordem || ':' || cp.canal || ':' || cp.atraso_horas || ':' || cp.template_id, '|' order by cp.ordem)
    into v_assinatura_antes
    from public.cadencia_passos cp
   where cp.cadencia_id = v_cad and cp.ordem <= 2;

  select id into v_t3 from public.templates_mensagem where nome = 'Prospecção 2 — o formato não importa' limit 1;
  select id into v_t4 from public.templates_mensagem where nome = 'Prospecção 2 — o formato não importa (WhatsApp)' limit 1;
  select id into v_t5 from public.templates_mensagem where nome = 'Prospecção 4 — o pico do mês' limit 1;
  select id into v_t6 from public.templates_mensagem where nome = 'Prospecção 4 — o pico do mês (WhatsApp)' limit 1;
  select id into v_t7 from public.templates_mensagem where nome = 'Prospecção 7 — fecho o assunto?' limit 1;

  if v_t3 is null or v_t4 is null or v_t5 is null or v_t6 is null or v_t7 is null then
    raise exception 'Faltou algum template da sequencia nova (3=%, 4=%, 5=%, 6=%, 7=%).',
      v_t3, v_t4, v_t5, v_t6, v_t7;
  end if;

  -- Passos 3 a 7 reescritos NO LUGAR (update, nao delete+insert): a linha
  -- mantem o `id`, entao qualquer `mensagens.passo_id` que venha a existir
  -- continua apontando para um passo real.
  update public.cadencia_passos set canal='email',    atraso_horas=72,  template_id=v_t3 where cadencia_id=v_cad and ordem=3;
  update public.cadencia_passos set canal='whatsapp', atraso_horas=72,  template_id=v_t4 where cadencia_id=v_cad and ordem=4;
  update public.cadencia_passos set canal='email',    atraso_horas=96,  template_id=v_t5 where cadencia_id=v_cad and ordem=5;
  update public.cadencia_passos set canal='whatsapp', atraso_horas=96,  template_id=v_t6 where cadencia_id=v_cad and ordem=6;
  update public.cadencia_passos set canal='email',    atraso_horas=144, template_id=v_t7 where cadencia_id=v_cad and ordem=7;

  delete from public.cadencia_passos where cadencia_id = v_cad and ordem > 7;

  update public.cadencias
     set nome = 'Primeiro contato — 4 e-mails + 3 WhatsApp'
   where id = v_cad;

  -- ── VERIFICAÇÕES ────────────────────────────────────────────────────────

  select string_agg(cp.ordem || ':' || cp.canal || ':' || cp.atraso_horas || ':' || cp.template_id, '|' order by cp.ordem)
    into v_assinatura_depois
    from public.cadencia_passos cp
   where cp.cadencia_id = v_cad and cp.ordem <= 2;

  if v_assinatura_depois is distinct from v_assinatura_antes then
    raise exception 'Os passos 1 e 2 mudaram, e nao podiam: antes [%], depois [%].',
      v_assinatura_antes, v_assinatura_depois;
  end if;

  select count(*) filter (where canal='email'),
         count(*) filter (where canal='whatsapp'),
         count(*)
    into v_emails, v_whats, v_passos
    from public.cadencia_passos where cadencia_id = v_cad;

  if v_emails <> 4 or v_whats <> 3 or v_passos <> 7 then
    raise exception 'Esperava 4 e-mails e 3 WhatsApp em 7 passos; ficou % / % em %.',
      v_emails, v_whats, v_passos;
  end if;

  -- Ordens contiguas 1..7: `processar_cadencias` anda por `passo_atual + 1`, e
  -- um buraco na sequencia encerraria a cadencia no meio, em silencio.
  if (select max(ordem) from public.cadencia_passos where cadencia_id = v_cad) <> 7
     or (select count(distinct ordem) from public.cadencia_passos where cadencia_id = v_cad) <> 7
  then
    raise exception 'As ordens dos passos deixaram de ser 1..7 contiguas.';
  end if;

  -- Ninguem pode ter ficado com `passo_atual` alem do ultimo passo: seria um
  -- lead preso, que `processar_cadencias` so resolveria encerrando.
  raise notice 'Cadencia com % passos (% e-mails, % WhatsApp). Inscricoes ativas alem do passo 7: %.',
    v_passos, v_emails, v_whats,
    (select count(*) from public.cadencia_inscricoes where cadencia_id = v_cad and status = 'ativa' and passo_atual > 7);
end $$;
