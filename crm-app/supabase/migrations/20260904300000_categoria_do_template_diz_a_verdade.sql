-- A categoria do modelo passa a dizer a verdade sobre o que a Meta vai cobrar.
--
-- O DEFEITO, E ELE E MEU
--
-- As migracoes da biblioteca (`20260904180000` em diante) gravaram
-- `categoria = 'utilidade'` em TODOS os modelos, inclusive nos sete de
-- prospeccao fria. O campo e interno -- nao vai para a Meta, so aparece na aba
-- de Cadencias do admin -- e por isso passou despercebido.
--
-- Mas ele e lido por gente. Quem for submeter os templates para aprovacao le
-- "utilidade" na tela e submete nessa categoria. Os dois desfechos sao ruins:
-- recusa na revisao, ou aprovacao seguida de cobranca de Marketing na fatura,
-- com a pessoa achando que contratou 8x menos.
--
-- A REGRA DA META, QUE E DE CONTEUDO E NAO DE ESCOLHA
--
--   Utility  -- mensagem sobre algo que a pessoa JA fez ou combinou:
--               confirmacao, aviso de entrega, lembrete de reuniao aceita.
--   Marketing -- qualquer coisa que ABRE ou reativa relacao: oferta,
--               apresentacao, "podemos conversar?".
--
-- Os sete toques de prospeccao dizem "recebi seu contato... podemos conversar
-- 20 minutos?" para quem nunca escreveu. Isso e Marketing, sem zona cinzenta.
-- Declarar 'utilidade' nao muda a classificacao: muda so o que a NOSSA tela
-- promete.
--
-- O CANAL IMPORTA
--
-- So o WhatsApp tem categoria de verdade -- e a Meta que classifica, e e ela
-- que cobra. Em e-mail o campo e decorativo, e por isso os modelos de e-mail
-- ficam como estao: mexer neles seria dar a impressao de que existe uma
-- cobranca por categoria que nao existe no Gmail.
--
-- O "Lembrete de reuniao" fica em 'utilidade' porque ELE e utility de verdade:
-- avisa sobre um compromisso que a pessoa aceitou. E o unico da biblioteca que
-- sai por R$ 0,04 em vez de R$ 0,32.

update public.templates_mensagem
   set categoria = 'marketing'
 where canal = 'whatsapp'
   and nome like 'Prospecção %';

comment on column public.templates_mensagem.categoria is
  'Categoria que a Meta vai aplicar ao template de WhatsApp: utilidade (mensagem '
  'sobre algo ja combinado) ou marketing (abre ou reativa relacao). Quem decide e '
  'a Meta, pelo conteudo, na aprovacao -- isto aqui e o que a nossa tela mostra, e '
  'precisa bater com o que sera submetido. Em e-mail o campo e decorativo.';
