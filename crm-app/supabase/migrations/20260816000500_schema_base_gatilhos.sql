-- Os 9 gatilhos do schema base.
--
-- Roda por último do bloco base: gatilho exige a tabela E a função criadas.
-- Seis das oito funções aqui já estavam no repositório, em migrations
-- POSTERIORES a esta — e é por isso que este bloco todo foi datado 20260816,
-- antes do primeiro arquivo que o repositório já tinha (20260817193201). Num
-- ambiente novo a ordem é por nome de arquivo, e a migration de agosto que
-- altera `atividades` rodaria antes de `atividades` existir.
--
-- `create trigger` valida a função na CRIAÇÃO, não na execução. Por isso as
-- duas funções que faltavam (`negocio_etapa_historico_registrar` e
-- `negocios_set_fechado_em`) tiveram de ir para o arquivo de funções deste
-- mesmo bloco, e não podiam ficar para depois.
--
-- O que os gatilhos garantem, e a razão de estarem no BANCO e não na aplicação:
-- existem quatro caminhos que movem um card e três que criam uma atividade.
-- Regra que precisa valer sempre não pode depender de sete lugares lembrarem
-- dela.

drop trigger if exists trg_bloquear_dominios_concorrentes on public.contatos;
create trigger trg_bloquear_dominios_concorrentes
  before insert or update of email on public.contatos
  for each row execute function bloquear_dominios_concorrentes();

-- `pipeline_id` em `negocios` é DERIVADO da etapa, e mantido aqui em vez de
-- pela aplicação. É o que a RLS do pool lê (`pipeline_id in
-- pipelines_do_meu_papel()`), então um valor errado não daria erro: daria
-- invisibilidade silenciosa de card.
drop trigger if exists trg_negocios_pipeline on public.negocios;
create trigger trg_negocios_pipeline
  before insert or update of etapa_id on public.negocios
  for each row execute function negocios_definir_pipeline();

drop trigger if exists trg_etapas_pipeline_propagar on public.etapas_pipeline;
create trigger trg_etapas_pipeline_propagar
  after update of pipeline_id on public.etapas_pipeline
  for each row when ((new.pipeline_id is distinct from old.pipeline_id))
  execute function etapas_pipeline_propagar_pipeline();

drop trigger if exists trg_negocios_fechado_em on public.negocios;
create trigger trg_negocios_fechado_em
  before update on public.negocios
  for each row execute function negocios_set_fechado_em();

-- Dois gatilhos e não um: `after insert` grava a entrada na primeira etapa,
-- `after update` fecha a anterior e abre a nova. Separados porque o corpo
-- diferencia por `tg_op` e um `after insert or update` único obscureceria que
-- são duas regras distintas.
drop trigger if exists trg_neh_insert on public.negocios;
create trigger trg_neh_insert
  after insert on public.negocios
  for each row execute function negocio_etapa_historico_registrar();

drop trigger if exists trg_neh_update on public.negocios;
create trigger trg_neh_update
  after update on public.negocios
  for each row execute function negocio_etapa_historico_registrar();

drop trigger if exists trg_atividades_conclusao on public.atividades;
create trigger trg_atividades_conclusao
  before insert or update on public.atividades
  for each row execute function atividades_sincronizar_conclusao();

drop trigger if exists trg_atividades_tocar_negocio on public.atividades;
create trigger trg_atividades_tocar_negocio
  after insert or delete or update on public.atividades
  for each row execute function atividades_tocar_negocio();

-- A numeração da proposta é atômica e única por tenant, no banco. Gerar o
-- número na aplicação daria dois contratos "2026-014" em duas abas abertas ao
-- mesmo tempo.
drop trigger if exists trg_propostas_numero on public.propostas;
create trigger trg_propostas_numero
  before insert on public.propostas
  for each row execute function propostas_definir_numero();
