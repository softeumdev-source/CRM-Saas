-- A cadência de prospecção passa a 10 toques: 5 e-mails e 5 WhatsApp,
-- alternados, um por dia diferente.
--
-- O PROBLEMA QUE ISTO PRECISA RESOLVER ANTES DE AUMENTAR NADA
--
-- Hoje a cadência é só e-mail, e isso não é acaso: `processar_cadencias`
-- PAUSA A INSCRIÇÃO INTEIRA em três situações, e as três ficam prováveis no
-- instante em que um passo de WhatsApp entra no meio dos e-mails:
--
--   1. o modelo de WhatsApp não tem `template_externo_id` (a conta da Meta
--      ainda não existe) → hoje é sempre verdade;
--   2. o contato não tem telefone → lead que veio da planilha só com e-mail;
--   3. (fica como está) o consentimento daquele canal foi revogado.
--
-- Com a cadência misturada, qualquer uma dessas mataria TAMBÉM os e-mails: o
-- lead receberia o e-mail 1 no dia 0, bateria no passo de WhatsApp do dia 1, e
-- a inscrição pararia com `proximo_envio_em = null` — que nunca mais volta
-- sozinha. Os outros quatro e-mails simplesmente não sairiam, e o painel não
-- mostraria erro nenhum no funil.
--
-- Então a mudança do motor vem PRIMEIRO, e é ela que torna o aumento seguro:
--
--   • falta o id da Meta            → PULA o toque, segue a sequência
--   • falta o destino DAQUELE canal → PULA o toque, segue a sequência
--   • falta destino em canal NENHUM → pausa e registra a falha (como hoje)
--   • falta o modelo do passo       → pausa e registra a falha (novo)
--
-- Pular preserva o espaçamento: o próximo envio é agendado a partir de AGORA
-- com o atraso do passo seguinte, que é exatamente o que o envio normal faz.
-- Na prática, hoje a cadência de 10 toques se comporta como a de 5 e-mails de
-- antes; no dia em que os templates forem aprovados na Meta e o
-- `template_externo_id` for preenchido no admin, os 5 toques de WhatsApp
-- passam a sair sozinhos, sem tocar em uma linha de configuração.
--
-- O consentimento revogado continua CANCELANDO a inscrição inteira, e não
-- pulando: quem pede para não receber mais no WhatsApp está pedindo para
-- parar, não para trocar de canal. Errar para o lado de mandar menos.
--
-- O CALENDÁRIO (dia contado da inscrição; `atraso_horas` é o intervalo desde o
-- toque anterior, que é como o motor lê)
--
--   dia  0  e-mail    1 — apresentação
--   dia  1  whatsapp  1 — apresentação
--   dia  3  e-mail    2 — o formato não importa
--   dia  5  whatsapp  2 — o formato não importa
--   dia  7  e-mail    3 — importação ou integração
--   dia  9  whatsapp  3 — importação ou integração        (novo)
--   dia 12  e-mail    4 — o custo do manual
--   dia 14  whatsapp  4 — o custo do manual               (novo)
--   dia 17  e-mail    5 — fecho o assunto?
--   dia 19  whatsapp  5 — fecho o assunto?
--
-- Nenhum dia recebe dois toques, e a janela total continua a mesma de antes
-- (19 dias): dobra a quantidade de contatos, não o tempo de perseguição.
--
-- O DEFEITO QUE APARECEU AO CONFERIR OS TEXTOS
--
-- O motor manda SEMPRE três variáveis para a Meta, nesta ordem:
-- `[primeiro_nome, empresa, vendedor]`. A Meta recusa o envio quando a
-- quantidade de parâmetros não bate com a que o template declara. O texto
-- "Prospecção 2 (WhatsApp)" não citava `{{empresa}}` — ou seja, seria
-- submetido à aprovação com duas variáveis e falharia em todo envio, meses
-- depois, sem ninguém ligar uma coisa à outra. Corrigido aqui.


