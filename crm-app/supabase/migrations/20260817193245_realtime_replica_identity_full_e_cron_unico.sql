-- Sem REPLICA IDENTITY FULL o evento de DELETE/UPDATE so carrega a chave
-- primaria: os filtros do Realtime (ex.: negocio_id=eq.X) nao casam e o cliente
-- nunca recebe o evento. Como as tabelas sao pequenas, o custo em WAL e baixo.
alter table public.atividades replica identity full;
alter table public.propostas replica identity full;
alter table public.contatos replica identity full;
alter table public.etapas_pipeline replica identity full;

-- Havia dois jobs identicos processando os lembretes (a cada 5 e a cada 10 min).
select cron.unschedule('processar-lembretes')
 where exists (select 1 from cron.job where jobname = 'processar-lembretes');
