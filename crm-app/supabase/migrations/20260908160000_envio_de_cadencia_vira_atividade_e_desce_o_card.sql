-- ---------------------------------------------------------------------------
-- Enviar um e-mail da cadencia passa a REGISTRAR ATIVIDADE e a DESCER o card.
--
-- Eram dois defeitos, e consertar so um nao resolveria nada.
--
-- DEFEITO 1: `concluir_envio` marcava a mensagem como enviada e ia embora. Nao
-- criava atividade nenhuma. Como quem toca `negocios.ultima_atividade_em` e o
-- gatilho `trg_atividades_tocar_negocio` (no INSERT de `atividades`), um envio
-- de cadencia nao deixava rastro NEM na lista de atividades do card NEM na data
-- do ultimo toque. O SDR mandava o e-mail e o card continuava dizendo "18 dias
-- sem contato".
--
-- DEFEITO 2: a ordem dos cards do board era INDEFINIDA. `negocios_do_board` tem
-- um `order by` dentro do `row_number()`, mas ele so decide QUAIS N cards de
-- cada etapa voltam — o `select` externo (`where b.id in (...)`) nao tinha
-- `order by` nenhum, e nem `board.ts` nem o Kanban reordenam no cliente. Medido
-- antes desta migracao, na etapa "Novo Lead": 49 dos 50 cards voltavam fora da
-- ordem pretendida. Ou seja, mesmo tocando `ultima_atividade_em` o card nao
-- desceria de forma confiavel — desceria as vezes, por acaso do plano.
-- ---------------------------------------------------------------------------

-- 1) A ORDEM DO BOARD PASSA A SER DE VERDADE.
--
-- A regra ja era a certa e agora vale para as linhas devolvidas, nao so para o
-- recorte: quem nunca foi tocado vem primeiro (e trabalho a fazer), depois os
-- de contato mais ANTIGO, e por ultimo os recem-tocados. E exatamente "quem
-- acabou de receber e-mail desce para o fim da lista".
--
-- `criado_em desc` continua como desempate para os nunca tocados: entre dois
-- leads sem contato nenhum, o mais novo aparece antes.
--
-- E o `id` no fim NAO e enfeite. Depois da importacao, 203 cards de "Novo Lead"
-- ficaram com o MESMO par (ultima_atividade_em, criado_em) — foram criados
-- todos no mesmo instante, por uma instrucao so. Com empate total o Postgres
-- pode devolve-los em qualquer ordem, e a ordem pode MUDAR entre um
-- carregamento e outro: os cards trocam de lugar sozinhos e o SDR perde o fio
-- de onde parou. Medido depois: duas chamadas seguidas devolvem 0 divergencia.
create or replace function public.negocios_do_board(p_pipeline_id uuid, p_por_etapa integer default 50)
returns setof negocios
language sql
stable
set search_path to ''
as $function$
  select b.*
    from public.negocios b
   where b.pipeline_id = p_pipeline_id
     and b.id in (
       select x.id
         from (
           select n.id,
                  row_number() over (
                    partition by n.etapa_id
                    order by (n.ultima_atividade_em is null) desc,
                             n.ultima_atividade_em asc,
                             n.criado_em desc,
                             n.id
                  ) as posicao
             from public.negocios n
            where n.pipeline_id = p_pipeline_id
         ) x
        where x.posicao <= greatest(coalesce(p_por_etapa, 50), 1)
     )
   order by (b.ultima_atividade_em is null) desc,
            b.ultima_atividade_em asc,
            b.criado_em desc,
            b.id;
$function$;

comment on function public.negocios_do_board(uuid, integer) is
  'As N primeiras de cada etapa, JA ORDENADAS: nunca tocados primeiro, depois '
  'contato mais antigo. Quem acabou de receber um toque desce para o fim. O '
  'order by externo nao e redundante — sem ele a ordem das linhas devolvidas e '
  'indefinida, e o cliente nao reordena.';

