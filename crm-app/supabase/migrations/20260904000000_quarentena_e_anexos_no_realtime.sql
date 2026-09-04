-- `anexos` e `mensagens_sem_negocio` entram na publicação do realtime.
--
-- Medido antes de escrever: `mensagens` JÁ está na publicação; as outras duas
-- não, e as duas estão em `replica identity default`.
--
-- **Corrigindo o que seria fácil escrever aqui:** sem isto a tela NÃO ficaria
-- parada. `useSincronizacao` (`lib/supabase/realtime.ts:82-140`) não depende só
-- do websocket — ela recarrega periodicamente (45 s com socket, 8 s sem) e ao
-- voltar o foco da aba. Então o que muda é "até 45 s atrasado" virando "na
-- hora", e o contador da quarentena na barra do topo passando de um número
-- velho para um certo. É otimização honesta, não conserto de bug.
--
-- `replica identity full` é o que faz o payload do DELETE/UPDATE carregar as
-- colunas antigas — sem ele o filtro por `negocio_id` do lado do cliente não
-- casa em remoção, e o anexo apagado ficaria na tela.
--
-- As duas tabelas estão VAZIAS hoje (0 linhas), então não há risco de dado:
-- `replica identity full` só aumenta o volume do WAL para linhas futuras.

alter table public.anexos replica identity full;
alter table public.mensagens_sem_negocio replica identity full;

-- `add table` falha se a tabela já estiver na publicação, e esta migration
-- precisa poder rodar de novo num ambiente já migrado.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'anexos'
  ) then
    alter publication supabase_realtime add table public.anexos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensagens_sem_negocio'
  ) then
    alter publication supabase_realtime add table public.mensagens_sem_negocio;
  end if;
end $$;
