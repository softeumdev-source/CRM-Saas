-- As 45 políticas de RLS do schema base.
--
-- Roda depois das funções: toda política aqui chama `usuario_tenant_id()`,
-- `usuario_role()` ou `pipelines_do_meu_papel()`. Sem elas criadas antes, o
-- `create policy` falha.
--
-- **A regra que se repete, e por que ela tem três formas.** Todo acesso começa
-- por `tenant_id = usuario_tenant_id()` — o isolamento entre empresas. O que
-- muda é o segundo termo:
--
-- 1. **Tabela de catálogo** (`planos`, `etapas_pipeline`): todo mundo do tenant
--    lê, só admin escreve. São dados de configuração, não de cliente.
-- 2. **Tabela de dono** (`contatos`): admin, OU sou o responsável, OU está sem
--    dono. O terceiro termo é o pool — lead sem dono é de quem pegar.
-- 3. **`negocios`**: igual à 2, mas o pool é RECORTADO POR FUNIL —
--    `pipeline_id in (pipelines_do_meu_papel())`. É o que faz um vendedor não
--    enxergar o lead que o SDR está prospectando, e vice-versa. É também a
--    regra que as políticas do bucket `documentos` e as tabelas `mensagens`,
--    `anexos` e `cadencia_inscricoes` DELEGAM em vez de recopiar — uma segunda
--    cópia divergiria no primeiro ajuste.
--
-- `drop policy if exists` antes de cada `create` deixa a migration idempotente
-- e, aplicada em produção, reescreve cada política com um texto idêntico ao que
-- já está lá. Conferido por diferença de `pg_policies` antes e depois.
--
-- O `( SELECT usuario_tenant_id() )` em vez da chamada direta em algumas delas
-- não é ruído do gerador: envolver em subconsulta faz o Postgres avaliar a
-- função UMA vez por consulta em vez de uma vez por linha. Num board de 25
-- cards é a diferença entre 1 e 25 chamadas.

alter table public.tenants               enable row level security;
alter table public.usuarios              enable row level security;
alter table public.planos                enable row level security;
alter table public.etapas_pipeline       enable row level security;
alter table public.contatos              enable row level security;
alter table public.negocios              enable row level security;
alter table public.atividades            enable row level security;
alter table public.negocio_etapa_historico enable row level security;
alter table public.propostas             enable row level security;
alter table public.envelopes             enable row level security;
alter table public.signatarios           enable row level security;
alter table public.convites              enable row level security;
alter table public.notificacoes          enable row level security;
alter table public.regras_distribuicao   enable row level security;
alter table public.solicitacoes_desconto enable row level security;

-- ---------------------------------------------------------------------------
-- Empresa e pessoas
-- ---------------------------------------------------------------------------
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants for select
  using ((id = usuario_tenant_id()));

drop policy if exists tenants_update_admin on public.tenants;
create policy tenants_update_admin on public.tenants for update
  using (((id = usuario_tenant_id()) AND (usuario_role() = 'admin'::text)));

drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select
  using ((tenant_id = usuario_tenant_id()));

-- Cada um edita o próprio cadastro; admin edita o de todos do tenant.
drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios for update
  using (((id = ( SELECT auth.uid() AS uid)) OR ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) AND (tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)))));

drop policy if exists usuarios_delete_admin on public.usuarios;
create policy usuarios_delete_admin on public.usuarios for delete
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

-- ---------------------------------------------------------------------------
-- Catálogo: todos leem, só admin escreve
-- ---------------------------------------------------------------------------
drop policy if exists planos_select on public.planos;
create policy planos_select on public.planos for select
  using ((tenant_id = usuario_tenant_id()));

