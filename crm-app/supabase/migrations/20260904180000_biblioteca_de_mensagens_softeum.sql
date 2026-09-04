-- A biblioteca de mensagens da Softeum, e o conserto de um toque que
-- envergonharia a empresa.
--
-- O DEFEITO QUE ESTAVA ARMADO
--
-- O 3º toque da cadência de prospecção era o template "Pós-demonstração":
--
--   Assunto: "Próximos passos após nossa conversa"
--   "Foi um prazer apresentar a plataforma da Softeum para a {{empresa}}.
--    Como combinamos, estou te enviando os próximos passos..."
--
-- Isso sairia no DIA 5 para alguém que nunca respondeu e nunca viu demonstração
-- nenhuma. Não é um texto fraco: é um texto que prova que ninguém leu a conversa
-- — e queima o contato. Sairia no instante em que o Gmail fosse conectado.
--
-- O template em si é bom e continua existindo; ele só não é um toque de
-- prospecção fria. Sai da cadência e fica como modelo avulso, para usar depois
-- de uma reunião de verdade.
--
-- A BIBLIOTECA
--
-- Cinco e-mails de primeiro contato e três de WhatsApp, escritos para o que a
-- Softeum de fato vende: ler o pedido do jeito que ele chega. Cada toque ataca
-- uma objeção diferente, em vez de repetir o primeiro com outras palavras —
-- que era o que a sequência de 3 fazia.
--
--   1. Apresentação          — de onde veio o contato, e o que fazemos
--   2. O formato não importa — a objeção "meu cliente não vai mudar"
--   3. Importação ou integração — a objeção "e para entrar no meu ERP?"
--   4. O custo do manual     — o empurrão concreto, com uma saída educada
--   5. Fecho o assunto?      — encerra sem queimar o contato
--
-- SÓ AS QUATRO VARIÁVEIS QUE O MOTOR SUBSTITUI: {{primeiro_nome}}, {{contato}},
-- {{empresa}} e {{vendedor}}. Conferido em `processar_cadencias`. Qualquer outra
-- sairia crua, com as chaves, no e-mail do cliente.
--
-- WHATSAPP FICA FORA DA CADÊNCIA ATIVA, de propósito: mandar mensagem para quem
-- não escreveu nas últimas 24 h exige template aprovado na Meta
-- (`template_externo_id`), e a conta ainda não está configurada. Os textos ficam
-- prontos aqui para serem submetidos à aprovação; quando o id voltar, é só
-- preencher e acrescentar os passos.

