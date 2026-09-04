-- Sete e-mails na cadência de prospecção, em vez de cinco.
--
-- A cadência vai de 10 para 12 toques: 7 e-mails e os mesmos 5 WhatsApp. O
-- WhatsApp não muda porque não foi pedido — e porque cada texto novo ali custa
-- uma submissão a mais para aprovar na Meta.
--
-- O QUE OS DOIS E-MAILS NOVOS DIZEM, E POR QUE NÃO SÃO REPETIÇÃO
--
-- A regra da biblioteca continua a mesma: cada toque ataca UMA objeção
-- diferente, em vez de reescrever o primeiro com outras palavras. Os cinco que
-- já existiam cobriam de onde veio o contato, o formato do pedido, a entrada no
-- ERP, o custo do trabalho manual e o encerramento. Faltavam duas objeções que
-- aparecem sempre e não estavam em lugar nenhum:
--
--   4. O PICO — pedido não chega distribuído, chega em rajada, e a fila de
--      digitação nasce no dia em que o pedido tinha mais pressa.
--   6. O MEDO DE VIRAR PROJETO — "isso vai puxar TI, cronograma e seis meses".
--      É o que trava a conversa logo antes de alguém desistir, e por isso vem
--      imediatamente antes do toque de encerramento.
--
-- Nenhum dos dois promete número, caso de cliente ou porcentagem: o que não dá
-- para provar não entra em e-mail frio assinado pela empresa.
--
-- O CALENDÁRIO (dia contado da inscrição; `atraso_horas` é o intervalo desde o
-- toque anterior, que é como o motor lê)
--
--   dia  0  e-mail    1 — apresentação
--   dia  1  whatsapp  1 — apresentação
--   dia  3  e-mail    2 — o formato não importa
--   dia  5  whatsapp  2 — o formato não importa
--   dia  7  e-mail    3 — importação ou integração
--   dia  9  whatsapp  3 — importação ou integração
--   dia 12  e-mail    4 — o pico do mês                  (novo)
--   dia 15  e-mail    5 — o custo do manual
--   dia 17  whatsapp  5 — o custo do manual
--   dia 20  e-mail    6 — quanto tempo para começar      (novo)
--   dia 24  e-mail    7 — fecho o assunto?
--   dia 26  whatsapp  7 — fecho o assunto?
--
-- Continua sem dois toques no mesmo dia. A janela cresce de 19 para 26 dias:
-- dois e-mails a mais não cabem sem esticar o fim sem espremer o meio, e
-- espremer o meio é o que transforma cadência em perseguição.
--
-- A NUMERAÇÃO DA BIBLIOTECA ACOMPANHA
--
-- O número no nome é a posição do toque, e é assim que alguém lê a lista do
-- admin e entende a ordem. Com dois e-mails entrando no meio, "o custo do
-- manual" passa de 4 para 5 e "fecho o assunto?" de 5 para 7 — nos dois canais,
-- porque o texto de WhatsApp carrega o número do e-mail que ele ecoa. Os
-- números de WhatsApp ficam 1, 2, 3, 5 e 7: o buraco é informação, e diz quais
-- toques têm eco no outro canal.
--
-- Renomear é seguro: `mensagens` se pendura em `cadencia_passos.passo_id`, não
-- no nome nem no id do modelo, e não há índice único sobre `nome`. Mesmo assim
-- os renomes vão do maior para o menor (5→7 antes de 4→5), para a biblioteca
-- nunca ter dois modelos com o mesmo nome nem por um instante.

do $sete$
declare
  t record;
  v_cad uuid;
  v_pico uuid;
  v_tempo uuid;
