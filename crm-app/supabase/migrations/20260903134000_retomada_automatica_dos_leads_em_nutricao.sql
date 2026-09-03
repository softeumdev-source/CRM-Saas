-- ---------------------------------------------------------------------------
-- O lead parado em nutricao volta sozinho quando a data chega.
--
-- "Me procure no ano que vem" e a resposta mais comum de um lead que nao esta
-- pronto, e a pior de guardar: vira uma tarefa que alguem tem que lembrar de
-- fazer daqui a oito meses. Aqui ela vira uma data no proprio negocio
-- (`negocios.retomar_em`), e o banco devolve o lead para a etapa de ENTRADA do
-- funil quando ela vence.
--
-- Nao registra atividade de proposito. `atividades_tocar_negocio` moveria
-- `ultima_atividade_em`, e o board leria isso como "trabalhado hoje" — bolinha
-- verde num lead em que ninguem tocou. A mudanca de etapa ja fica gravada em
-- `negocio_etapa_historico` pelo gatilho, e quem tem dono recebe notificacao.
--
-- Roda no Postgres, e nao em cron da Vercel, porque o plano Hobby so permite
-- um disparo por dia. `pg_cron` ja roda de 5 em 5 minutos para os lembretes.
--
-- O laco parece caro e nao e: sao poucas linhas por hora, e ele permite contar
-- exatamente quantos leads voltaram. A primeira versao tentou deduzir isso de
-- `atualizado_em >= now() - 1s`, o que varria negocio nenhum a ver com a
-- retomada — e o retorno da funcao e o unico sinal que o cron deixa para
-- olhar depois.
-- ---------------------------------------------------------------------------

create or replace function public.retomar_leads_em_nutricao()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select n.id,
           n.responsavel_id,
           n.retomar_em,
           entrada.id as etapa_entrada,
           entrada.probabilidade,
           coalesce(c.empresa, c.nome, n.titulo) as rotulo
      from public.negocios n
      join public.etapas_pipeline nutricao
        on nutricao.id = n.etapa_id and nutricao.funcao = 'nutricao'
      join public.etapas_pipeline entrada
        on entrada.pipeline_id = nutricao.pipeline_id and entrada.funcao = 'entrada'
      left join public.contatos c on c.id = n.contato_id
     where n.retomar_em is not null
       and n.retomar_em <= now()
  loop
    update public.negocios
       set etapa_id = r.etapa_entrada,
           probabilidade = coalesce(r.probabilidade, 10),
           retomar_em = null,
           atualizado_em = now()
     where id = r.id;

    -- Lead em nutricao costuma estar no pool: sem dono, nao ha quem notificar,
    -- e ele aparece para os SDRs pela propria coluna do board.
    if r.responsavel_id is not null then
      insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
      values (
        r.responsavel_id,
        'lead_retomado',
        'Lead retomado: ' || r.rotulo,
        'A data de retomada (' || to_char(r.retomar_em, 'DD/MM/YYYY') || ') chegou. O lead voltou para o inicio do funil.',
        '/negocios/' || r.id
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.retomar_leads_em_nutricao() from public, anon, authenticated;

select cron.schedule(
  'retomar-leads-em-nutricao',
  '7 * * * *',
  'select public.retomar_leads_em_nutricao();'
);