drop policy if exists planos_admin_insert on public.planos;
create policy planos_admin_insert on public.planos for insert
  with check (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

drop policy if exists planos_admin_update on public.planos;
create policy planos_admin_update on public.planos for update
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

drop policy if exists planos_admin_delete on public.planos;
create policy planos_admin_delete on public.planos for delete
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

drop policy if exists etapas_select on public.etapas_pipeline;
create policy etapas_select on public.etapas_pipeline for select
  using ((tenant_id = usuario_tenant_id()));

drop policy if exists etapas_admin_insert on public.etapas_pipeline;
create policy etapas_admin_insert on public.etapas_pipeline for insert
  with check (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

drop policy if exists etapas_admin_update on public.etapas_pipeline;
create policy etapas_admin_update on public.etapas_pipeline for update
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

drop policy if exists etapas_admin_delete on public.etapas_pipeline;
create policy etapas_admin_delete on public.etapas_pipeline for delete
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

-- ---------------------------------------------------------------------------
-- Contatos: admin, ou meu, ou sem dono
-- ---------------------------------------------------------------------------
drop policy if exists contatos_select on public.contatos;
create policy contatos_select on public.contatos for select
  using (((tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (responsavel_id = ( SELECT auth.uid() AS uid)) OR (responsavel_id IS NULL))));

drop policy if exists contatos_insert on public.contatos;
create policy contatos_insert on public.contatos for insert
  with check ((tenant_id = usuario_tenant_id()));

drop policy if exists contatos_update on public.contatos;
create policy contatos_update on public.contatos for update
  using (((tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (responsavel_id = ( SELECT auth.uid() AS uid)) OR (responsavel_id IS NULL))));

drop policy if exists contatos_delete_admin on public.contatos;
create policy contatos_delete_admin on public.contatos for delete
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

-- ---------------------------------------------------------------------------
-- Negócios: a regra da qual todo o resto do sistema depende
-- ---------------------------------------------------------------------------
-- `negocios_update` não declara `with check` próprio. Não é esquecimento: sem
-- ele o Postgres reaproveita o `using`, ou seja, quem enxerga o card pode
-- atualizá-lo — a permissão que `moverEtapa` e o marcador de resposta lida
-- usam.
drop policy if exists negocios_select on public.negocios;
create policy negocios_select on public.negocios for select
  using (((tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (responsavel_id = ( SELECT auth.uid() AS uid)) OR ((responsavel_id IS NULL) AND (pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))));

drop policy if exists negocios_insert on public.negocios;
create policy negocios_insert on public.negocios for insert
  with check ((tenant_id = usuario_tenant_id()));

drop policy if exists negocios_update on public.negocios;
create policy negocios_update on public.negocios for update
  using (((tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (responsavel_id = ( SELECT auth.uid() AS uid)) OR ((responsavel_id IS NULL) AND (pipeline_id IN ( SELECT pipelines_do_meu_papel() AS pipelines_do_meu_papel))))));

drop policy if exists negocios_delete_admin on public.negocios;
create policy negocios_delete_admin on public.negocios for delete
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

-- ---------------------------------------------------------------------------
-- Tudo que pendura no negócio: atividades, propostas, envelopes, signatários
-- ---------------------------------------------------------------------------
-- **Uma divergência que a transcrição expôs, e que eu NÃO conserto aqui.**
-- Estas quatro delegam para `negocios`, mas param no segundo OR:
-- `admin OR n.responsavel_id = auth.uid()`. Falta o TERCEIRO —
-- `(responsavel_id is null and pipeline_id in pipelines_do_meu_papel())`, o
-- pool. É exatamente o mesmo defeito que a Fase 3b consertou nas políticas do
-- bucket `documentos`.
--
-- O efeito prático: um SDR enxerga o lead sem dono do funil dele (a
-- `negocios_select` tem o pool), mas NÃO enxerga as atividades, propostas nem
-- envelopes desse mesmo lead. Como lead sem dono é o estado normal no funil do
-- SDR, isso é uma inconsistência viva, não teórica.
--
-- Fica transcrito como está porque esta migration descreve o banco que existe.
-- Alargar política é mudança de segurança, e é decisão separada.
--
-- >>> CONSERTADO DEPOIS, em
-- >>> `20260904020000_pool_do_sdr_nas_politicas_que_pendem_do_negocio.sql`.
-- >>> Este arquivo continua com o texto antigo de propósito: ele é a
-- >>> transcrição do estado daquele momento, e reescrevê-lo faria a migration
-- >>> seguinte virar um no-op num ambiente novo.
drop policy if exists atividades_select on public.atividades;
create policy atividades_select on public.atividades for select
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = atividades.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists atividades_insert on public.atividades;
create policy atividades_insert on public.atividades for insert
  with check ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = atividades.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists atividades_update on public.atividades;
create policy atividades_update on public.atividades for update
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = atividades.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists atividades_delete on public.atividades;
create policy atividades_delete on public.atividades for delete
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = atividades.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

-- O histórico é do TENANT inteiro, de propósito: é a base do relatório de
-- funil, e um relatório que só conta os cards de quem está olhando mentiria.
drop policy if exists neh_select on public.negocio_etapa_historico;
create policy neh_select on public.negocio_etapa_historico for select to authenticated
  using ((tenant_id = usuario_tenant_id()));

drop policy if exists propostas_select on public.propostas;
create policy propostas_select on public.propostas for select
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = propostas.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists propostas_insert on public.propostas;
create policy propostas_insert on public.propostas for insert
  with check ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = propostas.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists propostas_update on public.propostas;
create policy propostas_update on public.propostas for update
  using ((EXISTS ( SELECT 1
   FROM negocios n
  WHERE ((n.id = propostas.negocio_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists propostas_delete_admin on public.propostas;
create policy propostas_delete_admin on public.propostas for delete
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

drop policy if exists envelopes_select on public.envelopes;
create policy envelopes_select on public.envelopes for select
  using ((EXISTS ( SELECT 1
   FROM (propostas p
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((p.id = envelopes.proposta_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists envelopes_insert on public.envelopes;
create policy envelopes_insert on public.envelopes for insert
  with check ((EXISTS ( SELECT 1
   FROM (propostas p
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((p.id = envelopes.proposta_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists envelopes_update on public.envelopes;
create policy envelopes_update on public.envelopes for update
  using ((EXISTS ( SELECT 1
   FROM (propostas p
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((p.id = envelopes.proposta_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists envelopes_delete_admin on public.envelopes;
create policy envelopes_delete_admin on public.envelopes for delete
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

-- Note o que NÃO existe aqui: `signatarios_update`. Assinar não passa por RLS —
-- passa por `registrar_assinatura`, que é `security definer` e tem o token como
-- única chave. O cliente que assina não é usuário do CRM e nunca teria uma
-- política que o autorizasse.
drop policy if exists signatarios_select on public.signatarios;
create policy signatarios_select on public.signatarios for select
  using ((EXISTS ( SELECT 1
   FROM ((envelopes e
     JOIN propostas p ON ((p.id = e.proposta_id)))
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((e.id = signatarios.envelope_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists signatarios_insert on public.signatarios;
create policy signatarios_insert on public.signatarios for insert
  with check ((EXISTS ( SELECT 1
   FROM ((envelopes e
     JOIN propostas p ON ((p.id = e.proposta_id)))
     JOIN negocios n ON ((n.id = p.negocio_id)))
  WHERE ((e.id = signatarios.envelope_id) AND (n.tenant_id = ( SELECT usuario_tenant_id() AS usuario_tenant_id)) AND ((( SELECT usuario_role() AS usuario_role) = 'admin'::text) OR (n.responsavel_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists signatarios_delete_admin on public.signatarios;
create policy signatarios_delete_admin on public.signatarios for delete
  using ((EXISTS ( SELECT 1
   FROM envelopes e
  WHERE ((e.id = signatarios.envelope_id) AND (e.tenant_id = usuario_tenant_id()) AND (usuario_role() = 'admin'::text)))));

-- ---------------------------------------------------------------------------
-- Operação
-- ---------------------------------------------------------------------------
drop policy if exists convites_admin_all on public.convites;
create policy convites_admin_all on public.convites for all
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())))
  with check (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

drop policy if exists convites_delete_admin on public.convites;
create policy convites_delete_admin on public.convites for delete
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

-- Notificação é estritamente pessoal: nem o admin lê a de outra pessoa.
drop policy if exists notificacoes_select on public.notificacoes;
create policy notificacoes_select on public.notificacoes for select
  using ((usuario_id = ( SELECT auth.uid() AS uid)));

drop policy if exists notificacoes_update on public.notificacoes;
create policy notificacoes_update on public.notificacoes for update
  using ((usuario_id = ( SELECT auth.uid() AS uid)));

drop policy if exists notificacoes_delete on public.notificacoes;
create policy notificacoes_delete on public.notificacoes for delete
  using ((usuario_id = ( SELECT auth.uid() AS uid)));

drop policy if exists regras_admin_all on public.regras_distribuicao;
create policy regras_admin_all on public.regras_distribuicao for all
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())))
  with check (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));

-- Sem política de INSERT: pedir desconto passa por `solicitar_desconto`, que é
-- `security definer` e checa "é meu negócio ou sou admin" no corpo. Uma
-- política de insert aqui seria um segundo caminho, com uma segunda regra.
drop policy if exists solic_desc_select on public.solicitacoes_desconto;
create policy solic_desc_select on public.solicitacoes_desconto for select
  using (((tenant_id = usuario_tenant_id()) AND ((usuario_role() = 'admin'::text) OR (vendedor_id = auth.uid()))));

drop policy if exists solic_desc_update_admin on public.solicitacoes_desconto;
create policy solic_desc_update_admin on public.solicitacoes_desconto for update
  using (((usuario_role() = 'admin'::text) AND (tenant_id = usuario_tenant_id())));
