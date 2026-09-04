-- Os 44 índices do schema base.
--
-- Roda DEPOIS das funções: `contatos_telefone_chave_idx` e
-- `contatos_whatsapp_chave_idx` são índices FUNCIONAIS sobre
-- `telefone_chave(...)`. Índice funcional exige a função criada antes, senão a
-- migration falha num ambiente novo — e falharia só lá, nunca aqui, que é o
-- pior tipo de erro para descobrir.
--
-- **Um achado que a transcrição expôs, e que eu NÃO conserto aqui:** `contatos`
-- tem DOIS índices únicos sobrepostos no mesmo par —
-- `contatos_tenant_email_unique` em `(tenant_id, email)` e
-- `ux_contatos_tenant_email` em `(tenant_id, lower(email))`. O segundo é
-- estritamente mais forte (pega `Ana@x.com` contra `ana@x.com`); o primeiro é
-- peso morto que toda escrita em `contatos` paga. Descrever o banco e mudá-lo
-- na mesma migration seria misturar duas coisas: aqui é transcrição, e a
-- limpeza é decisão separada.

create index if not exists usuarios_tenant_idx on public.usuarios using btree (tenant_id);
create index if not exists planos_tenant_idx on public.planos using btree (tenant_id);

create index if not exists etapas_pipeline_tenant_idx on public.etapas_pipeline using btree (tenant_id);
create index if not exists etapas_pipeline_pipeline_id_idx on public.etapas_pipeline using btree (pipeline_id);
-- Uma etapa de cada função por funil: não existem duas "entrada" no mesmo
-- pipeline. É o que `etapaComFuncao` assume ao usar `maybeSingle`.
create unique index if not exists etapas_pipeline_funcao_unica
  on public.etapas_pipeline using btree (pipeline_id, funcao) where (funcao is not null);

create index if not exists contatos_tenant_idx on public.contatos using btree (tenant_id);
create index if not exists contatos_responsavel_idx on public.contatos using btree (responsavel_id);
-- Cobre o `ilike` do resolver de e-mail de entrada.
create index if not exists contatos_email_normalizado_idx
  on public.contatos using btree (lower(btrim(email))) where (email is not null);
-- A normalização do telefone (nono dígito, DDI) vive no BANCO justamente para
-- o índice e o resolver usarem a MESMA regra.
create index if not exists contatos_telefone_chave_idx
  on public.contatos using btree (telefone_chave(telefone))
  where ((telefone is not null) and (btrim(telefone) <> ''::text));
create index if not exists contatos_whatsapp_chave_idx
  on public.contatos using btree (telefone_chave(whatsapp))
  where ((whatsapp is not null) and (btrim(whatsapp) <> ''::text));
create unique index if not exists contatos_tenant_email_unique
  on public.contatos using btree (tenant_id, email) where (email is not null);
create unique index if not exists ux_contatos_tenant_email
  on public.contatos using btree (tenant_id, lower(email))
  where ((email is not null) and (email <> ''::text));

create index if not exists negocios_tenant_idx on public.negocios using btree (tenant_id);
create index if not exists negocios_contato_idx on public.negocios using btree (contato_id);
create index if not exists negocios_etapa_idx on public.negocios using btree (etapa_id);
create index if not exists negocios_pipeline_id_idx on public.negocios using btree (pipeline_id);
create index if not exists negocios_responsavel_idx on public.negocios using btree (responsavel_id);
create index if not exists negocios_retomar_em_idx
  on public.negocios using btree (retomar_em) where (retomar_em is not null);
-- A ordenação do board e o terceiro degrau do desempate do resolver.
create index if not exists negocios_ultima_atividade_idx
  on public.negocios using btree (tenant_id, ultima_atividade_em desc);

create index if not exists atividades_negocio_idx on public.atividades using btree (negocio_id);
create index if not exists atividades_usuario_idx on public.atividades using btree (usuario_id);
-- Os três parciais abaixo existem para consultas quentes e frequentes: a
-- agenda, o cron de lembrete e a busca por evento do Google. O `where` é o que
-- os mantém pequenos — atividade concluída é a maioria da tabela e não entra.
create index if not exists atividades_agenda_negocio_idx
  on public.atividades using btree (negocio_id, data_agendada)
  where ((concluida is not true) and (data_agendada is not null));
create index if not exists atividades_agenda_usuario_idx
  on public.atividades using btree (usuario_id, data_agendada)
  where ((concluida is not true) and (data_agendada is not null));
create index if not exists atividades_lembrete_idx
  on public.atividades using btree (lembrete_data) where (lembrete_enviado = false);
create index if not exists atividades_google_evento_idx
  on public.atividades using btree (google_evento_id) where (google_evento_id is not null);

create index if not exists idx_neh_tenant on public.negocio_etapa_historico using btree (tenant_id);
create index if not exists idx_neh_negocio on public.negocio_etapa_historico using btree (negocio_id);
create index if not exists idx_neh_etapa on public.negocio_etapa_historico using btree (etapa_id);

create index if not exists propostas_tenant_idx on public.propostas using btree (tenant_id);
create index if not exists propostas_negocio_idx on public.propostas using btree (negocio_id);
create index if not exists propostas_plano_idx on public.propostas using btree (plano_id);
create index if not exists propostas_gerado_por_idx on public.propostas using btree (gerado_por);
-- O número da proposta é único por empresa: duas propostas "2026-014" no mesmo
-- tenant seriam dois contratos com o mesmo nome.
create unique index if not exists propostas_tenant_numero_uidx
  on public.propostas using btree (tenant_id, numero);

create index if not exists envelopes_tenant_idx on public.envelopes using btree (tenant_id);
create index if not exists envelopes_proposta_idx on public.envelopes using btree (proposta_id);
create index if not exists signatarios_envelope_idx on public.signatarios using btree (envelope_id);
-- A tela pública de assinatura entra por este token, sem login: é a busca mais
-- sensível a latência do sistema, feita por quem não é usuário do CRM.
create index if not exists signatarios_token_idx on public.signatarios using btree (token);

create index if not exists convites_tenant_idx on public.convites using btree (tenant_id);
create index if not exists convites_convidado_por_idx on public.convites using btree (convidado_por);
create index if not exists notificacoes_usuario_idx on public.notificacoes using btree (usuario_id, lida);
create index if not exists regras_distribuicao_tenant_idx on public.regras_distribuicao using btree (tenant_id);
create index if not exists regras_distribuicao_usuario_idx on public.regras_distribuicao using btree (usuario_id);
create index if not exists idx_solic_desc_tenant on public.solicitacoes_desconto using btree (tenant_id, status);
create index if not exists idx_solic_desc_negocio on public.solicitacoes_desconto using btree (negocio_id, status);