begin
  for t in select id from public.tenants loop

    select c.id into v_cad
      from public.cadencias c
      join public.pipelines p on p.id = c.pipeline_id
     where c.tenant_id = t.id and c.proposito = 'primeiro_contato' and p.chave = 'sdr'
     order by c.criado_em limit 1;

    continue when v_cad is null;

    -- Já convertida? (existe um 12º passo) Nada a fazer.
    continue when exists (
      select 1 from public.cadencia_passos p where p.cadencia_id = v_cad and p.ordem = 12);

    -- ── A BIBLIOTECA RENUMERA ─────────────────────────────────────────────
    -- Do maior para o menor, sempre: ver o cabeçalho.
    update public.templates_mensagem set nome = 'Prospecção 7 — fecho o assunto?'
     where tenant_id = t.id and canal = 'email' and nome = 'Prospecção 5 — fecho o assunto?';
    update public.templates_mensagem set nome = 'Prospecção 7 — fecho o assunto? (WhatsApp)'
     where tenant_id = t.id and canal = 'whatsapp' and nome = 'Prospecção 5 — fecho o assunto? (WhatsApp)';

    update public.templates_mensagem set nome = 'Prospecção 5 — o custo do manual'
     where tenant_id = t.id and canal = 'email' and nome = 'Prospecção 4 — o custo do manual';
    update public.templates_mensagem set nome = 'Prospecção 5 — o custo do manual (WhatsApp)'
     where tenant_id = t.id and canal = 'whatsapp' and nome = 'Prospecção 4 — o custo do manual (WhatsApp)';

    -- ── OS DOIS TEXTOS NOVOS ──────────────────────────────────────────────
    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    select t.id, 'Prospecção 4 — o pico do mês', 'email', 'utilidade',
      'E quando os pedidos chegam todos no mesmo dia, {{primeiro_nome}}?',
      '<p>Olá, {{primeiro_nome}},</p>'
      '<p>Tem um detalhe que só aparece no dia cheio: pedido não chega distribuído. Chega em rajada — fim de mês, campanha, véspera de feriado — e a fila de digitação nasce exatamente quando o pedido tinha mais pressa de sair.</p>'
      '<p>Contratar gente para o pico é caro. Deixar a fila crescer atrasa a entrega, e atraso de entrega vira cancelamento.</p>'
      '<p>A leitura automática não depende de quantas pessoas estão disponíveis naquele dia: o pico entra junto com o resto.</p>'
      '<p>Se isso pesa na {{empresa}}, são 20 minutos de conversa.</p>'
      '<p>Abraço,<br />{{vendedor}}<br />Softeum</p>', true
     where not exists (
       select 1 from public.templates_mensagem x
        where x.tenant_id = t.id and x.nome = 'Prospecção 4 — o pico do mês');

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    select t.id, 'Prospecção 6 — quanto tempo para começar', 'email', 'utilidade',
      'Não precisa virar projeto, {{primeiro_nome}}',
      '<p>Olá, {{primeiro_nome}},</p>'
      '<p>O que costuma travar essa conversa é a suspeita de que vai virar projeto: TI envolvida, cronograma, reunião toda semana, e nada rodando antes do semestre que vem.</p>'
      '<p>Não é assim que começa. A gente parte dos pedidos que já chegam na caixa de vocês hoje, do jeito que chegam — sem trocar o ERP da {{empresa}} e sem pedir nada ao seu cliente.</p>'
      '<p>Se depois fizer sentido integrar direto pela API, integra. Mas isso é o passo dois, não a condição para o passo um.</p>'
      '<p>Vinte minutos, com um pedido de verdade de vocês na tela?</p>'
      '<p>Abraço,<br />{{vendedor}}<br />Softeum</p>', true
     where not exists (
       select 1 from public.templates_mensagem x
        where x.tenant_id = t.id and x.nome = 'Prospecção 6 — quanto tempo para começar');

    select id into v_pico  from public.templates_mensagem where tenant_id = t.id and nome = 'Prospecção 4 — o pico do mês';
    select id into v_tempo from public.templates_mensagem where tenant_id = t.id and nome = 'Prospecção 6 — quanto tempo para começar';

    continue when v_pico is null or v_tempo is null;

    -- ── OS PASSOS ─────────────────────────────────────────────────────────
    -- RENUMERAR sem apagar, de novo: `mensagens.passo_id` aponta para estas
    -- linhas, e recriar os passos jogaria fora o rastro de quem recebeu o quê.
    -- O desvio de +100 evita colisão com a UNIQUE (cadencia_id, ordem) no meio
    -- do caminho — a restrição não é adiável.
    update public.cadencia_passos set ordem = ordem + 100 where cadencia_id = v_cad;

    update public.cadencia_passos set ordem =  1, atraso_horas =  0 where cadencia_id = v_cad and ordem = 101;
    update public.cadencia_passos set ordem =  2, atraso_horas = 24 where cadencia_id = v_cad and ordem = 102;
    update public.cadencia_passos set ordem =  3, atraso_horas = 48 where cadencia_id = v_cad and ordem = 103;
    update public.cadencia_passos set ordem =  4, atraso_horas = 48 where cadencia_id = v_cad and ordem = 104;
    update public.cadencia_passos set ordem =  5, atraso_horas = 48 where cadencia_id = v_cad and ordem = 105;
    update public.cadencia_passos set ordem =  6, atraso_horas = 48 where cadencia_id = v_cad and ordem = 106;
    -- 107 (e-mail, custo do manual) e 108 (WhatsApp do mesmo) abrem espaço para
    -- o pico do mês, que entra como 7.
    update public.cadencia_passos set ordem =  8, atraso_horas = 72 where cadencia_id = v_cad and ordem = 107;
    update public.cadencia_passos set ordem =  9, atraso_horas = 48 where cadencia_id = v_cad and ordem = 108;
    -- 109 (e-mail, fecho) e 110 (WhatsApp do mesmo) abrem espaço para o
    -- "quanto tempo para começar", que entra como 10.
    update public.cadencia_passos set ordem = 11, atraso_horas = 96 where cadencia_id = v_cad and ordem = 109;
    update public.cadencia_passos set ordem = 12, atraso_horas = 48 where cadencia_id = v_cad and ordem = 110;

    insert into public.cadencia_passos (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
    values (v_cad,  7, 'email', 72, v_pico,  true),
           (v_cad, 10, 'email', 72, v_tempo, true)
    on conflict (cadencia_id, ordem) do update
       set canal = excluded.canal,
           atraso_horas = excluded.atraso_horas,
           template_id = excluded.template_id;

    -- Quem está no meio do caminho segue de onde parou. Só os passos que
    -- MUDARAM de número precisam de conserto; 1 a 6 ficaram onde estavam.
    -- Sem isto, um lead que já recebeu o "custo do manual" (passo 7 antigo)
    -- receberia agora o "pico do mês" e depois o custo do manual OUTRA VEZ.
    update public.cadencia_inscricoes
       set passo_atual = case passo_atual
                           when  7 then  8
                           when  8 then  9
                           when  9 then 11
                           when 10 then 12
                         end
     where cadencia_id = v_cad and status = 'ativa' and passo_atual between 7 and 10;

    update public.cadencias
       set nome = 'Primeiro contato — 12 toques (7 e-mails + 5 WhatsApp)'
     where id = v_cad;
  end loop;
end
$sete$;
