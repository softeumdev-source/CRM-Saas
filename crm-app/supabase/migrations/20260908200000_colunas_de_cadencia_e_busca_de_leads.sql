-- ---------------------------------------------------------------------------
-- Duas coisas que o board do SDR nao tinha, e uma delas estava quebrada.
--
-- O PROBLEMA MEDIDO, hoje, neste banco:
--   216 leads na etapa "Novo Lead" do funil do SDR;
--   215 inscricoes de cadencia ativas;
--   181 mensagens em 'aguardando_aprovacao' — ou seja, 181 leads com um toque
--   PRONTO esperando um clique.
-- Tudo isso numa coluna so. A unica forma de achar os 181 era o filtro
-- "Precisa aprovacao", que e um recorte da tela — nao uma coluna.
--
-- E a busca: "Lista de Leads" carregava com o funil fixo em `vendas` e filtrava
-- em memoria sobre os 200 primeiros. Os 216 leads de prospeccao vivem no funil
-- `sdr`: procurar qualquer um deles pelo nome devolvia "nenhum negocio", que e
-- uma resposta ERRADA, nao uma lista vazia.
--
-- Nenhuma funcao aqui move card. O estado de cadencia e DERIVADO — o lead
-- continua na etapa em que esta. Mover `etapa_id` a cada toque brigaria com o
-- `processar_cadencias()`, que roda de 5 em 5 minutos, poluiria o historico e
-- quebraria o casamento por `ordem` que faz a entrega SDR -> vendedor.
--
-- SECURITY INVOKER (o padrao) em todas: a RLS de `negocios` continua valendo
-- dentro delas, e cada pessoa so conta e so acha o que ja podia ver.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1) O ESTADO DE CADENCIA DE UM LEAD.
--
-- Quatro estados, e a ordem do `case` E a regra:
--
--   toque_pronto    ha mensagem em 'aguardando_aprovacao'. E o "precisa enviar
--                   outra atividade da cadencia" — vem PRIMEIRO porque uma
--                   cadencia pausada tambem pode ter um toque parado na fila,
--                   e o clique pendente manda mais que o status da inscricao.
--   aguardando_data inscricao 'ativa' sem nada na fila: o proximo toque tem
--                   data e o relogio esta correndo.
--   parada          inscricao existe mas nao esta ativa (pausada, respondeu,
--                   concluida, cancelada). Nao vai sair mais toque sozinho.
--   sem_cadencia    nunca foi inscrito.
--
-- `left join lateral ... order by criado_em desc limit 1` resolve o mesmo caso
-- que `mapaDeCadencias` resolve no cliente: um negocio pode ter sido inscrito
-- mais de uma vez ao longo da vida, e vale a inscricao MAIS NOVA. Sem a ordem,
-- qual delas ganharia dependeria do plano do Postgres.
--
-- ESTA REGRA TEM UM ESPELHO NO CLIENTE (`estadoDeCadencia`, em lib/board.ts).
-- As duas TEM que concordar: aqui ela decide a fatia e a contagem do cabecalho,
-- la ela decide em qual coluna o card carregado aparece. Um card na coluna
-- errada, com o cabecalho certo, seria pior do que nao ter as colunas.
-- ---------------------------------------------------------------------------

