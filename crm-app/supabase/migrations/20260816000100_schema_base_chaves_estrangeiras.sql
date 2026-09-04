-- As 34 chaves estrangeiras do schema base.
--
-- Ficam separadas da criação das tabelas por um motivo estrutural, não
-- estético: `tenants.caixa_email_usuario_id` aponta para `usuarios`, e
-- `usuarios.tenant_id` aponta para `tenants`. É um CICLO — não existe ordem de
-- criação que resolva isso com a FK embutida na tabela. Com todas as FKs
-- separadas, a ordem deixa de importar para qualquer par.
--
-- **O `on delete` de cada uma é decisão de produto, não default.** Três
-- comportamentos aparecem aqui e valem ler antes de mexer:
--
-- - `cascade` — o filho não faz sentido sem o pai. Apagar um negócio apaga as
--   atividades dele.
-- - `set null` — o filho sobrevive ao pai. Desligar um vendedor NÃO apaga os
--   negócios dele; deixa-os sem dono, no pool, que é exatamente o caso que a
--   RLS do funil do SDR trata.
-- - sem cláusula (`no action`) — apagar o pai é RECUSADO. É o caso de
--   `negocios.etapa_id`: apagar uma etapa que ainda tem card teria que falhar,
--   e não mover cards em silêncio.
--
-- `negocio_etapa_historico.etapa_id` é `set null` de propósito, e é a razão de
-- a migration do funil do SDR ter uma guarda explícita: apagar uma etapa
-- destruiria o histórico sem erro nenhum.

