-- ---------------------------------------------------------------------------
-- Aprovar passa a DESPACHAR NA HORA, em vez de esperar o proximo cron.
--
-- O mecanismo de registrar atividade e descer o card ja funciona — provado em
-- producao: mensagem aprovada as 12:33:15, despachada as 12:37:01, atividade
-- "Cadência: ..." criada no mesmo instante e o card indo para a posicao 216 de
-- 216. O problema e que entre o clique e o envio se passaram 3m46s.
--
-- O cron `disparar-despacho` bate em `2-59/5` — minutos 2, 7, 12, 17... Quem
-- aprova logo depois de uma janela espera ate 5 minutos vendo uma tela onde
-- nada acontece, e conclui, com razao, que o sistema nao fez nada.
--
-- Este gatilho fecha essa espera. Nao e um caminho novo de envio: e a MESMA
-- `disparar_despacho()` que o cron chama, so que acionada tambem pelo clique. O
-- cron continua existindo como rede — se o disparo imediato falhar, a proxima
-- janela pega a mensagem do mesmo jeito.
--
-- E DE NIVEL DE INSTRUCAO (`for each statement`), nao de linha. Se algum dia
-- aparecer um "aprovar em lote", 200 linhas aprovadas geram UMA chamada, e nao
-- 200. `disparar_despacho()` ja processa a fila inteira em lotes de 20.
-- ---------------------------------------------------------------------------

create or replace function public.mensagens_despachar_ao_aprovar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Duas condicoes, e as duas importam.
  --
  -- `a.status is distinct from 'aprovada'`: so quando a mensagem ACABA de ser
  -- aprovada. Sem isso, qualquer update numa linha ja aprovada re-disparava.
  --
  -- `agendada_para <= now()`: e o que impede o LOOP. O ramo de reagendamento de
  -- `concluir_envio` devolve a mensagem para 'aprovada' com
  -- `agendada_para = now() + backoff` — sem esta guarda, uma falha de envio
  -- chamaria a rota de novo na hora, que falharia de novo, em circulo. Com ela,
  -- a tentativa seguinte fica por conta do cron, que e onde ela deve ficar.
  if exists (
    select 1
      from novas n
      join antigas a on a.id = n.id
     where n.status = 'aprovada'
       and a.status is distinct from 'aprovada'
       and coalesce(n.agendada_para, now()) <= now()
  ) then
    perform public.disparar_despacho();
  end if;
  return null;
end;
$function$;

comment on function public.mensagens_despachar_ao_aprovar() is
  'Chama disparar_despacho() quando uma mensagem acaba de ser aprovada e ja '
  'venceu. E a mesma funcao do cron — o clique so deixa de esperar a proxima '
  'janela de 5 minutos. Nivel de instrucao: um lote de aprovacoes gera uma '
  'chamada so.';

drop trigger if exists trg_mensagens_aprovada_despacha on public.mensagens;
create trigger trg_mensagens_aprovada_despacha
  after update on public.mensagens
  referencing new table as novas old table as antigas
  for each statement
  execute function public.mensagens_despachar_ao_aprovar();
