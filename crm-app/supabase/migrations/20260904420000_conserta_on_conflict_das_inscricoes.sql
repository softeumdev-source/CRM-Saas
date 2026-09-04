-- Conserta duas funcoes que EU quebrei hoje ao trocar a trava das inscricoes.
--
-- O QUE ACONTECEU
--
-- A migracao `20260904380000_a_cadencia_entra_sozinha.sql` trocou
--
--     UNIQUE (negocio_id, cadencia_id)
--
-- por um indice unico PARCIAL:
--
--     create unique index cadencia_inscricoes_uma_viva
--       on public.cadencia_inscricoes (negocio_id, cadencia_id)
--       where status in ('ativa', 'pausada');
--
-- A troca em si esta certa: repetir uma sequencia ja encerrada e legitimo, duas
-- correndo ao mesmo tempo e que seria mensagem em dobro. O que eu nao vi e que
-- DUAS funcoes ja existentes gravavam inscricao com
--
--     on conflict (negocio_id, cadencia_id) do nothing
--
-- e o Postgres so aceita esse alvo se existir um indice unico TOTAL com essas
-- colunas. Com um indice parcial, a mesma linha passa a ser
--
--     42P10: there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
--
-- Isso nao e aviso: e excecao, e derruba a funcao inteira.
--
-- O ESTRAGO, MEDIDO
--
--   public.enviar_para_prospeccao(uuid[])  -- o botao "Enviar para prospeccao"
--     do painel de admin. Reproduzido em transacao revertida com um contato
--     novo: 42P10. O botao estava QUEBRADO em producao desde as ~22:15.
--
--   public.retomar_leads_em_nutricao()     -- o job que devolve o lead
--     adormecido quando a data de retomada chega. Nao dava erro hoje so porque
--     nenhum lead venceu ainda; o `insert` mora dentro do loop. No primeiro
--     lead vencido a funcao inteira levantaria e NENHUM lead seria retomado.
--
-- A CORRECAO
--
-- `on conflict do nothing` SEM alvo. Ele cobre qualquer restricao violada,
-- inclusive a parcial, e continua sendo exatamente o que as duas funcoes
-- querem dizer: "se ja existe, deixa quieto". As duas inserem com o status
-- padrao 'ativa', entao a unica colisao possivel e com uma inscricao VIVA da
-- mesma cadencia -- que e precisamente o que a trava nova protege.
--
-- A reescrita e por substituicao no corpo vindo de `pg_get_functiondef`, e nao
-- copiando as duas funcoes inteiras para ca: sao ~90 linhas cada, e transcrever
-- a mao para trocar uma clausula e um jeito caro de introduzir um erro novo. O
-- bloco recusa a migracao se nao encontrar o que esperava trocar.

do $conserto$
declare
  f record;
  v_trocadas int := 0;
  v_novo text;
begin
  for f in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.prosrc ilike '%on conflict (negocio_id, cadencia_id)%'
  loop
    v_novo := replace(
      f.def,
      'on conflict (negocio_id, cadencia_id) do nothing',
      'on conflict do nothing'
    );

    if v_novo = f.def then
      raise exception
        'A funcao %() casou na busca mas o texto do ON CONFLICT nao bateu para troca. '
        'Confira a formatacao antes de seguir.', f.proname;
    end if;

    execute v_novo;
    v_trocadas := v_trocadas + 1;
    raise notice 'ON CONFLICT corrigido em %()', f.proname;
  end loop;

  -- Zero e suspeito nos dois sentidos: ou a migracao ja rodou, ou a busca
  -- parou de achar o que deveria. Numa base nova as duas funcoes existem
  -- quando este arquivo roda, entao zero aqui merece o aviso.
  if v_trocadas = 0 then
    raise notice 'Nenhuma funcao com ON CONFLICT (negocio_id, cadencia_id) -- nada a fazer.';
  end if;
end
$conserto$;
