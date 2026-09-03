-- ---------------------------------------------------------------------------
-- O board deixa de baixar TODOS os negocios do funil.
--
-- Hoje sao 25 e nao doi. Com o SDR gerando 500-2000 leads por mes, a mesma
-- consulta passa a trazer milhares de linhas COM relacoes completas (contato,
-- responsavel, etapa e as atividades pendentes de cada uma) a cada abertura de
-- tela e a cada evento de realtime. Quebra em cerca de dois meses.
--
-- Board nao pagina como lista: nao adianta "pagina 2", cada COLUNA precisa da
-- sua fatia. Uma consulta por coluna seriam 7 idas ao banco; aqui e uma so,
-- com `row_number()` particionado por etapa.
--
-- A ordem dentro da coluna aproxima a urgencia que a tela calcula (lib/
-- atividades.ts): primeiro quem nunca teve contato, depois o contato mais
-- antigo. Nao e identica — a regra fina depende das atividades pendentes e
-- continua sendo aplicada no cliente sobre o que chegou —, mas garante que
-- quem precisa de atencao esteja DENTRO da fatia, que e o que importa.
--
-- O `select b.*` sai da tabela base de proposito: listar as colunas na mao
-- quebra a funcao (o tipo de retorno tem que bater coluna a coluna, e ja
-- quebrou uma vez aqui) e voltaria a quebrar a cada coluna nova.
--
-- SECURITY INVOKER: a RLS de `negocios` continua valendo dentro da funcao, e o
-- vendedor so conta e so ve o que ja podia.
-- ---------------------------------------------------------------------------

create or replace function public.negocios_do_board(
  p_pipeline_id uuid,
  p_por_etapa int default 50
)
returns setof public.negocios
language sql
stable
security invoker
set search_path to ''
as $$
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
                             n.criado_em desc
                  ) as posicao
             from public.negocios n
            where n.pipeline_id = p_pipeline_id
         ) x
        where x.posicao <= greatest(coalesce(p_por_etapa, 50), 1)
     );
$$;

comment on function public.negocios_do_board(uuid, int) is
  'As N primeiras oportunidades de cada etapa de um funil. Retorna setof negocios para o PostgREST poder embutir contato/responsavel/etapa/atividades.';

-- Quantos existem de verdade em cada coluna, para o cabecalho poder dizer
-- "50 de 340" em vez de mentir que sao 50.
create or replace function public.contagem_negocios_por_etapa(p_pipeline_id uuid)
returns table (etapa_id uuid, total bigint)
language sql
stable
security invoker
set search_path to ''
as $$
  select n.etapa_id, count(*)::bigint
    from public.negocios n
   where n.pipeline_id = p_pipeline_id
     and n.etapa_id is not null
   group by n.etapa_id;
$$;
