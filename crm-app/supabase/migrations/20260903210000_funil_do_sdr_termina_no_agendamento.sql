-- O funil do SDR terminava onde o do VENDEDOR termina.
--
-- A migration 20260903170000 igualou as etapas dos dois funis para o handoff
-- poder casar por `ordem` — e, de tabela, deu ao SDR "Proposta Enviada",
-- "Negociação / Contrato" e "Fechado (Ganho)". São três colunas DEPOIS da
-- etapa de entrega (ordem 3). O trabalho do SDR acaba quando a reunião é
-- marcada e o card passa para o vendedor: um lead de SDR que chegue nessas
-- colunas só chegou por engano.
--
-- Um efeito colateral cai junto: `resultado = 'ganho'` existindo no funil do
-- SDR fazia o botão "Ganhei" aparecer na tela do lead (`podeFechar.ganho` em
-- NegocioDetailClient), contra o comentário logo acima dele dizendo que
-- entregar um lead não é vender.
--
-- A etapa de entrega FICA na ordem 3. É o que mantém `destinoDaEntrega`
-- casando com "Demonstração Agendada" do vendedor, e a devolução de no-show
-- (`funcao = 'retorno'`) caindo em "Qualificação".

do $$
declare
  f            record;
  v_entrega    uuid;
  v_removidas  uuid[];
  v_historico  int;
  v_movidos    int;
begin
  -- Um laço, e não um `select into`, porque `pipelines` é por tenant: com dois
  -- tenants o `select into` levantaria "query returned more than one row" e a
  -- migration falharia no primeiro cliente novo.
  for f in select id, tenant_id from pipelines where chave = 'sdr' loop
    select array_agg(id) into v_removidas
      from etapas_pipeline
     where pipeline_id = f.id and ordem in (4, 5, 6);

    if v_removidas is null then
      raise notice 'Funil de SDR % já termina no agendamento.', f.id;
      continue;
    end if;

    select id into v_entrega
      from etapas_pipeline
     where pipeline_id = f.id and ordem = 3;

    if v_entrega is null then
      raise exception
        'Funil de SDR % sem etapa na ordem 3: não há para onde mover o que estiver nas etapas removidas.', f.id;
    end if;

    -- Nenhum negócio pode ser perdido: quem estiver numa etapa que vai sumir
    -- volta para a de entrega. A FK de `negocios.etapa_id` é NO ACTION, então
    -- sem isto o DELETE abaixo falharia — mas falhar num deploy é pior do que
    -- mover o card uma coluna para trás.
    update negocios
       set etapa_id = v_entrega, atualizado_em = now()
     where etapa_id = any(v_removidas);
    get diagnostics v_movidos = row_count;
    if v_movidos > 0 then
      raise notice 'Funil de SDR %: % negócio(s) movidos para a etapa de entrega.', f.id, v_movidos;
    end if;

    -- `negocio_etapa_historico.etapa_id` é ON DELETE SET NULL: o DELETE não
    -- falharia, ele apagaria a etapa das linhas de histórico EM SILÊNCIO. E a
    -- tabela não guarda o nome da etapa (id, tenant_id, negocio_id, etapa_id,
    -- entrou_em, saiu_em), então a linha viraria lixo irrecuperável. Havendo
    -- uma linha sequer, esta migration para e alguém decide o que fazer.
    select count(*) into v_historico
      from negocio_etapa_historico where etapa_id = any(v_removidas);

    if v_historico > 0 then
      raise exception
        'Funil de SDR %: % linha(s) de negocio_etapa_historico apontam para etapas que seriam removidas. Removê-las apagaria esse histórico (ON DELETE SET NULL).',
        f.id, v_historico;
    end if;

    delete from etapas_pipeline where id = any(v_removidas);

    -- Perdido 7 -> 4, Nutrição 8 -> 5. Não há unique em (pipeline_id, ordem),
    -- então a ordem dos updates não importa; o que importa é o funil ficar sem
    -- buraco, porque `destinoDaEntrega` casa por ordem.
    update etapas_pipeline
       set ordem = ordem - 3
     where pipeline_id = f.id and ordem in (7, 8);
  end loop;
end $$;
