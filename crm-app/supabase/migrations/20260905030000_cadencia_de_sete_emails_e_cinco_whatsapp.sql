-- ============================================================================
-- A cadência de prospecção passa de 7+7 para 7 e-mails + 5 WhatsApp,
-- e o primeiro toque abre pela credencial.
-- ============================================================================
--
-- POR QUE 5 E NÃO 7. O WhatsApp é o canal mais caro de todos: ele chega no
-- bolso da pessoa e cada toque a mais aproxima a mensagem de "insistência".
-- Sete toques por lá, colados um a um em cada e-mail, era o desenho que
-- deixava o par e-mail/WhatsApp dizendo a mesma coisa duas vezes na mesma
-- semana.
--
-- SAEM OS DOIS QUE MAIS SE REPETIAM, e a escolha não é aleatória:
--
--   · "importação ou integração" (WhatsApp 3) é o toque mais TÉCNICO da
--     sequência. Ele apresenta dois caminhos e pede que a pessoa escolha um.
--     Isso se lê num e-mail, onde os dois cabem em linhas separadas; espremido
--     numa bolha de WhatsApp vira um parágrafo que ninguém termina. O e-mail
--     equivalente continua na cadência, e é lá que essa conversa mora.
--
--   · "quanto tempo para começar" (WhatsApp 6) repetia o WhatsApp 2 quase
--     palavra por palavra — "sem trocar o ERP", "sem pedir nada ao seu
--     cliente" estão nos dois. Era literalmente a repetição que motivou esta
--     revisão.
--
-- O ARCO DE 30 DIAS NÃO ENCOLHE. `atraso_horas` é cumulativo a partir do passo
-- anterior, então apagar um passo puxaria todos os seguintes para mais perto.
-- Os dois passos que ficaram órfãos ABSORVEM o atraso de quem saiu (48+72=120),
-- e a linha do tempo inteira continua idêntica: 696 horas do primeiro ao último
-- toque. Isso é verificado por asserção, não por conferência de olho.
--
-- A NUMERAÇÃO PRECISA FICAR CONTÍGUA, e isso não é estética. `processar_cadencias`
-- busca `p.ordem = passo_atual + 1`; um buraco na sequência faz a função não
-- achar passo, concluir a inscrição e PARAR a cadência — em silêncio, sem erro.
-- Por isso a renumeração é em duas fases: `cadencia_passos_cadencia_id_ordem_key`
-- é índice UNIQUE, e mexer na ordem in-place colide no meio do UPDATE.
--
-- E QUEM JÁ ESTÁ NO MEIO DA CADÊNCIA vem junto: `cadencia_inscricoes.passo_atual`
-- é um INTEIRO que guarda a ordem, não o id do passo. Sem remapear, um lead
-- parado no passo 8 acordaria amanhã no passo 9 da numeração NOVA — que é outro
-- toque. O remapeamento acontece ANTES do apagamento, enquanto os números
-- antigos ainda valem.
--
-- OS DOIS MODELOS ÓRFÃOS NÃO SÃO APAGADOS. Continuam na biblioteca, prontos
-- para serem reaproveitados em outra cadência. Apagar seria irreversível e não
-- ganha nada.
--
-- ----------------------------------------------------------------------------
-- O PRIMEIRO TOQUE ABRE PELA CREDENCIAL
--
-- Ordem antiga: quem eu sou → de onde veio seu contato → o que fazemos.
-- Ordem nova:   quem eu sou → o que fazemos e para quem → de onde veio seu contato.
--
-- A primeira linha de um e-mail frio é a única que todo mundo lê. "Trabalhamos
-- com varejo em todo o território nacional" responde "por que você está
-- falando comigo?" antes de a pessoa perguntar; "recebi seu contato pelo
-- marketing" só faz sentido depois disso.
--
-- ----------------------------------------------------------------------------
-- A DESPEDIDA PERDE O NOME E A EMPRESA
--
-- Todo e-mail terminava em "Abraço, / {{vendedor}} / Softeum". A partir de
-- agora o `emailBase` acrescenta um bloco de assinatura com nome, cargo,
-- Softeum, site e WhatsApp. Somados, o cliente leria o nome duas vezes e
-- "Softeum" três, em cinco linhas seguidas. A despedida fica só "Abraço," e o
-- bloco assina — que é como assinatura de e-mail funciona.

do $$
declare
  v_cadencia   uuid;
  v_passos_antes int;
  v_soma_antes int;
  v_soma_depois int;
  v_email int;
  v_whats int;
  v_ordens text;