-- 2) O ENVIO VIRA ATIVIDADE.
--
-- A atividade nasce CONCLUIDA e com `concluida_em = now()`: e um toque que ja
-- aconteceu, nao uma tarefa a fazer. O gatilho `trg_atividades_tocar_negocio` le
-- justamente `coalesce(new.concluida_em, new.criado_em, now())` e empurra
-- `ultima_atividade_em` — entao a data do card e o mergulho na lista saem os
-- dois deste mesmo INSERT, sem update manual em `negocios`.
--
-- A guarda `v_status <> 'enviada'` existe porque `concluir_envio` pode ser
-- chamada de novo para a mesma mensagem (uma repeticao do cron, um retry da
-- rota). Sem ela, o mesmo e-mail viraria duas atividades e o historico do card
-- mentiria.
--
-- `usuario_id` recebe quem aprovou. Fica nulo quando ninguem aprovou — hoje
-- nenhuma cadencia e autonoma, mas a coluna aceita nulo e inventar um autor
-- seria pior do que nao ter.
create or replace function public.concluir_envio(
  p_id uuid,
  p_ok boolean,
  p_provedor_id text default null::text,
  p_erro text default null::text,
  p_erro_codigo text default null::text,
  p_thread_externo text default null::text,
  p_message_id_externo text default null::text
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tentativas int;
  v_canal text;
  v_tenant uuid;
  v_status text;
  v_negocio uuid;
  v_assunto text;
  v_inscricao uuid;
  v_aprovador uuid;
begin
  select tentativas, canal, tenant_id, status, negocio_id, assunto, inscricao_id, aprovada_por
    into v_tentativas, v_canal, v_tenant, v_status, v_negocio, v_assunto, v_inscricao, v_aprovador
    from public.mensagens where id = p_id;
  if not found then return 'inexistente'; end if;

  if p_ok then
    -- `coalesce` nos dois novos: um provedor que não devolve thread (o WhatsApp)
    -- não pode apagar o que já estava lá.
    update public.mensagens
       set status = 'enviada',
           enviada_em = now(),
           provedor_id = p_provedor_id,
           thread_externo = coalesce(p_thread_externo, thread_externo),
           message_id_externo = coalesce(p_message_id_externo, message_id_externo),
           ultimo_erro = null,
           erro_codigo = null
     where id = p_id;

    -- O REGISTRO DO TOQUE. So na PRIMEIRA vez que a mensagem vira enviada, e so
    -- quando ela pertence a um negocio (mensagem sem negocio vive na
    -- quarentena e nao tem card onde aparecer).
    if v_status <> 'enviada' and v_negocio is not null then
      insert into public.atividades (
        negocio_id, usuario_id, tipo, titulo, descricao, concluida, concluida_em
      ) values (
        v_negocio,
        v_aprovador,
        case when v_canal = 'whatsapp' then 'whatsapp' else 'email' end,
        case
          when v_inscricao is not null
            then 'Cadência: ' || coalesce(nullif(btrim(v_assunto), ''),
                                          case when v_canal = 'whatsapp' then 'WhatsApp enviado'
                                               else 'e-mail enviado' end)
          else coalesce(nullif(btrim(v_assunto), ''), 'Mensagem enviada')
        end,
        null,
        true,
        now()
      );
    end if;

    if v_canal = 'whatsapp' then perform public.whatsapp_avaliar_bloqueio(v_tenant); end if;
    return 'enviada';
  end if;

  if v_tentativas >= 5 then
    update public.mensagens
       set status = 'falhou', ultimo_erro = p_erro, erro_codigo = p_erro_codigo
     where id = p_id;
    if v_canal = 'whatsapp' then perform public.whatsapp_avaliar_bloqueio(v_tenant); end if;
    return 'falhou';
  end if;

  update public.mensagens
     set status = 'aprovada',
         ultimo_erro = p_erro,
         erro_codigo = p_erro_codigo,
         proxima_tentativa_em = now() + make_interval(mins => power(2, v_tentativas)::int),
         agendada_para = now() + make_interval(mins => power(2, v_tentativas)::int)
   where id = p_id;
  return 'reagendada';
end;
$function$;

comment on function public.concluir_envio(uuid, boolean, text, text, text, text, text) is
  'Fecha o envio de uma mensagem e, quando ela sai, registra a atividade do '
  'toque no card. E o INSERT em atividades que empurra ultima_atividade_em pelo '
  'gatilho, e e isso que faz o card descer para o fim da coluna.';
