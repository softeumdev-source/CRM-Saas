-- Sete mensagens de WhatsApp, fechando o par de cada e-mail.
--
-- A cadência vai de 12 para 14 toques: 7 e-mails e 7 WhatsApp. Faltavam os
-- ecos dos e-mails 4 (o pico do mês) e 6 (quanto tempo para começar), que
-- entraram na rodada anterior sem par no outro canal — e era isso que fazia a
-- numeração de WhatsApp ter buracos (1, 2, 3, 5, 7).
--
-- Agora todo e-mail tem um eco, e o eco vem SEMPRE dois dias depois do e-mail
-- que ele repete. Isso não é enfeite de calendário: o WhatsApp que chega no
-- mesmo dia do e-mail é a mesma abordagem contada duas vezes, e o que chega
-- muito depois já perdeu o assunto. Dois dias é o intervalo em que ainda dá
-- para escrever "mandei um e-mail sobre isso" sem soar estranho.
--
-- O TEXTO DE WHATSAPP NÃO É O E-MAIL ENCURTADO
--
-- Ele repete a MESMA objeção, com as palavras que se usa numa conversa: sem
-- assunto, sem assinatura, sem parágrafo de abertura. É por isso que os dois
-- textos abaixo cabem em três blocos e terminam em pergunta.
--
-- AS TRÊS VARIÁVEIS SÃO OBRIGATÓRIAS EM TODO TEXTO DE WHATSAPP
--
-- `processar_cadencias` manda sempre `[primeiro_nome, empresa, vendedor]` para
-- a Meta, e a Meta recusa o envio quando a contagem de parâmetros não bate com
-- a que o template declara. Um texto que esqueça `{{empresa}}` é aprovado com
-- duas variáveis e falha em TODO envio depois — foi exatamente esse o defeito
-- encontrado no texto 2 duas migrações atrás. Os dois novos citam as três.
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
--   dia 12  e-mail    4 — o pico do mês
--   dia 14  whatsapp  4 — o pico do mês                  (novo)
--   dia 17  e-mail    5 — o custo do manual
--   dia 19  whatsapp  5 — o custo do manual
--   dia 22  e-mail    6 — quanto tempo para começar
--   dia 24  whatsapp  6 — quanto tempo para começar      (novo)
--   dia 27  e-mail    7 — fecho o assunto?
--   dia 29  whatsapp  7 — fecho o assunto?
--
-- A partir do dia 12 o ritmo fica regular e previsível: e-mail, dois dias
-- depois o WhatsApp, três dias depois o próximo e-mail. Nenhum dia com dois
-- toques. A janela cresce de 26 para 29 dias — 14 toques não cabem em menos
-- sem colocar dois no mesmo dia, que é o que se quer evitar.

do $par$
declare
  t record;
  v_cad uuid;
  v_wpico uuid;
  v_wtempo uuid;