begin
  select id into v_cadencia
    from public.cadencias
   where proposito = 'primeiro_contato' and tenant_id is not null
   limit 1;

  if v_cadencia is null then
    raise notice 'Sem cadencia de primeiro contato neste banco — nada a fazer.';
    return;
  end if;

  select count(*), sum(atraso_horas) into v_passos_antes, v_soma_antes
    from public.cadencia_passos where cadencia_id = v_cadencia;

  -- Guarda: esta migração descreve uma cadência de 14 passos. Num banco onde
  -- ela já foi editada, sair sem fazer nada é melhor do que renumerar às cegas.
  if v_passos_antes <> 14 then
    raise notice 'A cadencia tem % passos, e nao os 14 esperados — nada a fazer.', v_passos_antes;
    return;
  end if;

  -- ── 1. os textos ────────────────────────────────────────────────────────
  update public.templates_mensagem set corpo =
    '<p>Olá, {{primeiro_nome}}, tudo bem?</p>' ||
    '<p>Aqui é {{vendedor}}, da Softeum. Trabalhamos com varejo em todo o território nacional, automatizando os pedidos que chegam até a área comercial — e recebi seu contato pela nossa equipe de marketing.</p>' ||
    '<p>Todo pedido que entra por e-mail — em Excel, TXT, CSV, PDF ou escrito no próprio corpo da mensagem — é lido e estruturado automaticamente.</p>' ||
    '<p>De lá, ele segue do jeito que a {{empresa}} preferir: importação para o sistema que vocês já usam, ou integração direta com o ERP.</p>' ||
    '<p>Podemos conversar 20 minutos?</p>' ||
    '<p>Abraço,<br />{{vendedor}}<br />Softeum</p>'
   where nome = 'Prospecção 1 — apresentação';

  update public.templates_mensagem set corpo =
    'Olá, {{primeiro_nome}}! Tudo bem? Aqui é {{vendedor}}, da Softeum.' || E'\n\n' ||
    'Trabalhamos com varejo em todo o Brasil, automatizando os pedidos que chegam por e-mail — em Excel, TXT, CSV, PDF ou escritos no corpo da mensagem. Recebi seu contato pela nossa equipe de marketing.' || E'\n\n' ||
    'O pedido é lido e entra no sistema da {{empresa}} por importação ou integração com o ERP.' || E'\n\n' ||
    'Podemos conversar 20 minutos?'
   where nome = 'Prospecção 1 — apresentação (WhatsApp)';

  -- ── 2. a despedida cede o lugar para o bloco de assinatura ──────────────
  -- `replace` e não regex: `{{` abre quantificador em POSIX ERE e escapar isso
  -- dá um padrão ilegível para ganhar nada.
  update public.templates_mensagem
     set corpo = replace(corpo, '<br />{{vendedor}}<br />Softeum</p>', '</p>')
   where corpo like '%<br />{{vendedor}}<br />Softeum</p>';

  -- ── 3. remapear quem está no meio do caminho, AINDA na numeração velha ──
  -- old → new: 1..5 iguais; 6 (WhatsApp 3, apagado) recua para 5; 7..11 caem
  -- um; 12 (WhatsApp 6, apagado) recua para 10; 13..14 caem dois.
  update public.cadencia_inscricoes
     set passo_atual = passo_atual
                     - (case when passo_atual >= 6  then 1 else 0 end)
                     - (case when passo_atual >= 12 then 1 else 0 end)
   where cadencia_id = v_cadencia
     and passo_atual is not null;

  -- ── 4. saem os dois toques ──────────────────────────────────────────────
  -- `mensagens.passo_id` é ON DELETE SET NULL: nenhuma mensagem já gerada some
  -- por causa disto — ela só perde o ponteiro para o passo que não existe mais.
  delete from public.cadencia_passos
   where cadencia_id = v_cadencia
     and template_id in (
       select id from public.templates_mensagem
        where nome in ('Prospecção 3 — importação ou integração (WhatsApp)',
                       'Prospecção 6 — quanto tempo para começar (WhatsApp)')
     );

  -- ── 5. renumerar contíguo, em duas fases por causa do índice UNIQUE ─────
  update public.cadencia_passos set ordem = ordem + 1000 where cadencia_id = v_cadencia;

  with nova as (
    select id, row_number() over (order by ordem) as n
      from public.cadencia_passos where cadencia_id = v_cadencia
  )
  update public.cadencia_passos p
     set ordem = nova.n
    from nova where nova.id = p.id;

  -- ── 6. os dois órfãos absorvem o atraso de quem saiu ────────────────────
  update public.cadencia_passos p
     set atraso_horas = 120
    from public.templates_mensagem t
   where t.id = p.template_id
     and p.cadencia_id = v_cadencia
     and t.nome in ('Prospecção 4 — o pico do mês', 'Prospecção 7 — fecho o assunto?');

  update public.cadencias
     set nome = 'Primeiro contato — 7 e-mails + 5 WhatsApp'
   where id = v_cadencia;

  -- ── 7. asserções ────────────────────────────────────────────────────────
  select count(*) filter (where canal = 'email'),
         count(*) filter (where canal = 'whatsapp'),
         sum(atraso_horas),
         string_agg(ordem::text, ',' order by ordem)
    into v_email, v_whats, v_soma_depois, v_ordens
    from public.cadencia_passos where cadencia_id = v_cadencia;

  if v_email <> 7 or v_whats <> 5 then
    raise exception 'Esperava 7 e-mails e 5 WhatsApp; ficou % e %.', v_email, v_whats;
  end if;

  if v_ordens <> '1,2,3,4,5,6,7,8,9,10,11,12' then
    raise exception 'A numeracao ficou com buraco (%) — processar_cadencias pararia a cadencia em silencio.', v_ordens;
  end if;

  if v_soma_depois <> v_soma_antes then
    raise exception 'O arco da cadencia mudou de % para % horas.', v_soma_antes, v_soma_depois;
  end if;

  if exists (
    select 1 from public.cadencia_inscricoes i
     where i.cadencia_id = v_cadencia and i.status = 'ativa'
       and not exists (
         select 1 from public.cadencia_passos p
          where p.cadencia_id = i.cadencia_id and p.ordem = i.passo_atual + 1)
       and i.passo_atual < 12
  ) then
    raise exception 'Uma inscricao viva ficou apontando para um passo que nao existe.';
  end if;

  raise notice 'Cadencia: % e-mails + % WhatsApp, ordens %, arco de % horas.',
    v_email, v_whats, v_ordens, v_soma_depois;
end $$;
