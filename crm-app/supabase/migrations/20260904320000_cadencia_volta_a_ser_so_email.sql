-- A cadência de prospecção volta a ser só e-mail. O WhatsApp sai da automação.
--
-- POR QUE, E A CONTA QUE DECIDIU
--
-- Mensagem de WhatsApp iniciada pela empresa exige template aprovado na Meta, e
-- a Meta classifica abordagem fria como MARKETING -- US$ 0,0625, ~R$ 0,32 por
-- mensagem no cambio de hoje. Sete toques por lead dao ~R$ 2,23; a 500 leads
-- por mes, ~R$ 1.100. Os sete e-mails fazem o mesmo trabalho por R$ 0,00.
--
-- A decisao foi de nao pagar a Meta para falar com quem, quando quer falar,
-- pede para ser chamado no WhatsApp. Nesse caso o canal certo e o WhatsApp Web,
-- em um clique a partir do card -- gratuito, e agora com registro no CRM.
--
-- OS TEXTOS FICAM. Os sete modelos de WhatsApp continuam na biblioteca, com o
-- texto pronto: eles servem para o envio manual (o compositor os oferece) e
-- para o dia em que a conta fizer sentido. O que sai sao os PASSOS da cadencia,
-- que e o que fazia a mensagem sair sozinha.
--
-- APAGAR O PASSO NAO APAGA MENSAGEM: `mensagens.passo_id` e
-- `ON DELETE SET NULL`, entao o historico de quem recebeu o que continua
-- inteiro -- perde-se so o vinculo com o passo que o gerou. Hoje sao 0
-- mensagens, mas a garantia vale para qualquer ambiente.
--
-- O CALENDARIO DOS E-MAILS NAO MUDA. Sao exatamente os mesmos dias de antes:
--
--   dia  0  1 — apresentação
--   dia  3  2 — o formato não importa
--   dia  7  3 — importação ou integração
--   dia 12  4 — o pico do mês
--   dia 17  5 — o custo do manual
--   dia 22  6 — quanto tempo para começar
--   dia 27  7 — fecho o assunto?

do $so_email$
declare
  t record;
  v_cad uuid;
  v_removidos int;
begin
  for t in select id from public.tenants loop

    select c.id into v_cad
      from public.cadencias c
      join public.pipelines p on p.id = c.pipeline_id
     where c.tenant_id = t.id and c.proposito = 'primeiro_contato' and p.chave = 'sdr'
     order by c.criado_em limit 1;

    continue when v_cad is null;

    -- Já convertida? (não sobrou passo de WhatsApp) Nada a fazer.
    continue when not exists (
      select 1 from public.cadencia_passos p
       where p.cadencia_id = v_cad and p.canal = 'whatsapp');

    -- Quem está no meio do caminho segue de onde parou. O e-mail N era o passo
    -- 2N-1; a volta e a inversa. Sem isto, um lead que ja recebeu o e-mail 4
    -- (passo 7) receberia o e-mail 4 de novo.
    --
    -- Vem ANTES do delete de proposito: depois, `ordem` ja teria mudado.
    update public.cadencia_inscricoes
       set passo_atual = (passo_atual + 1) / 2
     where cadencia_id = v_cad and status = 'ativa' and passo_atual between 1 and 14;

    delete from public.cadencia_passos
     where cadencia_id = v_cad and canal = 'whatsapp';
    get diagnostics v_removidos = row_count;

    -- RENUMERAR com o desvio de +100, como das outras vezes: a UNIQUE
    -- (cadencia_id, ordem) nao e adiavel, e reatribuir em ordem colidiria.
    update public.cadencia_passos set ordem = ordem + 100 where cadencia_id = v_cad;

    update public.cadencia_passos set ordem = 1, atraso_horas =   0 where cadencia_id = v_cad and ordem = 101;
    update public.cadencia_passos set ordem = 2, atraso_horas =  72 where cadencia_id = v_cad and ordem = 103;
    update public.cadencia_passos set ordem = 3, atraso_horas =  96 where cadencia_id = v_cad and ordem = 105;
    update public.cadencia_passos set ordem = 4, atraso_horas = 120 where cadencia_id = v_cad and ordem = 107;
    update public.cadencia_passos set ordem = 5, atraso_horas = 120 where cadencia_id = v_cad and ordem = 109;
    update public.cadencia_passos set ordem = 6, atraso_horas = 120 where cadencia_id = v_cad and ordem = 111;
    update public.cadencia_passos set ordem = 7, atraso_horas = 120 where cadencia_id = v_cad and ordem = 113;

    update public.cadencias
       set nome = 'Primeiro contato — 7 e-mails'
     where id = v_cad;

    raise notice 'tenant %: % passos de WhatsApp removidos da cadencia', t.id, v_removidos;
  end loop;
end
$so_email$;