create or replace function public.negocios_por_cadencia(
  p_pipeline_id uuid,
  p_etapa_id uuid default null,
  p_por_estado int default 50
)
returns setof public.negocios
language sql
stable
set search_path to ''
as $function$
  with classificado as (
    select n.id,
           n.criado_em,
           n.ultima_atividade_em,
           i.status as status_inscricao,
           i.proximo_envio_em,
           -- Nao e `exists`: a DATA do toque mais antigo parado na fila e o que
           -- ordena a coluna "toque pronto". Quem esta esperando ha mais tempo
           -- aparece primeiro.
           (select min(m.criado_em)
              from public.mensagens m
             where m.negocio_id = n.id
               and m.status = 'aguardando_aprovacao') as toque_parado_desde
      from public.negocios n
      left join lateral (
        select ci.status, ci.proximo_envio_em
          from public.cadencia_inscricoes ci
         where ci.negocio_id = n.id
         order by ci.criado_em desc
         limit 1
      ) i on true
     where n.pipeline_id = p_pipeline_id
       and (p_etapa_id is null or n.etapa_id = p_etapa_id)
  ),
  ordenado as (
    select c.id,
           case
             when c.toque_parado_desde is not null then 'toque_pronto'
             when c.status_inscricao = 'ativa'     then 'aguardando_data'
             when c.status_inscricao is not null   then 'parada'
             else 'sem_cadencia'
           end as estado,
           row_number() over (
             partition by
               case
                 when c.toque_parado_desde is not null then 'toque_pronto'
                 when c.status_inscricao = 'ativa'     then 'aguardando_data'
                 when c.status_inscricao is not null   then 'parada'
                 else 'sem_cadencia'
               end
             -- Cada coluna ordena pelo relogio QUE IMPORTA nela: a fila de
             -- aprovacao pelo toque mais antigo, a de espera pela proxima data
             -- a vencer, e as duas ultimas pela regra do board (quem nunca foi
             -- tocado primeiro). `-infinity` e o que poe os nunca-tocados no
             -- topo sem um `nulls first` que valeria para todas.
             order by coalesce(
                        case
                          when c.toque_parado_desde is not null then c.toque_parado_desde
                          when c.status_inscricao = 'ativa'     then c.proximo_envio_em
                          else c.ultima_atividade_em
                        end,
                        '-infinity'::timestamptz
                      ) asc,
                      c.criado_em desc,
                      c.id
           ) as posicao
      from classificado c
  )
  select b.*
    from public.negocios b
    join ordenado o on o.id = b.id
   where o.posicao <= greatest(coalesce(p_por_estado, 50), 1)
   -- O `order by` externo nao e enfeite, pelo mesmo motivo da migration
   -- 20260908160000: sem ele a ordem das linhas devolvidas e indefinida e o
   -- cliente nao reordena.
   order by o.estado, o.posicao;
$function$;

comment on function public.negocios_por_cadencia(uuid, uuid, int) is
  'As N primeiras de cada ESTADO DE CADENCIA (toque_pronto, aguardando_data, '
  'parada, sem_cadencia), opcionalmente dentro de uma etapa. Retorna setof '
  'negocios para o PostgREST embutir contato/responsavel/etapa/atividades, '
  'como negocios_do_board.';

-- ---------------------------------------------------------------------------
-- 2) QUANTOS EXISTEM DE VERDADE EM CADA ESTADO.
--
-- Sem isto o cabecalho da coluna mentiria: a fatia traz 50 por estado, e a
-- coluna "toque pronto" diria "23" quando existem 181. E exatamente o par que
-- `contagem_negocios_por_etapa` faz com `negocios_do_board`.
-- ---------------------------------------------------------------------------

create or replace function public.contagem_por_cadencia(
  p_pipeline_id uuid,
  p_etapa_id uuid default null
)
returns table (estado text, total bigint)
language sql
stable
set search_path to ''
as $function$
  select case
           when exists (
             select 1 from public.mensagens m
              where m.negocio_id = n.id and m.status = 'aguardando_aprovacao'
           ) then 'toque_pronto'
           when i.status = 'ativa'   then 'aguardando_data'
           when i.status is not null then 'parada'
           else 'sem_cadencia'
         end as estado,
         count(*)::bigint as total
    from public.negocios n
    left join lateral (
      select ci.status
        from public.cadencia_inscricoes ci
       where ci.negocio_id = n.id
       order by ci.criado_em desc
       limit 1
    ) i on true
   where n.pipeline_id = p_pipeline_id
     and (p_etapa_id is null or n.etapa_id = p_etapa_id)
   group by 1;
$function$;

comment on function public.contagem_por_cadencia(uuid, uuid) is
  'Quantos negocios existem em cada estado de cadencia. O cabecalho da coluna '
  'sai daqui, e nao do que foi carregado.';

