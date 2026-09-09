-- ---------------------------------------------------------------------------
-- Lead que volta da nutrição para a prospecção vai para o POOL, não continua
-- na mão do vendedor.
--
-- O ESTADO ENCONTRADO, neste banco: três negócios no funil do SDR com um
-- VENDEDOR como responsável.
--
--   AGPMED                     — "Novo Lead", cadência ativa no passo 2
--   DaOca Sorvetes Artesanais  — "Nutrição / Futuro"
--   Gera Partner               — "Nutrição / Futuro"
--
-- Os três com `vendedor_origem_id` nulo, ou seja: ninguém registrou de onde
-- eles vieram, o dono é o próprio vendedor, e o funil é o do SDR.
--
-- POR QUE ISSO É ERRADO. `negocios_select` mostra um negócio a quem é dono dele
-- ou, quando não há dono, a quem opera o funil (`pipelines_do_meu_papel`). Com
-- um vendedor no `responsavel_id` de um card do funil do SDR, o card fica:
--   - fora do board do vendedor, que carrega só o funil de vendas;
--   - fora do alcance de qualquer SDR, porque tem dono e o dono não é ele.
-- Hoje isso não esconde nada de ninguém — não há usuário com papel `sdr`, e o
-- admin (que é quem opera o board de prospecção) enxerga tudo. Mas o card já
-- está fora do board de quem consta como dono, e no dia em que o primeiro SDR
-- entrar, os três somem da tela dele sem aviso.
--
-- ---------------------------------------------------------------------------
-- A CAUSA. `retomar_leads_em_nutricao()` tem dois ramos, e só um zera o dono.
--
-- O ramo do reaquecimento (lead de Vendas indo para o SDR) faz o certo:
-- `responsavel_id = null` e `vendedor_origem_id = coalesce(...)`. O outro ramo
-- — "volta para a entrada do próprio funil" — só troca `etapa_id`,
-- `probabilidade` e `retomar_em`. O comentário dele diz "lead em nutrição
-- costuma estar no pool: sem dono, não há quem notificar", e é aí que está o
-- furo: ele SUPÕE que não há dono, e não faz nada a respeito quando há.
--
-- Foi por esse caminho que o AGPMED chegou onde está — parqueado em nutrição
-- pelo vendedor, com data de retomada, e devolvido para "Novo Lead" do SDR com
-- o dono intacto e uma cadência começando. Os outros dois estão a uma data de
-- retomada de repetir o mesmo trajeto.
--
-- A REGRA NOVA, e ela é geral em vez de "se for SDR": ao aterrissar na entrada
-- de um funil, se o dono atual NÃO opera aquele funil, o card vai para o pool.
-- Escrever "if funil = sdr" resolveria estes três casos e deixaria o mesmo furo
-- para o próximo par de funis. `role_operador` já é o dado que responde
-- "quem trabalha aqui", e é ele que decide.
--
-- O dono deslocado não é esquecido: vai para `vendedor_origem_id`, que é
-- exatamente a coluna criada para isso (`20260904120000`) e que a tela do
-- negócio lê para pré-selecionar quem reassume na entrega. Só quando ele é
-- `vendedor` — a coluna se chama assim e significa isso; um dono de outro papel
-- perde o ponteiro em vez de sujar o campo com um sentido que ele não tem.
--
-- `coalesce(n.vendedor_origem_id, ...)` e não sobrescrita: se o lead JÁ tinha
-- vendedor de origem registrado, quem vale é o primeiro — é dele o
-- relacionamento mais antigo com o contato.
-- ---------------------------------------------------------------------------

create or replace function public.retomar_leads_em_nutricao()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_count int := 0;
  r record;
  v_sdr_pipeline uuid;
  v_sdr_entrada uuid;
  v_sdr_prob int;
  v_cadencia_id uuid;
  v_primeiro_atraso int;
  v_destino_sdr boolean;
  -- O dono atual não opera o funil em que o card vai aterrissar?
  v_desloca boolean;
