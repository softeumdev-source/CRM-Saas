-- ---------------------------------------------------------------------------
-- O toque que acabou de nascer passa a aparecer no TOPO da fila.
--
-- O DEFEITO, medido: a cadencia da Marisol avancou do passo 1 para o 2, o toque
-- de WhatsApp nasceu em 'aguardando_aprovacao' — e o card foi parar na posicao
-- 176 de 176 da coluna "Toque pronto p/ enviar". Como a coluna carrega 50 por
-- vez, ele nem era renderizado: para chegar nele era preciso clicar "Ver mais"
-- tres vezes. Avancar a cadencia e nao ver nada acontecer na tela.
--
-- A CAUSA foi a regra que eu mesmo escrevi na migration 20260908200000:
-- ordenar a fila pelo toque mais ANTIGO primeiro, com o raciocinio de "quem
-- espera ha mais tempo vem primeiro". O raciocinio nao esta errado para uma
-- fila que se trabalha do começo ao fim — mas ele joga para o ultimo lugar
-- justamente o card que ACABOU de virar acionavel. Com 176 na fila, isso e o
-- mesmo que esconder.
--
-- A REGRA NOVA: na coluna "toque pronto", o toque mais RECENTE primeiro. O
-- criterio nao e "novo e mais importante que velho" — e que a data do toque e o
-- momento em que aquele lead VIROU acionavel, e uma esteira precisa mostrar no
-- topo o que acabou de entrar nela. Quem trabalha a fila de tras para frente
-- continua alcancando tudo pelo "Ver mais".
--
-- As outras tres colunas nao mudam: "aguardando data" pela proxima data a
-- vencer, "parada" e "sem cadencia" pela regra do board (nunca tocados primeiro,
-- depois contato mais antigo).
--
-- O `desc nulls last` na primeira chave e o que faz uma unica clausula servir
-- as quatro colunas: dentro da particao "toque pronto" TODAS as linhas tem
-- `toque_parado_desde`, entao ela decide; nas outras tres, TODAS sao nulas,
-- empatam, e quem decide e a segunda chave.
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
             order by
               -- "toque pronto": o mais RECENTE no topo. Vale so nesta coluna,
               -- porque nas outras esta chave e nula em todas as linhas.
               c.toque_parado_desde desc nulls last,
               -- as outras tres, como antes
               coalesce(
                 case
                   when c.status_inscricao = 'ativa' then c.proximo_envio_em
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
   order by o.estado, o.posicao;
$function$;

comment on function public.negocios_por_cadencia(uuid, uuid, int) is
  'As N primeiras de cada ESTADO DE CADENCIA. Em "toque pronto" a ordem e o '
  'toque mais RECENTE primeiro — e o momento em que o lead virou acionavel, e '
  'uma esteira mostra no topo o que acabou de entrar nela. Nas outras tres, a '
  'proxima data a vencer e a regra do board.';
