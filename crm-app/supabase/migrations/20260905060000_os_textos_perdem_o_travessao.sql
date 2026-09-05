-- ============================================================================
-- Os textos perdem o travessão, e o primeiro e-mail é reescrito.
-- ============================================================================
--
-- "Os textos estão indo com travessão que parece IA." Está certo, e dá para
-- medir: DOZE dos dezoito modelos ativos usavam `—`, dezessete ocorrências ao
-- todo, e o primeiro e-mail sozinho tinha três. É o tique de escrita mais
-- reconhecível que existe hoje, e ele estava indo para o cliente em todo toque
-- da cadência.
--
-- DUAS OPERAÇÕES DIFERENTES, de propósito:
--
-- 1. O PRIMEIRO E-MAIL (e o primeiro WhatsApp) são REESCRITOS, porque além do
--    travessão eles precisavam dizer outra coisa: "varejos e empresas em todo o
--    território nacional", e o destaque de que automatizamos TODO o recebimento
--    de pedidos até o sistema da empresa. É o toque que mais gente lê e o único
--    que precisa se apresentar.
--
-- 2. Os outros dez são CORRIGIDOS CIRURGICAMENTE. Cada travessão vira o sinal
--    que aquela frase já pedia: dois-pontos quando o que vem depois é uma lista
--    ou uma explicação, vírgula quando é uma continuação, ponto quando eram duas
--    frases fingindo ser uma. A PROSA NÃO MUDA. Reescrever texto que já está bom
--    para tirar um sinal de pontuação é como se perde a voz de uma cadência
--    inteira num commit.
--
-- Cada correção usa `replace()` com o trecho literal: se o texto já tiver sido
-- editado pela tela de admin, o replace não acha nada e não estraga a edição de
-- ninguém. Quem garante o resultado é a asserção do fim, não o replace.
--
-- OS NOMES DOS MODELOS MANTÊM O TRAVESSÃO ("Prospecção 1 — apresentação"). São
-- internos, aparecem no admin, e o cliente nunca os vê. Os ASSUNTOS já estavam
-- limpos (zero ocorrências, conferido antes de escrever isto).

do $$
declare
  v_antes int;
  v_depois int;
  v_modelos_antes int;
  v_sobrou text;
