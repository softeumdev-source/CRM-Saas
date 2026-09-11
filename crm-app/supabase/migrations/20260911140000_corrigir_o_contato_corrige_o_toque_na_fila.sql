-- ---------------------------------------------------------------------------
-- Arrumar o numero do contato passa a arrumar tambem o toque que ainda nao saiu.
--
-- Relatado: "vou em visao geral atualizar o numero do whatsapp, ai vou enviar o
-- whatsapp da cadencia, o numero nao atualiza na cadencia em tempo real".
--
-- REPRODUZIDO no banco, sem margem para duvida:
--
--   mensagem (tarefa pendente)  "+55 43 3536-8100 | +55 43 98802-0251"
--   contato, depois da correcao "43 98802-0251"
--   mensagem criada em          10/09 20:47
--   contato corrigido em        11/09 12:31
--
-- A CAUSA. `processar_cadencias` grava `destino` DENTRO da mensagem no momento
-- em que a escreve -- uma fotografia. Corrigir o contato depois nao alcanca a
-- fotografia, e a tarefa continua apontando para o numero velho. O link do
-- WhatsApp sai daquele campo, entao o clique abre a conversa errada (ou nenhuma:
-- com dois numeros grudados por " | " o `wa.me` nem monta).
--
-- E NAO E SO O WHATSAPP. O mesmo campo alimenta o despachante de e-mail. Um
-- endereco com erro de digitacao, corrigido depois de a cadencia ja ter escrito
-- o toque, continuaria mandando para o endereco errado. Sao 46 e-mails
-- 'aprovada' na fila neste momento -- essa e a parte silenciosa do defeito, e a
-- de consequencia maior.
--
-- ---------------------------------------------------------------------------
-- A CORRECAO, E POR QUE E NO BANCO E NAO NA TELA
--
-- Daria para a tela ler o contato em vez de `destino`. Resolveria o link, e
-- deixaria o despachante de e-mail com o defeito intacto -- porque ele le a
-- COLUNA. Consertar no banco conserta os dois leitores de uma vez, e qualquer
-- leitor futuro junto.
--
-- De quebra, resolve o "em tempo real" sem nova assinatura: `MensagensTab`
-- escuta `mensagens` (nao escuta `contatos`), entao um UPDATE em `mensagens`
-- vindo deste gatilho ja chega na tela sozinho. Era por isso que a aba nao se
-- mexia: nada em `mensagens` mudava.
--
-- ---------------------------------------------------------------------------
-- O QUE O GATILHO NAO TOCA, E POR QUE
--
--   status 'enviada' / 'cancelada' / 'falhou'  -- e historico. `destino` ali e
--     o registro de PARA ONDE FOI de verdade; reescrever apagaria a prova.
--   status 'enviando'  -- em voo. A chamada externa ja partiu com o valor
--     antigo; mudar a linha agora so criaria divergencia com o que saiu.
--   direcao 'entrada'  -- mensagem recebida. `destino` ali somos nos.
--
-- E SO SINCRONIZA PARA VALOR NAO VAZIO. Se alguem apagar o telefone do
-- contato, a mensagem na fila mantem o destino que tinha, em vez de ficar sem
-- destinatario -- porque o despachante trata destino vazio como FALHA e
-- queimaria o toque. Apagar campo por engano nao pode custar um toque de
-- cadencia. Quem quer mesmo cancelar o toque tem o botao de cancelar.
-- ---------------------------------------------------------------------------

create or replace function public.contato_sincroniza_destino_pendente()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_email    text := nullif(btrim(coalesce(new.email, '')), '');
  v_whatsapp text := coalesce(
                      nullif(btrim(coalesce(new.whatsapp, '')), ''),
                      nullif(btrim(coalesce(new.telefone, '')), '')
                    );
begin
  if new.email    is not distinct from old.email
     and new.whatsapp is not distinct from old.whatsapp
     and new.telefone is not distinct from old.telefone then
    return null;
  end if;

  update public.mensagens m
     set destino = case when m.canal = 'whatsapp' then v_whatsapp else v_email end
   where m.contato_id = new.id
     and m.direcao = 'saida'
     and m.status in ('aguardando_aprovacao', 'aprovada')
     and case when m.canal = 'whatsapp' then v_whatsapp else v_email end is not null
     and m.destino is distinct from
         (case when m.canal = 'whatsapp' then v_whatsapp else v_email end);

  return null;
end;
$function$;

comment on function public.contato_sincroniza_destino_pendente() is
  'Corrigir e-mail/telefone do contato corrige o `destino` dos toques que ainda '
  'nao sairam. Nao toca em historico, em mensagem em voo, nem sincroniza para '
  'valor vazio.';

revoke execute on function public.contato_sincroniza_destino_pendente() from public, anon, authenticated;

drop trigger if exists trg_contato_sincroniza_destino on public.contatos;
create trigger trg_contato_sincroniza_destino
  after update of email, whatsapp, telefone on public.contatos
  for each row execute function public.contato_sincroniza_destino_pendente();

-- ---------------------------------------------------------------------------
-- A fila de hoje ja nasceu torta: o gatilho so pega da proxima edicao em diante.
-- Este update alcanca o que ja esta parado, com exatamente o mesmo criterio.
-- ---------------------------------------------------------------------------

update public.mensagens m
   set destino = case when m.canal = 'whatsapp'
                      then coalesce(nullif(btrim(coalesce(ct.whatsapp,'')),''),
                                    nullif(btrim(coalesce(ct.telefone,'')),''))
                      else nullif(btrim(coalesce(ct.email,'')),'') end
  from public.contatos ct
 where ct.id = m.contato_id
   and m.direcao = 'saida'
   and m.status in ('aguardando_aprovacao', 'aprovada')
   and case when m.canal = 'whatsapp'
            then coalesce(nullif(btrim(coalesce(ct.whatsapp,'')),''),
                          nullif(btrim(coalesce(ct.telefone,'')),''))
            else nullif(btrim(coalesce(ct.email,'')),'') end is not null
   and m.destino is distinct from
       (case when m.canal = 'whatsapp'
             then coalesce(nullif(btrim(coalesce(ct.whatsapp,'')),''),
                           nullif(btrim(coalesce(ct.telefone,'')),''))
             else nullif(btrim(coalesce(ct.email,'')),'') end);
