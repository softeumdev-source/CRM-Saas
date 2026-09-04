-- Lead que sai da carteira de um vendedor para a prospecção volta para ELE.
--
-- O botao "Enviar para prospeccao" passa a existir tambem na lista de leads que
-- ja tem vendedor. Isso abre um caminho que antes nao existia: um contato com
-- dono, mas sem negocio nenhum -- exatamente o que sobra depois de distribuir
-- uma planilha e ninguem abrir card.
--
-- O QUE FALTAVA, E QUE SO APARECE NESSE CAMINHO
--
-- O card da prospeccao nasce SEM dono, no pool do SDR: e assim que a
-- prospeccao funciona, e nao muda. Mas quando o SDR qualifica o lead e clica em
-- "Entregar ao vendedor", a tela precisa saber para quem devolver. Sem isso, um
-- lead que era da carteira de alguem voltaria para o rodizio e cairia com outra
-- pessoa -- jogando fora o relacionamento que o primeiro vendedor ja tinha.
--
-- A coluna que resolve isso ja existe e ja e lida: `vendedor_origem_id` foi
-- criada para a nutricao (`20260904120000`) e `NegocioDetailClient` a usa para
-- pre-selecionar quem assume na entrega. Aqui ela passa a ser preenchida
-- tambem quando o lead vem de uma carteira.
--
-- O `coalesce` sobre `ct.responsavel_id` faz o certo nos dois casos: lead do
-- pool (sem dono) continua com a coluna nula e cai no rodizio na entrega, que e
-- o comportamento de hoje.

create or replace function public.enviar_para_prospeccao(p_contato_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant uuid;
  v_pipeline uuid;
  v_etapa uuid;
  v_prob int;
  v_cadencia uuid;
  v_atraso int;
  v_criados int := 0;
  v_pulados int := 0;
  v_sem_email int := 0;
  v_negocio uuid;
  r record;
begin
  if public.usuario_role() <> 'admin' then
    raise exception 'apenas administradores podem enviar leads para prospeccao';
  end if;

  v_tenant := public.usuario_tenant_id();

  select e.pipeline_id, e.id, e.probabilidade
    into v_pipeline, v_etapa, v_prob
    from public.etapas_pipeline e
    join public.pipelines p on p.id = e.pipeline_id
   where p.chave = 'sdr' and p.tenant_id = v_tenant and e.funcao = 'entrada'
   order by e.ordem
   limit 1;

  if v_etapa is null then
    raise exception 'o funil de prospeccao nao tem etapa de entrada';
  end if;

  -- PRIMEIRO CONTATO, e nao reaquecimento: este lead nunca falou com ninguem.
  -- E o espelho da escolha em `retomar_leads_em_nutricao()`, que prefere a de
  -- reaquecimento. Mesmo motivo para ser `order by` e nao `where`: sem a de
  -- primeiro contato, cai em qualquer ativa em vez de nao inscrever ninguem.
  select c.id, cp.atraso_horas
    into v_cadencia, v_atraso
    from public.cadencias c
    join public.cadencia_passos cp
      on cp.cadencia_id = c.id
     and cp.ordem = (select min(cp2.ordem) from public.cadencia_passos cp2 where cp2.cadencia_id = c.id)
   where c.pipeline_id = v_pipeline
     and c.ativa
   order by (c.proposito = 'primeiro_contato') desc, c.criado_em
   limit 1;

  for r in
    select ct.id, ct.nome, ct.empresa, ct.email, ct.responsavel_id
      from public.contatos ct
     where ct.id = any(p_contato_ids)
       and ct.tenant_id = v_tenant
  loop
    -- Ja tem negocio aberto? Nao cria um segundo. Sem esta guarda, clicar duas
    -- vezes no botao duplicaria o card e o cliente receberia a cadencia em
    -- dobro -- o pior desfecho possivel de um erro de clique. E um lead que ja
    -- esta em "Demonstracao Agendada" receberia do SDR o e-mail de primeiro
    -- contato, para alguem que um vendedor ja esta atendendo.
    if exists (
      select 1 from public.negocios n
       where n.contato_id = r.id and n.fechado_em is null
    ) then
      v_pulados := v_pulados + 1;
      continue;
    end if;

    insert into public.negocios (
      tenant_id, contato_id, titulo, etapa_id, responsavel_id, probabilidade, vendedor_origem_id
    )
    values (
      v_tenant,
      r.id,
      coalesce(nullif(trim(r.empresa), ''), nullif(trim(r.nome), ''), 'Lead importado'),
      v_etapa,
      -- Sem dono: o card cai no pool do funil do SDR, que e como a prospeccao
      -- funciona. `negocios_select` ja recorta o pool por papel.
      null,
      coalesce(v_prob, 10),
      -- De QUEM era o lead. Nulo quando veio do pool -- ai a entrega cai no
      -- rodizio, como sempre foi. Preenchido quando o lead saiu da carteira de
      -- alguem, e e o que faz a tela de entrega pre-selecionar essa pessoa.
      r.responsavel_id
    )
    returning id into v_negocio;

    v_criados := v_criados + 1;

    -- O CARD SEMPRE NASCE; a inscricao depende de haver para onde escrever.
    --
    -- O primeiro toque da cadencia e e-mail. Um contato sem e-mail geraria uma
    -- mensagem sem destino, que ia falhar no despachante e pintar de vermelho
    -- um lead que nunca teve chance. Melhor o card existir no board sem
    -- cadencia -- alguem completa o cadastro e inscreve -- do que nao existir.
    if r.email is null or trim(r.email) = '' then
      v_sem_email := v_sem_email + 1;
    elsif v_cadencia is not null then
      insert into public.cadencia_inscricoes
        (tenant_id, negocio_id, cadencia_id, inscrito_por, proximo_envio_em)
      values
        (v_tenant, v_negocio, v_cadencia, auth.uid(),
         now() + make_interval(hours => coalesce(v_atraso, 0)))
      on conflict (negocio_id, cadencia_id) do nothing;
    end if;
  end loop;

  -- Devolve o que aconteceu de VERDADE, para a tela poder contar em vez de
  -- dizer "pronto!": quantos entraram, quantos ja tinham negocio, e quantos
  -- ficaram fora da cadencia por falta de e-mail.
  return jsonb_build_object(
    'criados', v_criados,
    'pulados', v_pulados,
    'sem_email', v_sem_email,
    'inscritos', greatest(v_criados - v_sem_email, 0),
    'tem_cadencia', v_cadencia is not null
  );
end;
$function$;