-- ── 1. O MOTOR ────────────────────────────────────────────────────────────
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
      continue;
    end if;

    select c.* into v_contato from public.contatos c where c.id = r.contato_id;

    -- Consentimento revogado CANCELA, e não pula: ver o cabeçalho.
    if exists (
      select 1 from public.consentimentos k
       where k.contato_id = r.contato_id and k.canal = v_passo.canal and k.revogado_em is not null
    ) then
      update public.cadencia_inscricoes set status='cancelada', proximo_envio_em=null where id=r.id;
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
        -- Falta só ESTE canal. Pula o toque; os do outro canal continuam.
        v_pular := true;
      else
        -- Não há como falar com esta pessoa por meio nenhum: isso tem que doer.
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
        -- Passo sem modelo mandaria um corpo vazio para o cliente. Isso não se
        -- pula em silêncio: é erro de configuração, atinge todo mundo igual, e
        -- precisa aparecer na primeira vez.
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

      -- WhatsApp sem template aprovado na Meta não tem como sair — mas isso é
      -- estado do CANAL, não deste lead. Pula o toque e segue com os e-mails.
      if v_passo.canal = 'whatsapp' and coalesce(v_tpl.template_externo_id, '') = '' then
        v_pular := true;
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
        template_externo, variaveis, idempotency_key, agendada_para
      ) values (
        r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
        v_passo.canal,
        case when r.autonoma then 'aprovada' else 'aguardando_aprovacao' end,
        v_destino,
        case when v_passo.canal = 'email' then v_assunto else null end,
        v_corpo, 'template',
        case when v_passo.canal = 'whatsapp' then v_tpl.template_externo_id else null end,
        -- A ORDEM é contrato com o template aprovado na Meta: {{1}} primeiro
        -- nome, {{2}} empresa, {{3}} vendedor. Mexer aqui troca as palavras
        -- dentro da mensagem do cliente, sem erro nenhum aparecer.
        case when v_passo.canal = 'whatsapp'
             then array[v_primeiro_nome, coalesce(v_contato.empresa, ''), v_vendedor]
             else null end,
        r.id::text || ':' || v_passo.id::text,
        now()
      ) on conflict (idempotency_key) do nothing;
    end if;

    -- Andar a sequência é comum aos dois caminhos: o toque pulado gasta a vez
    -- e o seguinte é agendado a partir de agora, com o atraso dele — que é o
    -- mesmo cálculo do envio normal, e é o que mantém o espaçamento de dias.
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

    -- Só conta o que virou mensagem. Toque pulado não é toque dado.
    if not v_pular then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;


-- ── 2. OS TEXTOS E OS PASSOS ──────────────────────────────────────────────
do $dez$
declare
  t record;
  v_cad uuid;
  v_w1 uuid; v_w2 uuid; v_w3 uuid; v_w4 uuid; v_w5 uuid;
