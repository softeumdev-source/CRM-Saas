-- O pool do SDR nas quatro tabelas que penduram no negócio.
--
-- O defeito, medido em transação revertida antes de escrever isto: com as
-- claims de um SDR, sobre um lead SEM DONO no funil dele —
--
--   vê o negócio ....... t
--   vê as atividades ... f
--   vê as propostas .... f
--   vê os envelopes .... f
--
-- `negocios_select` tem três termos: `admin OR sou o responsável OR (sem dono E
-- num funil do meu papel)`. As políticas de `atividades`, `propostas`,
-- `envelopes` e `signatarios` delegam para `negocios` mas param no SEGUNDO
-- termo. Falta o pool.
--
-- Como lead sem dono é o estado NORMAL no funil do SDR, o efeito é diário: o
-- card abre, o histórico aparece vazio, e a aba de proposta some. Nada disso dá
-- erro — a RLS simplesmente não devolve linha, que é o modo de falha mais caro
-- porque parece "não tem nada aqui".
--
-- É o mesmo defeito que a Fase 3b consertou nas políticas do bucket
-- `documentos`, e a Fase 5 encontrou ao transcrever o schema.
--
-- **O que NÃO muda:** as políticas de DELETE que já eram só de admin
-- (`propostas_delete_admin`, `envelopes_delete_admin`,
-- `signatarios_delete_admin`) continuam só de admin. Apagar proposta e
-- envelope é destrutivo, e o pool não é motivo para alargar isso.
-- `atividades_delete` entra porque ela nunca foi de admin — é do responsável, e
-- quem cria a atividade no lead do pool tem que poder desfazê-la.
--
-- O terceiro termo é copiado de `negocios_select` LETRA POR LETRA. A duplicação
-- é justamente o que fez isto divergir da primeira vez; o conserto estrutural
-- seria uma função `negocio_visivel(uuid)` em `security invoker`, que herdaria
-- a RLS de `negocios` e nunca poderia divergir. Fica anotado como o próximo
-- passo — trocar o mecanismo de autorização no mesmo commit em que se conserta
-- um furo é mudar duas variáveis de uma vez.

-- ---------------------------------------------------------------------------
-- atividades
-- ---------------------------------------------------------------------------
drop policy if exists atividades_select on public.atividades;
create policy atividades_select on public.atividades for select
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = atividades.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

drop policy if exists atividades_insert on public.atividades;
create policy atividades_insert on public.atividades for insert
  with check ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = atividades.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

drop policy if exists atividades_update on public.atividades;
create policy atividades_update on public.atividades for update
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = atividades.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

drop policy if exists atividades_delete on public.atividades;
create policy atividades_delete on public.atividades for delete
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = atividades.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

-- ---------------------------------------------------------------------------
-- propostas
-- ---------------------------------------------------------------------------
drop policy if exists propostas_select on public.propostas;
create policy propostas_select on public.propostas for select
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = propostas.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

drop policy if exists propostas_insert on public.propostas;
create policy propostas_insert on public.propostas for insert
  with check ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = propostas.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

drop policy if exists propostas_update on public.propostas;
create policy propostas_update on public.propostas for update
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = propostas.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

-- ---------------------------------------------------------------------------
-- envelopes
-- ---------------------------------------------------------------------------
drop policy if exists envelopes_select on public.envelopes;
create policy envelopes_select on public.envelopes for select
  using ((EXISTS ( SELECT 1
   FROM (propostas p
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((p.id = envelopes.proposta_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

drop policy if exists envelopes_insert on public.envelopes;
create policy envelopes_insert on public.envelopes for insert
  with check ((EXISTS ( SELECT 1
   FROM (propostas p
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((p.id = envelopes.proposta_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

drop policy if exists envelopes_update on public.envelopes;
create policy envelopes_update on public.envelopes for update
  using ((EXISTS ( SELECT 1
   FROM (propostas p
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((p.id = envelopes.proposta_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

-- ---------------------------------------------------------------------------
-- signatarios
-- ---------------------------------------------------------------------------
drop policy if exists signatarios_select on public.signatarios;
create policy signatarios_select on public.signatarios for select
  using ((EXISTS ( SELECT 1
   FROM ((envelopes e
     JOIN propostas p ON ((p.id = e.proposta_id)))
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((e.id = signatarios.envelope_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));

drop policy if exists signatarios_insert on public.signatarios;
create policy signatarios_insert on public.signatarios for insert
  with check ((EXISTS ( SELECT 1
   FROM ((envelopes e
     JOIN propostas p ON ((p.id = e.proposta_id)))
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((e.id = signatarios.envelope_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)) OR ((n.responsavel_id IS NULL) AND (n.pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))))));