do $lib$
declare
  t record;
  v_cad uuid;
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_e5 uuid;
begin
  for t in select id from public.tenants loop

    -- Guarda contra reinserção, pelo nome dentro do tenant.
    continue when exists (
      select 1 from public.templates_mensagem tm
       where tm.tenant_id = t.id and tm.nome = 'Prospecção 1 — apresentação'
    );

    -- ── E-MAIL ─────────────────────────────────────────────────────────────
    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (t.id, 'Prospecção 1 — apresentação', 'email', 'utilidade',
      'Automatizar os pedidos que chegam por e-mail na {{empresa}}',
      '<p>Olá, {{primeiro_nome}}, tudo bem?</p>'
      '<p>Aqui é {{vendedor}}, da Softeum. Recebi seu contato pela nossa equipe de marketing.</p>'
      '<p>Trabalhamos com varejo em todo o território nacional, automatizando os pedidos que chegam até você. Todo pedido que entra por e-mail — em Excel, TXT, CSV, PDF ou escrito no próprio corpo da mensagem — é lido e estruturado automaticamente.</p>'
      '<p>De lá, ele segue do jeito que a {{empresa}} preferir: importação para o sistema que vocês já usam, ou integração direta com o ERP.</p>'
      '<p>Podemos conversar 20 minutos?</p>'
      '<p>Abraço,<br />{{vendedor}}<br />Softeum</p>', true)
    returning id into v_e1;

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (t.id, 'Prospecção 2 — o formato não importa', 'email', 'utilidade',
      '{{primeiro_nome}}, e se o pedido continuar chegando do jeito que chega?',
      '<p>Olá, {{primeiro_nome}},</p>'
      '<p>Escrevi há alguns dias sobre os pedidos da {{empresa}}. Queria voltar em um ponto só, porque costuma ser o que trava esse tipo de projeto.</p>'
      '<p>Quase toda solução pede para o cliente mudar: usar um portal, preencher formulário, seguir um padrão de planilha. Na prática ele não muda — e o pedido continua chegando em Excel, em PDF ou escrito no corpo do e-mail.</p>'
      '<p>A nossa lê do jeito que chega. Seu cliente não muda nada.</p>'
      '<p>Vale 20 minutos para eu mostrar com um pedido de verdade de vocês?</p>'
      '<p>Abraço,<br />{{vendedor}}<br />Softeum</p>', true)
    returning id into v_e2;

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (t.id, 'Prospecção 3 — importação ou integração', 'email', 'utilidade',
      'Importação ou integração com o ERP da {{empresa}}?',
      '<p>Olá, {{primeiro_nome}},</p>'
      '<p>A pergunta que sempre aparece nessa conversa é: e para o pedido entrar no meu sistema?</p>'
      '<p>São dois caminhos, e os dois funcionam:</p>'
      '<p><strong>Importação</strong> — geramos o arquivo no layout que o seu ERP já aceita hoje.<br />'
      '<strong>Integração</strong> — o pedido entra direto, pela API do ERP.</p>'
      '<p>Não é preciso trocar de sistema nem abrir um projeto longo para começar.</p>'
      '<p>Qual dos dois faz mais sentido na {{empresa}}? Se preferir, marcamos 20 minutos e eu mostro os dois.</p>'
      '<p>Abraço,<br />{{vendedor}}<br />Softeum</p>', true)
    returning id into v_e3;

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (t.id, 'Prospecção 4 — o custo do manual', 'email', 'utilidade',
      'Quantas horas por dia a {{empresa}} gasta digitando pedido?',
      '<p>Olá, {{primeiro_nome}},</p>'
      '<p>Vou direto ao ponto.</p>'
      '<p>Todo pedido digitado à mão custa duas coisas: o tempo de quem digita e o erro que aparece depois — quantidade trocada, código errado, pedido que volta e atrasa a entrega.</p>'
      '<p>Se isso acontece na {{empresa}}, dá para resolver sem trocar nada do que vocês já usam hoje.</p>'
      '<p>E se não for o seu caso, me diga — eu paro de escrever, sem problema nenhum.</p>'
      '<p>Abraço,<br />{{vendedor}}<br />Softeum</p>', true)
    returning id into v_e4;

    -- Dar permissão de dizer não é o que costuma trazer resposta — e, quando
    -- não traz, encerra sem queimar o contato para uma tentativa futura.
    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (t.id, 'Prospecção 5 — fecho o assunto?', 'email', 'utilidade',
      'Fecho o assunto por aqui, {{primeiro_nome}}?',
      '<p>Olá, {{primeiro_nome}},</p>'
      '<p>Como não consegui retorno, vou parar de escrever para não virar insistência.</p>'
      '<p>Se em algum momento os pedidos que chegam por e-mail virarem um problema na {{empresa}}, é só responder esta mensagem — retomo de onde paramos.</p>'
      '<p>Obrigado pelo tempo até aqui.<br />{{vendedor}}<br />Softeum</p>', true)
    returning id into v_e5;

    -- ── WHATSAPP (sem `template_externo_id` ainda; ver o cabeçalho) ────────
    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (t.id, 'Prospecção 1 — apresentação (WhatsApp)', 'whatsapp', 'utilidade', null,
      'Olá, {{primeiro_nome}}! Tudo bem? Aqui é {{vendedor}}, da Softeum.' || chr(10) || chr(10) ||
      'Recebi seu contato pela nossa equipe de marketing. Trabalhamos com varejo em todo o Brasil automatizando os pedidos que chegam por e-mail — em Excel, TXT, CSV, PDF ou escritos no corpo da mensagem.' || chr(10) || chr(10) ||
      'O pedido é lido e entra no sistema da {{empresa}} por importação ou integração com o ERP.' || chr(10) || chr(10) ||
      'Podemos conversar 20 minutos?', true);

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (t.id, 'Prospecção 2 — o formato não importa (WhatsApp)', 'whatsapp', 'utilidade', null,
      'Oi, {{primeiro_nome}}! Aqui é {{vendedor}}, da Softeum.' || chr(10) || chr(10) ||
      'Só um ponto que costuma travar esse assunto: a maioria das soluções pede para o SEU cliente mudar o jeito de mandar o pedido. Na prática ele não muda.' || chr(10) || chr(10) ||
      'A nossa lê do jeito que chega. Consigo te mostrar em 20 minutos com um pedido real de vocês. Qual dia fica melhor?', true);

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    values (t.id, 'Prospecção 3 — fecho o assunto? (WhatsApp)', 'whatsapp', 'utilidade', null,
      'Oi, {{primeiro_nome}}! Como não consegui retorno, vou parar por aqui para não incomodar.' || chr(10) || chr(10) ||
      'Se os pedidos que chegam por e-mail virarem um problema na {{empresa}}, é só me chamar que retomamos. Abraço, {{vendedor}}.', true);

    -- ── A CADÊNCIA passa a usar a biblioteca ──────────────────────────────
    select c.id into v_cad
      from public.cadencias c
      join public.pipelines p on p.id = c.pipeline_id
     where c.tenant_id = t.id and c.proposito = 'primeiro_contato' and p.chave = 'sdr'
     order by c.criado_em limit 1;

    continue when v_cad is null;

    -- ATUALIZA os passos existentes em vez de apagar e recriar: `mensagens`
    -- aponta para `cadencia_passos` pelo `passo_id`, e apagar um passo com
    -- histórico levaria junto a rastreabilidade de quem recebeu o quê.
    update public.cadencia_passos set template_id = v_e1, atraso_horas = 0,   canal = 'email' where cadencia_id = v_cad and ordem = 1;
    update public.cadencia_passos set template_id = v_e2, atraso_horas = 72,  canal = 'email' where cadencia_id = v_cad and ordem = 2;
    update public.cadencia_passos set template_id = v_e3, atraso_horas = 96,  canal = 'email' where cadencia_id = v_cad and ordem = 3;

    insert into public.cadencia_passos (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
    values (v_cad, 4, 'email', 120, v_e4, true),
           (v_cad, 5, 'email', 168, v_e5, true)
    on conflict (cadencia_id, ordem) do update
       set template_id = excluded.template_id,
           atraso_horas = excluded.atraso_horas,
           canal = excluded.canal;

    update public.cadencias set nome = 'Primeiro contato — 5 toques' where id = v_cad;

    -- Os dois textos que a biblioteca substitui saem do caminho. Renomeados, e
    -- não apagados: o seletor de modelos do admin NÃO filtra por `ativo`, então
    -- só desativar deixaria dois "Primeiro contato" na lista para confundir.
    update public.templates_mensagem
       set nome = nome || ' (antigo — substituído pela biblioteca)', ativo = false
     where tenant_id = t.id
       and canal = 'email'
       and nome in ('Primeiro contato', 'Follow-up / aquecer lead');

    update public.templates_mensagem
       set nome = nome || ' (antigo)', ativo = false
     where tenant_id = t.id
       and canal = 'whatsapp'
       and nome in ('Primeiro contato', 'Follow-up / aquecer lead');
  end loop;
end
$lib$;
