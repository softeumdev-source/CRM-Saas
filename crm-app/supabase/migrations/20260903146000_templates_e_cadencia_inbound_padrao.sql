-- ---------------------------------------------------------------------------
-- Os textos de venda saem do componente e viram dados.
--
-- `CopilotoTab` carregava seis modelos de mensagem cravados no JSX — conteudo
-- comercial de verdade, escrito para a Softeum, num arquivo de interface. Como
-- dado, eles passam a ser editaveis pelo admin, reutilizaveis pela cadencia e
-- versionaveis sem deploy.
--
-- Os marcadores foram convertidos de {cliente}/{empresa}/{vendedor} para o
-- formato que `processar_cadencias()` entende, e os corpos de e-mail viraram
-- HTML (o `emailBase()` do Resend envolve HTML, nao texto puro).
--
-- Junto vai uma cadencia inbound de tres toques usando os tres e-mails, ligada
-- ao funil do SDR e NAO autonoma: cada mensagem vai nascer esperando aprovacao
-- ate alguem decidir o contrario.
-- ---------------------------------------------------------------------------

insert into public.templates_mensagem (tenant_id, canal, nome, assunto, corpo)
select t.id, v.canal, v.nome, v.assunto, v.corpo
from public.tenants t
cross join (values
  ('email', 'Primeiro contato', 'Automatize o recebimento de pedidos na {{empresa}}', '<p>Olá, {{primeiro_nome}}! Tudo bem?<br />Meu nome é {{vendedor}} e faço parte da equipe da Softeum.</p>
<p>Sabemos que empresas como a {{empresa}} precisam de processos comerciais eficientes para garantir agilidade no recebimento e processamento dos pedidos, mantendo o controle das informações e proporcionando um atendimento cada vez melhor aos clientes.</p>
<p>Pensando nisso, gostaria de apresentar uma solução da Softeum que ajuda empresas a automatizar o recebimento e processamento de pedidos, reduzindo atividades manuais e aumentando a eficiência operacional.</p>
<p>Nossa plataforma centraliza pedidos recebidos por diferentes canais em um único ambiente e utiliza inteligência artificial para interpretar solicitações enviadas por e-mail, PDF, Excel, TXT e outros formatos.</p>
<p>Além disso, a solução permite que seus clientes realizem pedidos diretamente pelo WhatsApp. A IA conduz o atendimento, interpreta as informações do pedido, estrutura os dados e realiza o envio automático para o ERP da empresa.</p>
<p>Com essa automação, a {{empresa}} pode reduzir retrabalhos, minimizar erros de digitação, agilizar o processamento dos pedidos e aumentar a produtividade da equipe comercial.</p>
<p>Gostaria de agendar uma breve apresentação de 20 minutos para mostrar como a plataforma funciona e avaliar se essa solução pode contribuir com a operação de vocês?</p>
<p>Fico à disposição para combinarmos o melhor horário.</p>
<p>Atenciosamente,<br />{{vendedor}}<br />Softeum</p>'),
  ('email', 'Follow-up / aquecer lead', 'Podemos conversar sobre a automação de pedidos, {{primeiro_nome}}?', '<p>Olá, {{primeiro_nome}}, tudo bem?</p>
<p>Passando para retomar nosso contato sobre a solução da Softeum de automação de recebimento e processamento de pedidos.</p>
<p>Muitas empresas do porte da {{empresa}} têm conseguido reduzir o trabalho manual e os erros de digitação ao centralizar os pedidos que chegam por e-mail e WhatsApp em um só lugar, com envio automático para o ERP.</p>
<p>Consigo te mostrar em 20 minutos como isso funciona na prática. Qual seria o melhor dia e horário para você esta semana?</p>
<p>Fico no aguardo!</p>
<p>Abraço,<br />{{vendedor}}<br />Softeum</p>'),
  ('email', 'Pós-demonstração', 'Próximos passos após nossa conversa', '<p>Olá, {{primeiro_nome}}!</p>
<p>Foi um prazer apresentar a plataforma da Softeum para a {{empresa}}. Como combinamos, estou te enviando os próximos passos para avançarmos.</p>
<p>Ficou alguma dúvida sobre a automação dos pedidos ou sobre a integração com o ERP de vocês? Posso preparar uma proposta comercial personalizada para o volume de pedidos da {{empresa}}.</p>
<p>Me avisa como prefere seguir que eu já encaminho tudo.</p>
<p>Abraço,<br />{{vendedor}}<br />Softeum</p>'),
  ('whatsapp', 'Primeiro contato', null, 'Olá, {{primeiro_nome}}! Tudo bem? Aqui é o {{vendedor}}, da Softeum. 😊

Ajudamos empresas como a {{empresa}} a automatizar o recebimento e o processamento de pedidos que chegam por e-mail e WhatsApp, com envio automático para o ERP.

Posso te mostrar em 20 minutinhos como funciona? Qual o melhor horário pra você?'),
  ('whatsapp', 'Follow-up / aquecer lead', null, 'Oi, {{primeiro_nome}}! Tudo certo? Aqui é o {{vendedor}}, da Softeum.

Passando pra retomar nosso contato sobre a automação de pedidos. Consigo te mostrar rapidinho como a {{empresa}} pode reduzir o trabalho manual e os erros de digitação. Qual dia fica melhor pra gente conversar?'),
  ('whatsapp', 'Lembrete de reunião', null, 'Olá, {{primeiro_nome}}! Passando só pra confirmar nossa conversa sobre a plataforma da Softeum. Continua de pé no horário combinado? Qualquer coisa, estou à disposição. Abraço, {{vendedor}}.')
) as v(canal, nome, assunto, corpo)
where not exists (
  select 1 from public.templates_mensagem x
   where x.tenant_id = t.id and x.nome = v.nome and x.canal = v.canal
);

-- Cadencia inbound de 3 toques: dia 0, +2 dias, +5 dias.
insert into public.cadencias (tenant_id, nome, tipo, pipeline_id, autonoma, ativa)
select p.tenant_id, 'Inbound — 3 toques', 'inbound', p.id, false, true
from public.pipelines p
where p.chave = 'sdr'
  and not exists (
    select 1 from public.cadencias c where c.tenant_id = p.tenant_id and c.nome = 'Inbound — 3 toques'
  );

insert into public.cadencia_passos (cadencia_id, ordem, canal, atraso_horas, template_id, parar_se_respondeu)
select c.id, v.ordem, 'email', v.horas, t.id, true
from public.cadencias c
join public.templates_mensagem t on t.tenant_id = c.tenant_id and t.canal = 'email'
join (values
  (1, 0,   'Primeiro contato'),
  (2, 48,  'Follow-up / aquecer lead'),
  (3, 120, 'Pós-demonstração')
) as v(ordem, horas, nome_template) on v.nome_template = t.nome
where c.nome = 'Inbound — 3 toques'
  and not exists (
    select 1 from public.cadencia_passos p where p.cadencia_id = c.id and p.ordem = v.ordem
  );
