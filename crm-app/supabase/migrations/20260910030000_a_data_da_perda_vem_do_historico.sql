-- ---------------------------------------------------------------------------
-- A data da perda vem do histórico, e não da hora em que o conserto rodou.
--
-- Rabo da migration anterior. Ao corrigir `ganho` dos três negócios que
-- estavam em "Perdido" com a coluna nula, `trg_negocios_fechado_em` disparou e
-- carimbou `fechado_em = now()` — porque, para ele, o negócio tinha acabado de
-- fechar.
--
-- O efeito seria trocar um número errado por outro. `metricas.ts` monta o
-- painel assim:
--
--     perdidosArr = meus.filter((n) => n.ganho === false
--                                   && dentroDoPeriodo(n.fechado_em, inicio))
--
-- Ou seja: três perdas de AGOSTO apareceriam como perdas desta semana. Antes
-- da correção elas não apareciam em lugar nenhum (contavam como pipeline
-- aberto); depois dela apareceriam no mês errado. Nenhuma das duas serve.
--
-- ---------------------------------------------------------------------------
-- A DATA CERTA JÁ EXISTIA.
--
-- `negocio_etapa_historico.entrou_em` guarda quando o card entrou em cada
-- coluna, e o gatilho que escreve essa tabela é anterior a tudo isto. Para os
-- três, ela sabe:
--
--   Duas Rodas         06/08 20:20   (fechado_em dizia 09/09 23:25)
--   Mondelez Brasil    06/08 21:08
--   Zezé Biscoitos     06/08 21:17
--
-- Os outros quatro negócios fechados já têm `fechado_em` idêntico ao que o
-- histórico diz — conferido linha a linha. Este `update` não os toca.
--
-- ---------------------------------------------------------------------------
-- SÓ PARA TRÁS, E SÓ ONDE O HISTÓRICO SABE.
--
-- `where n.fechado_em > primeira_entrada` faz três coisas de uma vez:
--
--   - conserta apenas quem tem carimbo mais NOVO que o fato;
--   - deixa em paz quem não tem histórico de etapa de fechamento (o `join`
--     interno já exclui) — sem data melhor, a que existe fica;
--   - torna a migration inerte na segunda execução, porque depois do conserto
--     as duas passam a ser iguais.
--
-- Não mexe em `ganho` nem em `etapa_id`, então nem `trg_negocios_fechado_em`
-- nem `trg_negocios_etapa_define_ganho` reagem: os dois saem na primeira
-- linha. Conferido nas duas funções.
-- ---------------------------------------------------------------------------

do $$
declare
  v_ajustados int;
  v_restam int;
begin
  with primeira_perda as (
    select h.negocio_id, min(h.entrou_em) as entrou_em
      from public.negocio_etapa_historico h
      join public.etapas_pipeline e on e.id = h.etapa_id
     where e.resultado is not null
     group by h.negocio_id
  )
  update public.negocios n
     set fechado_em = pp.entrou_em
    from primeira_perda pp
   where pp.negocio_id = n.id
     and n.fechado_em is not null
     and n.fechado_em > pp.entrou_em;
  get diagnostics v_ajustados = row_count;

  with primeira_perda as (
    select h.negocio_id, min(h.entrou_em) as entrou_em
      from public.negocio_etapa_historico h
      join public.etapas_pipeline e on e.id = h.etapa_id
     where e.resultado is not null
     group by h.negocio_id
  )
  select count(*) into v_restam
    from public.negocios n
    join primeira_perda pp on pp.negocio_id = n.id
   where n.fechado_em is not null
     and n.fechado_em > pp.entrou_em;

  if v_restam > 0 then
    raise exception 'Sobraram % negocios com fechado_em posterior ao historico.', v_restam;
  end if;

  raise notice 'Datas de fechamento trazidas do historico: %.', v_ajustados;
end $$;
