-- Nutrição de Vendas volta para o SDR reaquecer, em vez de para o vendedor.
--
-- O PROBLEMA
--
-- `retomar_leads_em_nutricao()` devolvia o card para a entrada do MESMO funil.
-- No SDR isso está certo. Em Vendas, o lead frio caía justamente em quem NÃO
-- tem ferramenta para reaquecer: a cadência existe só no funil do SDR. O
-- vendedor tinha que lembrar de retomar na mão, competindo com os negócios
-- quentes dele — e é assim que "volta em 6 meses" vira "nunca mais".
--
-- O QUE MUDA
--
-- Um negócio em nutrição de Vendas cuja data chegou passa a ir para a entrada
-- do funil do SDR, SEM DONO (pool), e é inscrito na cadência ativa do SDR.
--
-- TRÊS RECORTES, e cada um tem motivo:
--
-- 1. Só negócio SEM PROPOSTA gerada. Quem já recebeu proposta é quase-cliente,
--    não lead frio: mandá-lo para prospecção trataria um negócio de dezenas de
--    milhares como lead novo e bagunçaria a taxa de conversão dos dois funis.
--    Esse continua voltando para o vendedor, como sempre.
-- 2. Só quem NÃO está no funil do SDR. Lá a devolução para a entrada do próprio
--    funil já era o comportamento certo.
-- 3. Só se o funil do SDR tiver etapa de entrada. Sem ela não há para onde ir, e
--    o comportamento antigo vale.
--
-- QUEM ASSUME DEPOIS
--
-- `vendedor_origem_id` guarda de quem era o lead. Quando o SDR reaquecer e
-- entregar, a tela pré-seleciona esse vendedor: ele cultivou o contato, e
-- devolver para o rodízio jogaria fora esse relacionamento.
--
-- SEGURANÇA DO ENVIO
--
-- A inscrição automática não dispara mensagem sozinha: `cadencias.autonoma` é
-- `false`, então cada toque entra em `mensagens` com `aguardando_aprovacao` e
-- espera revisão humana antes de chegar ao cliente.

alter table public.negocios
  add column if not exists vendedor_origem_id uuid references public.usuarios(id) on delete set null;

comment on column public.negocios.vendedor_origem_id is
  'Vendedor que era dono do negócio antes de ele voltar da nutrição para o SDR '
  'reaquecer. Serve para a entrega devolver ao MESMO vendedor em vez de ao '
  'rodízio. Nulo em negócio que nunca passou por esse caminho.';

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
   order by c.criado_em
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
           exists (select 1 from public.propostas pr where pr.negocio_id = n.id) as tem_proposta
      from public.negocios n
      join public.etapas_pipeline nutricao
        on nutricao.id = n.etapa_id and nutricao.funcao = 'nutricao'
      join public.etapas_pipeline entrada
        on entrada.pipeline_id = nutricao.pipeline_id and entrada.funcao = 'entrada'
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

      update public.negocios
         set etapa_id = r.etapa_entrada,
             probabilidade = coalesce(r.probabilidade, 10),
             retomar_em = null,
             atualizado_em = now()
       where id = r.id;

      -- Lead em nutrição costuma estar no pool: sem dono, não há quem
      -- notificar, e ele aparece para os SDRs pela própria coluna do board.
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
    end if;

    -- A CADÊNCIA SEGUE O DESTINO, não a origem.
    --
    -- A primeira versão disto inscrevia só quem vinha de Vendas, e o teste em
    -- transação revertida mostrou o furo: um lead que o PRÓPRIO SDR tinha
    -- parqueado voltava para o board dele com zero inscrições — o mesmo
    -- esquecimento de antes, só que de outro lado da mesa. Se o card aterrissa
    -- no funil do SDR na data marcada, a cadência começa. É isso que faz a data
    -- de retomada valer alguma coisa.
    --
    -- `inscrito_por` nulo: quem inscreveu foi o sistema, não uma pessoa. O
    -- `on conflict` cobre o lead que já esteve nesta cadência antes.
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