begin
  -- O destino de reaquecimento, resolvido UMA vez fora do laço.
  select e.pipeline_id, e.id, e.probabilidade
    into v_sdr_pipeline, v_sdr_entrada, v_sdr_prob
    from public.etapas_pipeline e
    join public.pipelines p on p.id = e.pipeline_id
   where p.chave = 'sdr' and e.funcao = 'entrada'
   order by e.ordem
   limit 1;

  -- A cadência ativa do SDR e o atraso do primeiro passo. Sem cadência o lead
  -- ainda vai para o board do SDR — só não começa a tocar sozinho.
  select c.id, cp.atraso_horas
    into v_cadencia_id, v_primeiro_atraso
    from public.cadencias c
    join public.cadencia_passos cp
      on cp.cadencia_id = c.id
     and cp.ordem = (select min(cp2.ordem) from public.cadencia_passos cp2 where cp2.cadencia_id = c.id)
   where c.pipeline_id = v_sdr_pipeline
     and c.ativa
   order by (c.proposito = 'reaquecimento') desc, c.criado_em
   limit 1;

  for r in
    select n.id,
           n.tenant_id,
           n.contato_id,
           n.responsavel_id,
           n.retomar_em,
           nutricao.pipeline_id as pipeline_atual,
           entrada.id as etapa_entrada,
           entrada.probabilidade,
           coalesce(c.empresa, c.nome, n.titulo) as rotulo,
           exists (select 1 from public.propostas pr where pr.negocio_id = n.id) as tem_proposta,
           -- Os dois lados da pergunta "o dono trabalha neste funil?". Vêm da
           -- mesma linha para não haver duas leituras que possam divergir.
           dono.role as papel_do_dono,
           atual.role_operador as opera_o_funil_atual
      from public.negocios n
      join public.etapas_pipeline nutricao
        on nutricao.id = n.etapa_id and nutricao.funcao = 'nutricao'
      join public.etapas_pipeline entrada
        on entrada.pipeline_id = nutricao.pipeline_id and entrada.funcao = 'entrada'
      join public.pipelines atual
        on atual.id = nutricao.pipeline_id
      left join public.usuarios dono on dono.id = n.responsavel_id
      left join public.contatos c on c.id = n.contato_id
     where n.retomar_em is not null
       and n.retomar_em <= now()
  loop
    v_destino_sdr := false;

    if v_sdr_entrada is not null
       and r.pipeline_atual is distinct from v_sdr_pipeline
       and not r.tem_proposta
    then
      -- ── Reaquecimento pelo SDR ────────────────────────────────────────────
      -- Só `etapa_id`: `trg_negocios_pipeline` deriva o `pipeline_id` da etapa,
      -- e escrever os dois à mão criaria uma segunda verdade para divergir.
      update public.negocios
         set etapa_id = v_sdr_entrada,
             responsavel_id = null,
             vendedor_origem_id = coalesce(r.responsavel_id, vendedor_origem_id),
             probabilidade = coalesce(v_sdr_prob, 10),
             retomar_em = null,
             atualizado_em = now()
       where id = r.id;

      v_destino_sdr := true;

      if r.responsavel_id is not null then
        insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
        values (
          r.responsavel_id,
          'lead_retomado',
          'Foi para reaquecimento: ' || r.rotulo,
          'A data de retomada (' || to_char(r.retomar_em, 'DD/MM/YYYY') || ') chegou. '
            || 'O lead voltou para a prospecção do SDR'
            || case when v_cadencia_id is not null then ', já inscrito na cadência' else '' end
            || '. Quando a reunião for remarcada, ele volta para você.',
          '/negocios/' || r.id
        );
      end if;
    else
      -- ── Volta para a entrada do próprio funil ─────────────────────────────
      -- Continua valendo para o negócio com proposta (que é do vendedor) e para
      -- o lead que JÁ está no SDR — este último aterrissa no board do SDR, e por
      -- isso também entra na cadência logo abaixo.
      v_destino_sdr := r.pipeline_atual is not distinct from v_sdr_pipeline;

      -- O CONSERTO. Antes este ramo mantinha o dono em qualquer caso, e um lead
      -- parqueado por um VENDEDOR voltava para a entrada do funil do SDR ainda
      -- na mão dele: fora do board do vendedor (que carrega outro funil) e fora
      -- do alcance dos SDRs (porque tem dono). Ficava sem board.
      --
      -- O admin fica de fora, e não por deferência: a regra é "o dono consegue
      -- ver o card no board dele?", e o admin consegue — a RLS lhe dá todos os
      -- negócios e as duas páginas de board o deixam entrar. Tirar o card dele
      -- resolveria um problema que ele não tem.
      v_desloca := r.responsavel_id is not null
               and r.papel_do_dono is distinct from 'admin'
               and r.papel_do_dono is distinct from r.opera_o_funil_atual;

      update public.negocios
         set etapa_id = r.etapa_entrada,
             probabilidade = coalesce(r.probabilidade, 10),
             retomar_em = null,
             responsavel_id = case when v_desloca then null else responsavel_id end,
             -- Só vendedor entra aqui: a coluna existe para a entrega devolver
             -- ao MESMO vendedor, e um dono de outro papel não é isso.
             vendedor_origem_id = case
               when v_desloca and r.papel_do_dono = 'vendedor'
                 then coalesce(vendedor_origem_id, r.responsavel_id)
               else vendedor_origem_id
             end,
             atualizado_em = now()
       where id = r.id;

      -- Lead em nutrição costuma estar no pool: sem dono, não há quem
      -- notificar, e ele aparece para quem opera o funil pela própria coluna do
      -- board. Quando havia dono e ele foi deslocado, a notificação passa a
      -- dizer isso — antes ela avisava "voltou para o início do funil" a alguém
      -- que não ia ver o card em board nenhum.
      if r.responsavel_id is not null then
        insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
        values (
          r.responsavel_id,
          'lead_retomado',
          case when v_desloca then 'Foi para o pool: ' else 'Lead retomado: ' end || r.rotulo,
          'A data de retomada (' || to_char(r.retomar_em, 'DD/MM/YYYY') || ') chegou. '
            || case
                 when v_desloca then
                   'O lead voltou para o início do funil de prospecção, sem dono, para quem opera '
                   || 'aquele funil trabalhar'
                   || case when r.papel_do_dono = 'vendedor'
                           then '. Quando ele for entregue de novo, volta para você.'
                           else '.' end
                 else 'O lead voltou para o inicio do funil.'
               end,
          '/negocios/' || r.id
        );
      end if;
    end if;

    -- A CADÊNCIA SEGUE O DESTINO, não a origem.
    if v_destino_sdr and v_cadencia_id is not null then
      insert into public.cadencia_inscricoes
        (tenant_id, negocio_id, cadencia_id, inscrito_por, proximo_envio_em)
      values
        (r.tenant_id, r.id, v_cadencia_id, null,
         now() + make_interval(hours => coalesce(v_primeiro_atraso, 0)))
      on conflict (negocio_id, cadencia_id) do nothing;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