begin
  select count(*) into v_modelos_antes from public.templates_mensagem;
  select coalesce(sum(length(corpo) - length(replace(corpo, '—', ''))), 0)
    into v_antes from public.templates_mensagem;

  -- ── 1. o primeiro e-mail ────────────────────────────────────────────────
  update public.templates_mensagem set corpo =
    '<p>Olá, {{primeiro_nome}}, tudo bem?</p>' ||
    '<p>Aqui é {{vendedor}}, da Softeum. Trabalhamos com varejos e empresas em todo o território nacional, e recebi seu contato pela nossa equipe de marketing.</p>' ||
    '<p>O que fazemos é automatizar todo o recebimento de pedidos da {{empresa}}. O pedido chega, é lido e entra estruturado no sistema que vocês já usam, sem ninguém precisar digitar.</p>' ||
    '<p>O formato não atrapalha: Excel, TXT, CSV, PDF ou escrito no corpo do e-mail, a leitura é automática.</p>' ||
    '<p>E a entrada no seu sistema fica do jeito que vocês preferirem: importação no layout que o ERP já aceita hoje, ou integração direta pela API.</p>' ||
    '<p>Podemos conversar 20 minutos?</p>' ||
    '<p>Abraço,</p>'
   where nome = 'Prospecção 1 — apresentação';

  update public.templates_mensagem set corpo =
    'Olá, {{primeiro_nome}}! Tudo bem? Aqui é {{vendedor}}, da Softeum.' || E'\n\n' ||
    'Trabalhamos com varejos e empresas em todo o território nacional, e recebi seu contato pela nossa equipe de marketing.' || E'\n\n' ||
    'Automatizamos todo o recebimento de pedidos: o pedido chega em Excel, TXT, CSV, PDF ou escrito no corpo do e-mail, é lido e entra estruturado no sistema que a {{empresa}} já usa, sem ninguém digitar.' || E'\n\n' ||
    'Podemos conversar 20 minutos?'
   where nome = 'Prospecção 1 — apresentação (WhatsApp)';

  -- ── 2. os outros dez, um sinal de cada vez ──────────────────────────────
  -- Duas frases fingindo ser uma: ponto.
  update public.templates_mensagem set corpo = replace(corpo,
    'conversar — imagino que',
    'conversar. Imagino que');

  update public.templates_mensagem set corpo = replace(corpo,
    'este e-mail — o histórico fica guardado',
    'este e-mail. O histórico fica guardado');

  -- Aposto explicativo, e uma lista: dois-pontos.
  update public.templates_mensagem set corpo = replace(corpo,
    '<strong>Importação</strong> — geramos',
    '<strong>Importação</strong>: geramos');

  update public.templates_mensagem set corpo = replace(corpo,
    '<strong>Integração</strong> — o pedido',
    '<strong>Integração</strong>: o pedido');

  update public.templates_mensagem set corpo = replace(corpo,
    'aparece depois — quantidade trocada',
    'aparece depois: quantidade trocada');

  -- Um par de travessões abraçando um inciso: dois-pontos abre a lista, ponto
  -- fecha a frase. Era a construção mais artificial das dezessete.
  update public.templates_mensagem set corpo = replace(corpo,
    'Chega em rajada — fim de mês, campanha, véspera de feriado — e a fila de digitação nasce',
    'Chega em rajada: fim de mês, campanha, véspera de feriado. E a fila de digitação nasce');

  -- Continuação da mesma frase: vírgula.
  update public.templates_mensagem set corpo = replace(corpo,
    'ele não muda — e o pedido',
    'ele não muda, e o pedido');

  update public.templates_mensagem set corpo = replace(corpo,
    'do jeito que chegam — sem trocar',
    'do jeito que chegam, sem trocar');

  update public.templates_mensagem set corpo = replace(corpo,
    'prioridade na {{empresa}} — ou se prefere',
    'prioridade na {{empresa}}, ou se prefere');

  -- Oração subordinada que estava disfarçada de aposto: conectivo.
  update public.templates_mensagem set corpo = replace(corpo,
    'me diga — eu paro de escrever',
    'me diga que eu paro de escrever');

  update public.templates_mensagem set corpo = replace(corpo,
    'esta mensagem — retomo de onde paramos',
    'esta mensagem que eu retomo de onde paramos');

  -- ── 3. asserções ────────────────────────────────────────────────────────
  select coalesce(sum(length(corpo) - length(replace(corpo, '—', ''))), 0)
    into v_depois from public.templates_mensagem;

  if v_depois <> 0 then
    select string_agg(nome || ': ' || substring(corpo from '[^<>]{0,45}—[^<>]{0,45}'), ' | ')
      into v_sobrou from public.templates_mensagem where corpo like '%—%';
    raise exception 'Sobraram % travessoes nos modelos: %', v_depois, v_sobrou;
  end if;

  if (select count(*) from public.templates_mensagem) <> v_modelos_antes then
    raise exception 'A contagem de modelos mudou de % para %.',
      v_modelos_antes, (select count(*) from public.templates_mensagem);
  end if;

  -- O primeiro toque tem que dizer o que voce pediu, nos dois canais.
  if not exists (
    select 1 from public.templates_mensagem
     where nome = 'Prospecção 1 — apresentação'
       and corpo like '%varejos e empresas em todo o território nacional%'
       and corpo like '%todo o recebimento de pedidos%'
       and corpo like '%recebi seu contato pela nossa equipe de marketing%'
  ) then
    raise exception 'O primeiro e-mail nao ficou com a abertura pedida.';
  end if;

  if not exists (
    select 1 from public.templates_mensagem
     where nome = 'Prospecção 1 — apresentação (WhatsApp)'
       and corpo like '%varejos e empresas em todo o território nacional%'
       and corpo like '%todo o recebimento de pedidos%'
  ) then
    raise exception 'O primeiro WhatsApp nao ficou com a abertura pedida.';
  end if;

  -- Nenhuma variavel invalida pode ter entrado: so estas quatro sao trocadas
  -- no envio, e qualquer outra sai CRUA para o cliente.
  if exists (
    select 1 from public.templates_mensagem t,
         lateral regexp_matches(t.corpo, '\{\{([a-z_]+)\}\}', 'g') m
     where m[1] not in ('primeiro_nome', 'contato', 'empresa', 'vendedor')
  ) then
    raise exception 'Apareceu variavel que o envio nao sabe trocar.';
  end if;

  raise notice 'Travessoes: % -> %. Modelos: %.', v_antes, v_depois, v_modelos_antes;
end $$;