-- ---------------------------------------------------------------------------
-- 3) A BUSCA PASSA A SER NO BANCO.
--
-- A busca da lista e a do board eram `Array.filter` sobre o que ja estava na
-- memoria — 200 registros na lista, 50 por coluna no board. Procurar um lead na
-- posicao 300 devolvia "nenhum negocio encontrado", e o codigo da lista ja
-- admitia isso num comentario. Uma busca que responde "nao existe" quando a
-- resposta certa e "ainda nao veio" e pior do que nao ter busca.
--
-- `p_pipeline_id` nulo procura nos DOIS funis. E o padrao da tela de leads: a
-- pessoa que digita um nome quer achar a pessoa, nao saber em qual funil ela
-- mora.
--
-- Os digitos: CNPJ e telefone sao gravados com pontuacao, e ninguem digita a
-- pontuacao igual. Comparar so os digitos dos dois lados e o que faz
-- "11.222.333/0001-44", "11222333000144" e "222333" acharem o mesmo contato.
-- O piso de 3 digitos existe para "1" nao varrer a base inteira.
--
-- `%` e `_` digitados pela pessoa continuam valendo como coringa do ILIKE. Nao
-- e furo de seguranca (nao ha concatenacao de SQL, e a RLS continua valendo);
-- na pratica so alarga a busca de quem digitou, e travar isso custaria mais
-- codigo do que vale.
-- ---------------------------------------------------------------------------

create or replace function public.buscar_negocios(
  p_termo text,
  p_pipeline_id uuid default null,
  p_limite int default 100
)
returns setof public.negocios
language sql
stable
set search_path to ''
as $function$
  with t as (
    select btrim(coalesce(p_termo, '')) as termo,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as digitos
  )
  select n.*
    from public.negocios n
    left join public.contatos c on c.id = n.contato_id
    cross join t
   where t.termo <> ''
     and (p_pipeline_id is null or n.pipeline_id = p_pipeline_id)
     and (
       n.titulo     ilike '%' || t.termo || '%'
       or c.nome    ilike '%' || t.termo || '%'
       or c.empresa ilike '%' || t.termo || '%'
       or c.email   ilike '%' || t.termo || '%'
       or c.cnpj    ilike '%' || t.termo || '%'
       or (
         length(t.digitos) >= 3
         and (
           regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g')     like '%' || t.digitos || '%'
           or regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') like '%' || t.digitos || '%'
           or regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g') like '%' || t.digitos || '%'
         )
       )
     )
   order by n.atualizado_em desc nulls last, n.criado_em desc, n.id
   limit greatest(coalesce(p_limite, 100), 1);
$function$;

comment on function public.buscar_negocios(text, uuid, int) is
  'Procura um negocio pelo titulo ou pelo contato (nome, empresa, e-mail, CNPJ, '
  'telefone, WhatsApp) no banco inteiro, e nao no que a tela ja carregou. '
  'p_pipeline_id nulo procura nos dois funis.';

-- ---------------------------------------------------------------------------
-- 4) OS INDICES QUE ESTAS TRES CONSULTAS PEDEM.
--
-- `mensagens_aprovacao_idx` (que ja existe) e por (tenant_id, criado_em) — nao
-- serve para "as mensagens aguardando aprovacao DESTE negocio", que e a
-- pergunta que as duas primeiras funcoes fazem uma vez por lead. O indice
-- parcial abaixo le so as 181 linhas que interessam.
--
-- O de `cadencia_inscricoes` e por (negocio_id, criado_em desc) porque o
-- `lateral` pede exatamente a linha mais nova de um negocio.
-- ---------------------------------------------------------------------------

create index if not exists mensagens_negocio_aguardando_idx
  on public.mensagens (negocio_id)
  where status = 'aguardando_aprovacao';

create index if not exists cadencia_inscricoes_negocio_recente_idx
  on public.cadencia_inscricoes (negocio_id, criado_em desc);

create index if not exists negocios_pipeline_etapa_idx
  on public.negocios (pipeline_id, etapa_id);