begin
  for t in select id from public.tenants loop

    -- O "3 — fecho o assunto?" é a mensagem de ENCERRAMENTO: com cinco toques
    -- ela é a quinta, não a terceira. Renomear (e não criar outra) evita duas
    -- despedidas na biblioteca. Seguro: nenhum passo aponta para ela ainda.
    update public.templates_mensagem
       set nome = 'Prospecção 5 — fecho o assunto? (WhatsApp)'
     where tenant_id = t.id and canal = 'whatsapp'
       and nome = 'Prospecção 3 — fecho o assunto? (WhatsApp)';

    -- O texto 2 não citava {{empresa}}, e o motor manda três variáveis SEMPRE.
    -- Ver o cabeçalho: sem isto, todo envio deste passo seria recusado pela
    -- Meta por contagem de parâmetros.
    update public.templates_mensagem
       set corpo =
         'Oi, {{primeiro_nome}}! Aqui é {{vendedor}}, da Softeum.' || chr(10) || chr(10) ||
         'Só um ponto que costuma travar esse assunto: a maioria das soluções pede para o SEU cliente mudar o jeito de mandar o pedido. Na prática ele não muda.' || chr(10) || chr(10) ||
         'A nossa lê do jeito que chega. Consigo mostrar em 20 minutos, com um pedido de verdade da {{empresa}}. Qual dia fica melhor?'
     where tenant_id = t.id and canal = 'whatsapp'
       and nome = 'Prospecção 2 — o formato não importa (WhatsApp)';

    -- Os dois que faltavam para fechar cinco. Cada um ataca a MESMA objeção do
    -- e-mail do par, encurtado para WhatsApp, e cita as três variáveis.
    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    select t.id, 'Prospecção 3 — importação ou integração (WhatsApp)', 'whatsapp', 'utilidade', null,
      'Oi, {{primeiro_nome}}! Aqui é {{vendedor}}, da Softeum.' || chr(10) || chr(10) ||
      'A dúvida que sempre aparece é como o pedido entra no seu sistema. São dois caminhos, e os dois funcionam: importação, no layout que o ERP da {{empresa}} já aceita hoje, ou integração direta pela API.' || chr(10) || chr(10) ||
      'Não precisa trocar de sistema para começar. Qual dos dois faz mais sentido para vocês?', true
     where not exists (
       select 1 from public.templates_mensagem x
        where x.tenant_id = t.id and x.nome = 'Prospecção 3 — importação ou integração (WhatsApp)');

    insert into public.templates_mensagem (tenant_id, nome, canal, categoria, assunto, corpo, ativo)
    select t.id, 'Prospecção 4 — o custo do manual (WhatsApp)', 'whatsapp', 'utilidade', null,
      'Oi, {{primeiro_nome}}! {{vendedor}} aqui, da Softeum.' || chr(10) || chr(10) ||
      'Pedido digitado à mão custa duas coisas: o tempo de quem digita e o erro que aparece depois — quantidade trocada, código errado, pedido que volta e atrasa a entrega.' || chr(10) || chr(10) ||
      'Se isso acontece na {{empresa}}, dá para resolver sem mudar nada do que vocês já usam. E se não for o seu caso, me diga que eu paro por aqui.', true
     where not exists (
       select 1 from public.templates_mensagem x
        where x.tenant_id = t.id and x.nome = 'Prospecção 4 — o custo do manual (WhatsApp)');

    select id into v_w1 from public.templates_mensagem where tenant_id = t.id and nome = 'Prospecção 1 — apresentação (WhatsApp)';
    select id into v_w2 from public.templates_mensagem where tenant_id = t.id and nome = 'Prospecção 2 — o formato não importa (WhatsApp)';
    select id into v_w3 from public.templates_mensagem where tenant_id = t.id and nome = 'Prospecção 3 — importação ou integração (WhatsApp)';
    select id into v_w4 from public.templates_mensagem where tenant_id = t.id and nome = 'Prospecção 4 — o custo do manual (WhatsApp)';
    select id into v_w5 from public.templates_mensagem where tenant_id = t.id and nome = 'Prospecção 5 — fecho o assunto? (WhatsApp)';

    select c.id into v_cad
      from public.cadencias c
      join public.pipelines p on p.id = c.pipeline_id
     where c.tenant_id = t.id and c.proposito = 'primeiro_contato' and p.chave = 'sdr'
     order by c.criado_em limit 1;

    continue when v_cad is null
              or v_w1 is null or v_w2 is null or v_w3 is null or v_w4 is null or v_w5 is null;

    -- Já convertida? (o passo 2 já é de WhatsApp) Nada a fazer.
    continue when exists (
      select 1 from public.cadencia_passos p
       where p.cadencia_id = v_cad and p.ordem = 2 and p.canal = 'whatsapp');

    -- RENUMERAR sem apagar: `mensagens.passo_id` aponta para estas linhas, e
    -- recriar os passos jogaria fora a rastreabilidade de quem recebeu o quê.
    -- O desvio de +100 evita colisão com a UNIQUE (cadencia_id, ordem) no meio
    -- do caminho — a restrição não é adiável.
    update public.cadencia_passos set ordem = ordem + 100 where cadencia_id = v_cad;

    update public.cadencia_passos set ordem = 1, atraso_horas = 0  where cadencia_id = v_cad and ordem = 101;
    update public.cadencia_passos set ordem = 3, atraso_horas = 48 where cadencia_id = v_cad and ordem = 102;
    update public.cadencia_passos set ordem = 5, atraso_horas = 48 where cadencia_id = v_cad and ordem = 103;
    update public.cadencia_passos set ordem = 7, atraso_horas = 72 where cadencia_id = v_cad and ordem = 104;
    update public.cadencia_passos set ordem = 9, atraso_horas = 72 where cadencia_id = v_cad and ordem = 105;

    insert into public.cadencia_passos (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
    values (v_cad,  2, 'whatsapp', 24, v_w1, true),
           (v_cad,  4, 'whatsapp', 48, v_w2, true),
           (v_cad,  6, 'whatsapp', 48, v_w3, true),
           (v_cad,  8, 'whatsapp', 48, v_w4, true),
           (v_cad, 10, 'whatsapp', 48, v_w5, true)
    on conflict (cadencia_id, ordem) do update
       set canal = excluded.canal,
           atraso_horas = excluded.atraso_horas,
           template_id = excluded.template_id;

    -- Quem está no meio do caminho segue de onde parou: o e-mail N virou o
    -- passo 2N-1. Sem este remapeamento, um lead no passo 2 receberia o
    -- e-mail 2 outra vez.
    update public.cadencia_inscricoes
       set passo_atual = passo_atual * 2 - 1
     where cadencia_id = v_cad and status = 'ativa' and passo_atual between 1 and 5;

    update public.cadencias
       set nome = 'Primeiro contato — 10 toques (5 e-mails + 5 WhatsApp)'
     where id = v_cad;
  end loop;
end
$dez$;
