-- ---------------------------------------------------------------------------
-- `negocios.ganho` passa a seguir a etapa, sempre.
--
-- O SINTOMA, relatado e conferido: o cabeçalho do funil de Vendas mostrava
-- "5 sem próximo passo" e três desses cinco estavam parados na coluna
-- "Perdido". Os outros dois — Condor Ind e Diwibom, em "Validação de
-- Aderência" — eram os únicos casos reais.
--
-- ---------------------------------------------------------------------------
-- A CAUSA: DOIS DONOS DA MESMA VERDADE.
--
-- "Este negócio está fechado?" tinha duas respostas no sistema:
--
--   etapas_pipeline.resultado   -- a COLUNA onde o card está desenhado
--   negocios.ganho              -- uma coluna do próprio negócio
--
-- O board desenha o card pela primeira. O cabeçalho, o painel de métricas, a
-- aba de vendedores e o selo "Ganho/Perdido" da tela do negócio leem a
-- segunda. Enquanto as duas concordam ninguém percebe que são duas.
--
-- Elas já não concordavam. Três negócios de 06/08 estavam em "Perdido" com
-- `ganho` NULO — dois deles nasceram direto ali, e nenhum tem atividade de
-- mudança de etapa, então entraram antes de o caminho atual existir:
--
--   Duas Rodas          Proposta Enviada -> Perdido    ganho=null
--   Mondelez Brasil     (criado em Perdido)            ganho=null
--   Zezé Biscoitos      (criado em Perdido)            ganho=null
--
-- Para a tela eles estavam perdidos; para a conta, abertos.
--
-- ---------------------------------------------------------------------------
-- POR QUE O CONSERTO É NO BANCO, E NÃO NA TELA.
--
-- Dava para trocar `n.ganho` por `resultadoDaEtapa(n.etapa)` no cabeçalho do
-- Kanban e o número relatado ficaria certo. Só que `ganho` é lido em pelo
-- menos quatro outros lugares — `metricas.ts` (o painel), `DesempenhoTab`,
-- `VendedoresTab` e o selo da tela do negócio. Consertar o lugar reclamado
-- deixaria os outros quatro errados do mesmo jeito, com o mesmo dado.
--
-- Então `ganho` para de ser um segundo dono da verdade e vira o que já era na
-- prática: um espelho da etapa. Todo caminho que move o card — `moverEtapa`,
-- `fecharNegocio`, `transferir_negocio_de_funil`,
-- `cadencia_esgotada_marca_perdido` — JÁ escrevia os dois juntos. O gatilho
-- não muda o comportamento de nenhum deles; ele garante o que os quatro já
-- faziam por combinação, e que qualquer caminho futuro passaria a fazer sem
-- precisar lembrar.
--
-- ---------------------------------------------------------------------------
-- O GATILHO TAMBÉM CORRIGE ESCRITA DIRETA EM `ganho`, e isso é de propósito.
--
-- A condição não é só "a etapa mudou": é "a etapa mudou OU alguém mexeu em
-- `ganho`". Um `update` que marcasse o negócio como ganho deixando o card em
-- "Proposta Enviada" recriaria exatamente a divergência que esta migration
-- fecha. Com o gatilho, `ganho` volta a valer o que a coluna do board diz.
--
-- Nenhum caminho do app faz isso hoje: os dois que fecham negócio
-- (`fecharNegocio` e `encerrarNegocio`) procuram a etapa de fechamento ANTES
-- de escrever e recusam a operação se o funil não tiver uma. Conferido nos
-- dois arquivos.
--
-- ---------------------------------------------------------------------------
-- O NOME DO GATILHO É PARTE DA CORREÇÃO.
--
-- `trg_negocios_fechado_em` já existe, é BEFORE, e reage a `ganho` mudando
-- para gravar `fechado_em`. Gatilhos BEFORE na mesma tabela correm em ordem
-- ALFABÉTICA, então este precisa vir antes dele para que ele enxergue o
-- `ganho` novo — daí `..._etapa_define_ganho` e não `..._ganho_segue_etapa`:
-- 'e' < 'f'. Com o nome errado, `fechado_em` ficaria um passo atrasado e o
-- painel de métricas (que filtra por `fechado_em` dentro do período) perderia
-- o negócio.
-- ---------------------------------------------------------------------------

create or replace function public.negocios_etapa_define_ganho()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_resultado text;
begin
  -- Negócio sem etapa não tem de onde deduzir. Mesma postura de
  -- `negocios_definir_pipeline`, que também devolve o registro intacto.
  if new.etapa_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.etapa_id is not distinct from old.etapa_id
     and new.ganho is not distinct from old.ganho then
    return new;
  end if;

  select e.resultado into v_resultado
    from public.etapas_pipeline e
   where e.id = new.etapa_id;

  -- Etapa inexistente: a FK impede, mas se acontecer é melhor não escrever
  -- nada do que apagar um `ganho` correto por causa de um `select` vazio.
  if not found then
    return new;
  end if;

  new.ganho := case v_resultado
    when 'ganho'   then true
    when 'perdido' then false
    else null
  end;

  return new;
end;
$function$;

comment on function public.negocios_etapa_define_ganho() is
  'Mantem `negocios.ganho` colado em `etapas_pipeline.resultado` da etapa '
  'atual. Existe porque as duas colunas respondiam "este negocio esta '
  'fechado?" e ja tinham divergido: 3 negocios em "Perdido" com ganho nulo, '
  'contados como pipeline aberto pelo cabecalho e pelo painel de metricas.';

drop trigger if exists trg_negocios_etapa_define_ganho on public.negocios;
create trigger trg_negocios_etapa_define_ganho
  before insert or update on public.negocios
  for each row
  execute function public.negocios_etapa_define_ganho();

-- Funcao de gatilho nao e RPC — mesmo motivo das migrations
-- `revoga_execute_das_funcoes_de_trigger` e `gatilho_nao_e_rpc_publica`.
revoke all on function public.negocios_etapa_define_ganho() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O PASSIVO. O gatilho vale para a proxima escrita; estes tres estao parados.
--
-- `where` em vez da lista de ids: idempotente, e pega qualquer caso que
-- apareca entre esta migration e o deploy.
--
-- `fechado_em` sai de brinde: o `update` mexe em `ganho`, entao
-- `trg_negocios_fechado_em` dispara e carimba a data que faltava nos tres.
-- ---------------------------------------------------------------------------
do $$
declare
  v_corrigidos int;
  v_restam int;
begin
  update public.negocios n
     set ganho = case e.resultado when 'ganho' then true when 'perdido' then false else null end
    from public.etapas_pipeline e
   where e.id = n.etapa_id
     and n.ganho is distinct from
         (case e.resultado when 'ganho' then true when 'perdido' then false else null end);
  get diagnostics v_corrigidos = row_count;

  select count(*) into v_restam
    from public.negocios n
    join public.etapas_pipeline e on e.id = n.etapa_id
   where n.ganho is distinct from
         (case e.resultado when 'ganho' then true when 'perdido' then false else null end);

  if v_restam > 0 then
    raise exception 'Sobraram % negocios com ganho divergente da etapa.', v_restam;
  end if;

  raise notice 'Negocios com ganho corrigido: %.', v_corrigidos;
end $$;