-- ---------------------------------------------------------------------------
-- O ESTADO QUE O BUG JÁ DEIXOU PARA TRÁS.
--
-- A função consertada só age quando a data de retomada chega. Os três cards que
-- já estão errados hoje não voltam sozinhos — este bloco os arruma, com a mesma
-- regra: dono que não opera o funil sai do `responsavel_id` e, se for vendedor,
-- fica registrado em `vendedor_origem_id`.
--
-- É um `update` com `where`, e não uma lista de ids: rodar de novo depois de
-- corrigido não muda nada, e se aparecer um quarto caso antes do deploy ele
-- entra junto em vez de ficar de fora.
--
-- Não mexe em etapa, probabilidade, cadência nem data: o card fica exatamente
-- onde está. A única coisa que muda é de quem ele é.
-- ---------------------------------------------------------------------------
do $$
declare
  v_corrigidos int;
  v_restantes int;
begin
  with alvo as (
    select n.id, n.responsavel_id, u.role as papel_do_dono
      from public.negocios n
      join public.pipelines p on p.id = n.pipeline_id
      join public.usuarios u on u.id = n.responsavel_id
     where u.role is distinct from 'admin'
       and u.role is distinct from p.role_operador
  )
  update public.negocios n
     set responsavel_id = null,
         vendedor_origem_id = case
           when a.papel_do_dono = 'vendedor'
             then coalesce(n.vendedor_origem_id, a.responsavel_id)
           else n.vendedor_origem_id
         end,
         atualizado_em = now()
    from alvo a
   where n.id = a.id;

  get diagnostics v_corrigidos = row_count;

  select count(*) into v_restantes
    from public.negocios n
    join public.pipelines p on p.id = n.pipeline_id
    join public.usuarios u on u.id = n.responsavel_id
   where u.role is distinct from 'admin'
     and u.role is distinct from p.role_operador;

  if v_restantes > 0 then
    raise exception 'Ainda restam % negocio(s) com dono que nao opera o funil.', v_restantes;
  end if;

  raise notice 'Corrigidos % negocio(s) cujo dono nao operava o funil.', v_corrigidos;
end $$;