begin
  for t in select id from public.tenants loop

    select c.id into v_cad
      from public.cadencias c
      join public.pipelines p on p.id = c.pipeline_id
     where c.tenant_id = t.id and c.proposito = 'primeiro_contato' and p.chave = 'sdr'
     order by c.criado_em limit 1;

    continue when v_cad is null;

    -- Já convertida? (existe um 14º passo) Nada a fazer.
    continue when exists (
      select 1 from public.cadencia_passos p where p.cadencia_id = v_cad and p.ordem = 14);

    -- ── OS DOIS TEXTOS NOVOS ──────────────────────────────────────────────
    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    select t.id, 'Prospecção 4 — o pico do mês (WhatsApp)', 'whatsapp', 'utilidade', null,
      'Oi, {{primeiro_nome}}! Aqui é {{vendedor}}, da Softeum.' || chr(10) || chr(10) ||
      'Um ponto que só aparece no dia cheio: pedido não chega distribuído, chega em rajada. E a fila de digitação nasce justamente quando o pedido tinha mais pressa de sair.' || chr(10) || chr(10) ||
      'A leitura automática não depende de quantas pessoas estão disponíveis naquele dia. Se o pico pesa na {{empresa}}, me diga que eu mostro em 20 minutos.', true
     where not exists (
       select 1 from public.templates_mensagem x
        where x.tenant_id = t.id and x.nome = 'Prospecção 4 — o pico do mês (WhatsApp)');

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    select t.id, 'Prospecção 6 — quanto tempo para começar (WhatsApp)', 'whatsapp', 'utilidade', null,
      'Oi, {{primeiro_nome}}! {{vendedor}} aqui, da Softeum.' || chr(10) || chr(10) ||
      'Só para tirar a dúvida que costuma travar esse assunto: não vira projeto longo. A gente começa pelos pedidos que já chegam na caixa de vocês hoje, sem trocar o ERP da {{empresa}} e sem pedir nada ao seu cliente.' || chr(10) || chr(10) ||
      'Integrar direto pela API é o passo dois, não a condição para o passo um. Vinte minutos essa semana?', true
     where not exists (
       select 1 from public.templates_mensagem x
        where x.tenant_id = t.id and x.nome = 'Prospecção 6 — quanto tempo para começar (WhatsApp)');

    select id into v_wpico  from public.templates_mensagem where tenant_id = t.id and nome = 'Prospecção 4 — o pico do mês (WhatsApp)';
    select id into v_wtempo from public.templates_mensagem where tenant_id = t.id and nome = 'Prospecção 6 — quanto tempo para começar (WhatsApp)';

    continue when v_wpico is null or v_wtempo is null;

    -- ── OS PASSOS ─────────────────────────────────────────────────────────
    -- RENUMERAR sem apagar, pelo mesmo motivo das duas vezes anteriores:
    -- `mensagens.passo_id` aponta para estas linhas. O desvio de +100 evita
    -- colisão com a UNIQUE (cadencia_id, ordem) no meio do caminho.
    update public.cadencia_passos set ordem = ordem + 100 where cadencia_id = v_cad;

    update public.cadencia_passos set ordem =  1, atraso_horas =  0 where cadencia_id = v_cad and ordem = 101;
    update public.cadencia_passos set ordem =  2, atraso_horas = 24 where cadencia_id = v_cad and ordem = 102;
    update public.cadencia_passos set ordem =  3, atraso_horas = 48 where cadencia_id = v_cad and ordem = 103;
    update public.cadencia_passos set ordem =  4, atraso_horas = 48 where cadencia_id = v_cad and ordem = 104;
    update public.cadencia_passos set ordem =  5, atraso_horas = 48 where cadencia_id = v_cad and ordem = 105;
    update public.cadencia_passos set ordem =  6, atraso_horas = 48 where cadencia_id = v_cad and ordem = 106;
    update public.cadencia_passos set ordem =  7, atraso_horas = 72 where cadencia_id = v_cad and ordem = 107;
    -- 108 em diante andam uma casa: o WhatsApp do pico entra como 8.
    update public.cadencia_passos set ordem =  9, atraso_horas = 72 where cadencia_id = v_cad and ordem = 108;
    update public.cadencia_passos set ordem = 10, atraso_horas = 48 where cadencia_id = v_cad and ordem = 109;
    update public.cadencia_passos set ordem = 11, atraso_horas = 72 where cadencia_id = v_cad and ordem = 110;
    -- 111 e 112 andam mais uma: o WhatsApp do "quanto tempo" entra como 12.
    update public.cadencia_passos set ordem = 13, atraso_horas = 72 where cadencia_id = v_cad and ordem = 111;
    update public.cadencia_passos set ordem = 14, atraso_horas = 48 where cadencia_id = v_cad and ordem = 112;

    insert into public.cadencia_passos (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
    values (v_cad,  8, 'whatsapp', 48, v_wpico,  true),
           (v_cad, 12, 'whatsapp', 48, v_wtempo, true)
    on conflict (cadencia_id, ordem) do update
       set canal = excluded.canal,
           atraso_horas = excluded.atraso_horas,
           template_id = excluded.template_id;

    -- Quem está no meio do caminho segue de onde parou. Só os passos que
    -- MUDARAM de número precisam de conserto; 1 a 7 ficaram onde estavam.
    update public.cadencia_inscricoes
       set passo_atual = case passo_atual
                           when  8 then  9
                           when  9 then 10
                           when 10 then 11
                           when 11 then 13
                           when 12 then 14
                         end
     where cadencia_id = v_cad and status = 'ativa' and passo_atual between 8 and 12;

    update public.cadencias
       set nome = 'Primeiro contato — 14 toques (7 e-mails + 7 WhatsApp)'
     where id = v_cad;
  end loop;
end
$par$;