do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      -- raiz e pessoas
      ('usuarios_id_fkey',
       'alter table public.usuarios add constraint usuarios_id_fkey foreign key (id) references auth.users(id) on delete cascade'),
      ('usuarios_tenant_id_fkey',
       'alter table public.usuarios add constraint usuarios_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('tenants_caixa_email_usuario_id_fkey',
       'alter table public.tenants add constraint tenants_caixa_email_usuario_id_fkey foreign key (caixa_email_usuario_id) references public.usuarios(id) on delete set null'),
      ('planos_tenant_id_fkey',
       'alter table public.planos add constraint planos_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('etapas_pipeline_tenant_id_fkey',
       'alter table public.etapas_pipeline add constraint etapas_pipeline_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('etapas_pipeline_pipeline_id_fkey',
       'alter table public.etapas_pipeline add constraint etapas_pipeline_pipeline_id_fkey foreign key (pipeline_id) references public.pipelines(id) on delete cascade'),

      -- funil
      ('contatos_tenant_id_fkey',
       'alter table public.contatos add constraint contatos_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('contatos_responsavel_id_fkey',
       'alter table public.contatos add constraint contatos_responsavel_id_fkey foreign key (responsavel_id) references public.usuarios(id) on delete set null'),
      ('negocios_tenant_id_fkey',
       'alter table public.negocios add constraint negocios_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('negocios_contato_id_fkey',
       'alter table public.negocios add constraint negocios_contato_id_fkey foreign key (contato_id) references public.contatos(id) on delete cascade'),
      -- Sem `on delete`: apagar uma etapa que ainda tem card é RECUSADO.
      ('negocios_etapa_id_fkey',
       'alter table public.negocios add constraint negocios_etapa_id_fkey foreign key (etapa_id) references public.etapas_pipeline(id)'),
      ('negocios_pipeline_id_fkey',
       'alter table public.negocios add constraint negocios_pipeline_id_fkey foreign key (pipeline_id) references public.pipelines(id) on delete set null'),
      -- `set null`: desligar o vendedor devolve o negócio ao pool, não o apaga.
      ('negocios_responsavel_id_fkey',
       'alter table public.negocios add constraint negocios_responsavel_id_fkey foreign key (responsavel_id) references public.usuarios(id) on delete set null'),
      ('atividades_negocio_id_fkey',
       'alter table public.atividades add constraint atividades_negocio_id_fkey foreign key (negocio_id) references public.negocios(id) on delete cascade'),
      ('atividades_usuario_id_fkey',
       'alter table public.atividades add constraint atividades_usuario_id_fkey foreign key (usuario_id) references public.usuarios(id) on delete set null'),
      ('negocio_etapa_historico_negocio_id_fkey',
       'alter table public.negocio_etapa_historico add constraint negocio_etapa_historico_negocio_id_fkey foreign key (negocio_id) references public.negocios(id) on delete cascade'),
      -- `set null` — ver a nota no cabeçalho: apagar etapa apagaria histórico.
      ('negocio_etapa_historico_etapa_id_fkey',
       'alter table public.negocio_etapa_historico add constraint negocio_etapa_historico_etapa_id_fkey foreign key (etapa_id) references public.etapas_pipeline(id) on delete set null'),

      -- proposta, envelope, assinatura
      ('propostas_tenant_id_fkey',
       'alter table public.propostas add constraint propostas_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('propostas_negocio_id_fkey',
       'alter table public.propostas add constraint propostas_negocio_id_fkey foreign key (negocio_id) references public.negocios(id) on delete cascade'),
      ('propostas_plano_id_fkey',
       'alter table public.propostas add constraint propostas_plano_id_fkey foreign key (plano_id) references public.planos(id)'),
      ('propostas_gerado_por_fkey',
       'alter table public.propostas add constraint propostas_gerado_por_fkey foreign key (gerado_por) references public.usuarios(id)'),
      ('envelopes_tenant_id_fkey',
       'alter table public.envelopes add constraint envelopes_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('envelopes_proposta_id_fkey',
       'alter table public.envelopes add constraint envelopes_proposta_id_fkey foreign key (proposta_id) references public.propostas(id) on delete cascade'),
      ('signatarios_envelope_id_fkey',
       'alter table public.signatarios add constraint signatarios_envelope_id_fkey foreign key (envelope_id) references public.envelopes(id) on delete cascade'),

      -- operação
      ('convites_tenant_id_fkey',
       'alter table public.convites add constraint convites_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('convites_convidado_por_fkey',
       'alter table public.convites add constraint convites_convidado_por_fkey foreign key (convidado_por) references public.usuarios(id)'),
      ('notificacoes_usuario_id_fkey',
       'alter table public.notificacoes add constraint notificacoes_usuario_id_fkey foreign key (usuario_id) references public.usuarios(id) on delete cascade'),
      ('regras_distribuicao_tenant_id_fkey',
       'alter table public.regras_distribuicao add constraint regras_distribuicao_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('regras_distribuicao_usuario_id_fkey',
       'alter table public.regras_distribuicao add constraint regras_distribuicao_usuario_id_fkey foreign key (usuario_id) references public.usuarios(id) on delete cascade'),
      ('solicitacoes_desconto_tenant_id_fkey',
       'alter table public.solicitacoes_desconto add constraint solicitacoes_desconto_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade'),
      ('solicitacoes_desconto_negocio_id_fkey',
       'alter table public.solicitacoes_desconto add constraint solicitacoes_desconto_negocio_id_fkey foreign key (negocio_id) references public.negocios(id) on delete cascade'),
      ('solicitacoes_desconto_plano_id_fkey',
       'alter table public.solicitacoes_desconto add constraint solicitacoes_desconto_plano_id_fkey foreign key (plano_id) references public.planos(id) on delete set null'),
      ('solicitacoes_desconto_vendedor_id_fkey',
       'alter table public.solicitacoes_desconto add constraint solicitacoes_desconto_vendedor_id_fkey foreign key (vendedor_id) references public.usuarios(id) on delete set null'),
      ('solicitacoes_desconto_decidido_por_fkey',
       'alter table public.solicitacoes_desconto add constraint solicitacoes_desconto_decidido_por_fkey foreign key (decidido_por) references public.usuarios(id) on delete set null')
    ) as t(nome, ddl)
  loop
    -- `add constraint` não tem `if not exists`. Sem esta guarda, a migration
    -- explodiria contra o banco atual, que é justamente onde ela precisa ser
    -- um no-op perfeito.
    if not exists (
      select 1 from pg_constraint
       where conname = fk.nome and connamespace = 'public'::regnamespace
    ) then
      execute fk.ddl;
    end if;
  end loop;
end $$;
