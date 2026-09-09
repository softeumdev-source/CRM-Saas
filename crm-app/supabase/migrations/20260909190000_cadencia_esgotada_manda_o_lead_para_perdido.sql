-- ---------------------------------------------------------------------------
-- Cadência que chegou ao último toque sem resposta manda o lead para "Perdido".
--
-- Hoje, quando os passos acabam, `processar_cadencias()` faz uma coisa só:
-- `status='concluida'`. O card FICA na coluna em que estava — em "Novo Lead",
-- junto com os leads que ainda vão ser trabalhados. Um lead que recebeu sete
-- toques e não respondeu nenhum é indistinguível de um que chegou hoje.
--
-- ---------------------------------------------------------------------------
-- POR QUE UM GATILHO, E NÃO UM `create or replace` DA `processar_cadencias`.
--
-- Aquela função tem 7.400 caracteres e faz doze coisas: escolhe o passo, checa
-- resposta, checa consentimento, escolhe destino, monta assunto e corpo,
-- substitui variáveis, grava a mensagem, avança a inscrição. Reescrevê-la
-- inteira para mudar UM ramo de três linhas é a chance de transcrever errado
-- alguma das outras onze — e não há teste automatizado neste repositório para
-- pegar isso.
--
-- O gatilho observa o RESULTADO (`status` virou 'concluida'), que é o que
-- importa, e não o caminho.
--
-- ---------------------------------------------------------------------------
-- A DISTINÇÃO QUE O GATILHO PRECISA FAZER, E QUE É O CERNE DISTO.
--
-- 'concluida' acontece por DOIS motivos opostos:
--
--   a) os passos acabaram e o lead nunca respondeu  → perdido;
--   b) `encerrar_cadencia_por_reuniao()` (migration 20260909160000) encerrou
--      porque a REUNIÃO FOI AGENDADA                → o lead vai para Vendas.
--
-- Mandar (b) para "Perdido" seria marcar como perda justamente o lead que a
-- prospecção converteu. O que separa os dois é `passo_atual`: no esgotamento
-- ele é igual ao ÚLTIMO passo (é a condição que `processar_cadencias` usa para
-- concluir); na reunião agendada ele está onde estiver — hoje, para os 213
-- leads ativos, no passo 2 de 7.
--
-- Só isso não bastaria no caso raro de a reunião ser marcada exatamente no
-- último toque, então há uma segunda trava: negócio com reunião em aberto não
-- vira perda, ponto.
--
-- ---------------------------------------------------------------------------
-- O QUE ELE NÃO FAZ:
--
-- - não mexe em negócio que já está numa etapa de resultado (ganho ou perda);
-- - não mexe se o funil não tiver etapa de perda;
-- - não sobrescreve um `motivo_perda` que já exista;
-- - não age quando o status já era 'concluida' (update idempotente não repete).
--
-- Vale para as TRÊS cadências (primeiro contato, reaquecimento e no-show): em
-- todas, chegar ao fim sem resposta é a mesma notícia.
-- ---------------------------------------------------------------------------

create or replace function public.cadencia_esgotada_marca_perdido()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ultimo int;
  v_negocio record;
  v_etapa record;
begin
  if new.status <> 'concluida' or old.status is not distinct from new.status then
    return new;
  end if;

  select max(cp.ordem) into v_ultimo
    from public.cadencia_passos cp where cp.cadencia_id = new.cadencia_id;

  -- Encerrada no MEIO da fila: foi alguém/algo dizendo "para", e o motivo mais
  -- comum é a reunião agendada. Não é perda.
  if v_ultimo is null or new.passo_atual < v_ultimo then
    return new;
  end if;

  select n.id, n.pipeline_id, n.etapa_id into v_negocio
    from public.negocios n where n.id = new.negocio_id;
  if not found then
    return new;
  end if;

  -- A segunda trava. Reunião marcada e ainda não concluída = este lead está a
  -- caminho do vendedor, não do lixo.
  if exists (
    select 1 from public.atividades a
     where a.negocio_id = new.negocio_id
       and coalesce(a.concluida, false) = false
       and a.data_agendada is not null
  ) then
    return new;
  end if;

  -- Já fechado (ganho ou perdido): não há o que decidir.
  if exists (
    select 1 from public.etapas_pipeline e
     where e.id = v_negocio.etapa_id and e.resultado is not null
  ) then
    return new;
  end if;

  select e.id, e.nome into v_etapa
    from public.etapas_pipeline e
   where e.pipeline_id = v_negocio.pipeline_id and e.resultado = 'perdido'
   limit 1;
  if not found then
    return new;
  end if;

  update public.negocios
     set etapa_id = v_etapa.id,
         ganho = false,
         probabilidade = 0,
         motivo_perda = coalesce(motivo_perda, 'Cadencia de prospeccao encerrada: o lead nao respondeu a nenhum toque.'),
         atualizado_em = now()
   where id = new.negocio_id;

  -- `usuario_id` nulo porque nao foi uma pessoa: a coluna aceita nulo e a tela
  -- ja sabe desenhar atividade sem autor. Mentir um usuario aqui poria o nome
  -- de alguem num movimento que ele nao fez.
  insert into public.atividades (negocio_id, usuario_id, tipo, titulo, descricao)
  values (
    new.negocio_id, null, 'mudanca_etapa',
    'Cadencia encerrada: lead marcado como perdido',
    'A cadencia chegou ao ultimo toque (passo ' || new.passo_atual || ' de ' || v_ultimo ||
    ') sem resposta. O lead foi movido para "' || v_etapa.nome || '" automaticamente.'
  );

  return new;
end;
$function$;

comment on function public.cadencia_esgotada_marca_perdido() is
  'Ao esgotar os passos de uma cadencia sem resposta, move o negocio para a '
  'etapa de perda do funil. Nao age quando a inscricao foi encerrada no meio '
  '(reuniao agendada) nem quando ha reuniao em aberto.';

drop trigger if exists trg_cadencia_esgotada_perdido on public.cadencia_inscricoes;
create trigger trg_cadencia_esgotada_perdido
  after update of status on public.cadencia_inscricoes
  for each row
  execute function public.cadencia_esgotada_marca_perdido();

-- Funcao de GATILHO nao e RPC: sem isto ela aparece em /rest/v1/rpc/ e o
-- proprio advisor do Supabase a acusa. E a mesma correcao das migrations
-- `revoga_execute_das_funcoes_de_trigger` e `gatilho_nao_e_rpc_publica`.
revoke all on function public.cadencia_esgotada_marca_perdido() from public, anon, authenticated;
