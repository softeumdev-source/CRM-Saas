-- ---------------------------------------------------------------------------
-- A cadência anda quando o toque SAI, e não quando ele é escrito.
--
-- O SINTOMA, relatado: "tem cliente que tá indo já no segundo e-mail da
-- cadência em vez do primeiro". Conferido, e é literal — seis leads estão no
-- passo 3 ("Prospecção 2 — o formato não importa") com os passos 1 e 2
-- `cancelada`, nunca enviados. Dois já receberam esse e-mail:
--
--   Sarandi Alimentos (Motrisa)   1:cancelada  2:cancelada  3:enviada 10/09
--   Cliente Não Informado         1:cancelada  2:cancelada  3:enviada 09/09
--
-- ---------------------------------------------------------------------------
-- A CAUSA: `passo_atual` conta mensagem ESCRITA, não mensagem ENVIADA.
--
-- `processar_cadencias` avançava o ponteiro no momento em que INSERIA a
-- mensagem na fila:
--
--     update cadencia_inscricoes set passo_atual = v_passo.ordem, ...
--
-- Com `cadencias.autonoma = false` todo toque nasce em 'aguardando_aprovacao'
-- e espera um clique. Escrever e enviar são momentos diferentes — às vezes
-- separados por dias, às vezes por nunca.
--
-- Aí veio o desligamento em massa (migration 20260909220000): 171 inscrições
-- viraram 'pausada' e 340 toques na fila viraram 'cancelada'. O que NÃO foi
-- rebobinado foi o ponteiro. Cada uma dessas inscrições ficou assim:
--
--     passo_atual = 2      (dois toques ESCRITOS)
--     enviados    = 0      (nenhum toque ENTREGUE)
--
-- Medido agora, antes de mexer:
--
--     status      inscrições   com o ponteiro adiantado
--     pausada        165            165  (todas, exatamente 2 passos à frente)
--     ativa           43             10
--
-- As 165 pausadas são uma bomba-relógio: no instante em que forem religadas,
-- `passo_atual + 1` dá 3 e o lead recebe o SEGUNDO e-mail como primeiro
-- contato. Foi o que aconteceu com os seis — alguém religou.
--
-- ---------------------------------------------------------------------------
-- A REGRA NOVA, em uma frase: um passo só é consumido por um envio.
--
--   toque ENVIADO         → `passo_atual` avança e o relógio do próximo começa
--                           em `enviada_em` (não em "agora").
--
--   toque MORTO na fila, com a inscrição ainda 'ativa'
--                         → alguém cancelou ESTE toque, ou ele falhou depois
--                           das cinco tentativas. É um "pula este": o passo se
--                           consome e a cadência segue. Sem isto a inscrição
--                           ficaria presa num passo que nunca mais sairia.
--
--   toque MORTO na fila, com a inscrição PARADA
--                         → a cadência inteira foi desligada e os toques
--                           caíram junto. O passo NÃO se consome. A chave de
--                           idempotência é liberada para 'cancelado:<id>', de
--                           modo que religar a cadência REESCREVA a mensagem 1.
--
-- Essa última linha é o conserto do pedido. Sem liberar a chave, o
-- `on conflict (idempotency_key) do nothing` impediria para sempre que o passo
-- 1 fosse gerado de novo — rebobinar o ponteiro sozinho travaria a cadência em
-- vez de consertá-la.
--
-- ---------------------------------------------------------------------------
-- UMA FUNÇÃO DE GATILHO, E NÃO DUAS.
--
-- `toque_enviado_reagenda_proximo` já existia e só olhava 'enviada'. Ela é
-- substituída em vez de ganhar uma irmã: "o ponteiro da cadência segue o que
-- de fato aconteceu com o toque" é UM assunto, e dois gatilhos sobre a mesma
-- tabela e o mesmo evento disputando `cadencia_inscricoes` seria a próxima
-- coisa impossível de depurar.
--
-- ---------------------------------------------------------------------------
-- ORDEM DESTA MIGRATION, que não é arbitrária:
--
--   1. derruba o gatilho antigo;
--   2. conserta os dados COM OS GATILHOS FORA DO CAMINHO — senão cancelar um
--      rascunho errado dispararia a regra nova e avançaria o ponteiro que a
--      gente está tentando rebobinar;
--   3. só então cria a função e o gatilho novos;
--   4. e por último troca `processar_cadencias`.
-- ---------------------------------------------------------------------------

drop trigger if exists trg_toque_enviado_reagenda on public.mensagens;

-- ---------------------------------------------------------------------------
-- PASSO 2: O PASSIVO.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rascunhos int;
  v_chaves int;
  v_ponteiros int;
  v_restam int;
begin
  -- 2a. Os rascunhos gerados no passo errado. Quatro dos seis leads têm o
  -- e-mail 3 ainda parado na fila, nunca enviado — cancelar agora impede que
  -- alguém clique "enviar" antes do deploy e repita o defeito.
  update public.mensagens m
     set status = 'cancelada',
         ultimo_erro = 'Cancelada: gerada no passo errado, antes do primeiro toque sair.'
    from public.cadencia_inscricoes ci
    join public.cadencia_passos cp on cp.cadencia_id = ci.cadencia_id
   where m.inscricao_id = ci.id
     and m.passo_id = cp.id
     and m.status = 'aguardando_aprovacao'
     and cp.ordem > 1
     and not exists (
       select 1 from public.mensagens ant
        where ant.inscricao_id = ci.id and ant.status = 'enviada'
     );
  get diagnostics v_rascunhos = row_count;

  -- 2b. Libera a chave de todo toque de cadência que morreu sem sair. Sem
  -- isto o passo fica bloqueado para sempre pelo índice de idempotência.
  update public.mensagens
     set idempotency_key = 'cancelado:' || id::text
   where inscricao_id is not null
     and status = 'cancelada'
     and enviada_em is null
     and coalesce(idempotency_key, '') not like 'cancelado:%';
  get diagnostics v_chaves = row_count;

  -- 2c. Rebobina o ponteiro para o último passo REALMENTE ENVIADO.
  --
  -- Regra única, sem exceção: `passo_atual` = maior `ordem` entre os toques
  -- com status 'enviada' (0 se nenhum saiu). Quem nunca recebeu nada volta ao
  -- começo e recebe a mensagem 1; quem já recebeu o e-mail 3 fica no 3 e segue
  -- para o 4 — mandar a apresentação DEPOIS dele seria trocar um defeito por
  -- outro.
  with enviado as (
    select ci.id,
           coalesce(max(cp.ordem) filter (where m.status = 'enviada'), 0) as ultimo
      from public.cadencia_inscricoes ci
      left join public.mensagens m on m.inscricao_id = ci.id
      left join public.cadencia_passos cp on cp.id = m.passo_id
     group by ci.id
  )
  update public.cadencia_inscricoes ci
     set passo_atual = e.ultimo
    from enviado e
   where e.id = ci.id
     and ci.passo_atual is distinct from e.ultimo;
  get diagnostics v_ponteiros = row_count;

  with enviado as (
    select ci.id, ci.passo_atual,
           coalesce(max(cp.ordem) filter (where m.status = 'enviada'), 0) as ultimo
      from public.cadencia_inscricoes ci
      left join public.mensagens m on m.inscricao_id = ci.id
      left join public.cadencia_passos cp on cp.id = m.passo_id
     group by ci.id, ci.passo_atual
  )
  select count(*) into v_restam from enviado where passo_atual <> ultimo;

  if v_restam > 0 then
    raise exception 'Sobraram % inscricoes com o ponteiro fora do que foi enviado.', v_restam;
  end if;

  raise notice 'Rascunhos cancelados: %. Chaves liberadas: %. Ponteiros rebobinados: %.',
    v_rascunhos, v_chaves, v_ponteiros;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 3: O GATILHO NOVO.
-- ---------------------------------------------------------------------------

create or replace function public.toque_mudou_de_estado_move_a_cadencia()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_insc record;
  v_ordem int;
  v_atraso int;
begin
  if new.inscricao_id is null or new.passo_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return null;
  end if;
  if new.status not in ('enviada', 'cancelada', 'falhou') then
    return null;
  end if;

  select i.id, i.cadencia_id, i.passo_atual, i.status
    into v_insc
    from public.cadencia_inscricoes i
   where i.id = new.inscricao_id;
  if not found then
    return null;
  end if;

  select cp.ordem into v_ordem
    from public.cadencia_passos cp where cp.id = new.passo_id;
  if not found then
    return null;
  end if;

  -- A CADÊNCIA INTEIRA FOI DESLIGADA e este toque caiu junto: o passo não se
  -- consome. Liberar a chave é o que permite que religar volte a escrever a
  -- mensagem 1 — sem isso o índice de idempotência a bloquearia para sempre.
  if new.status <> 'enviada' and v_insc.status <> 'ativa' then
    update public.mensagens
       set idempotency_key = 'cancelado:' || new.id::text
     where id = new.id
       and coalesce(idempotency_key, '') not like 'cancelado:%';
    return null;
  end if;

  -- Toque atrasado não puxa a cadência para trás.
  if v_ordem > v_insc.passo_atual then
    update public.cadencia_inscricoes
       set passo_atual = v_ordem
     where id = new.inscricao_id;
  else
    return null;
  end if;

  -- Inscrição parada não volta a correr por causa de um envio: quem a religa é
  -- uma decisão, não um efeito. O ponteiro acima já foi acertado, que é o que
  -- garante que ela retome no lugar certo.
  if v_insc.status <> 'ativa' then
    return null;
  end if;

  select cp.atraso_horas into v_atraso
    from public.cadencia_passos cp
   where cp.cadencia_id = v_insc.cadencia_id and cp.ordem = v_ordem + 1;

  if found then
    -- O espaçamento é contado do ENVIO de verdade. Num toque que morreu na
    -- fila não há envio, então o relógio do próximo começa agora.
    update public.cadencia_inscricoes
       set proximo_envio_em = coalesce(new.enviada_em, now()) + make_interval(hours => v_atraso)
     where id = new.inscricao_id;
  else
    -- Último passo entregue: a cadência acabou aqui, e não um ciclo depois.
    -- É este 'concluida' que `trg_cadencia_esgotada_perdido` escuta.
    update public.cadencia_inscricoes
       set status = 'concluida', proximo_envio_em = null
     where id = new.inscricao_id;
  end if;

  return null;
end;
$function$;

comment on function public.toque_mudou_de_estado_move_a_cadencia() is
  'O ponteiro da cadencia segue o que aconteceu com o toque: envio consome o '
  'passo e conta o espacamento a partir de `enviada_em`; toque morto com a '
  'inscricao ativa e um "pula este"; toque morto com a inscricao parada NAO '
  'consome o passo e libera a chave de idempotencia, para que religar a '
  'cadencia reescreva a mensagem 1. Substitui toque_enviado_reagenda_proximo.';

drop function if exists public.toque_enviado_reagenda_proximo();

drop trigger if exists trg_toque_move_a_cadencia on public.mensagens;
create trigger trg_toque_move_a_cadencia
  after insert or update of status on public.mensagens
  for each row
  execute function public.toque_mudou_de_estado_move_a_cadencia();

revoke all on function public.toque_mudou_de_estado_move_a_cadencia() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PASSO 4: `processar_cadencias` para de avançar o ponteiro.
--
-- Só o final da função muda. O resto — a trava de consentimento, a de
-- "respondeu", a de contato sem canal, a de passo sem modelo — fica igual.
-- ---------------------------------------------------------------------------

create or replace function public.processar_cadencias(p_inscricao_id uuid default null)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_count int := 0;
  r record;
  v_passo record;
  v_seguinte record;
  v_contato record;
  v_tpl record;
  v_assunto text;
  v_corpo text;
  v_primeiro_nome text;
  v_destino text;
  v_vendedor text;
  v_pular boolean;
  v_manual boolean;
  v_tem_algum_destino boolean;
  v_inseriu int;
  v_consumir boolean;
begin
  for r in
    select i.id, i.negocio_id, i.cadencia_id, i.passo_atual, i.tenant_id, i.criado_em as inscrito_em,
           c.autonoma, n.contato_id, n.titulo as negocio_titulo,
           u.nome as nome_responsavel,
           t.caixa_email_nome as nome_da_caixa
      from public.cadencia_inscricoes i
      join public.cadencias c on c.id = i.cadencia_id
      join public.negocios n on n.id = i.negocio_id
      left join public.usuarios u on u.id = n.responsavel_id
      left join public.tenants t on t.id = i.tenant_id
     where i.status = 'ativa'
       and i.proximo_envio_em is not null
       and i.proximo_envio_em <= now()
       and c.ativa
       and (p_inscricao_id is null or i.id = p_inscricao_id)
     order by i.proximo_envio_em
     for update of i skip locked
  loop
    v_pular := false;
    v_manual := false;
    v_consumir := false;

    -- O TOQUE ANTERIOR AINDA NAO SAIU: nao gera o proximo.
    if exists (
      select 1 from public.mensagens m
       where m.inscricao_id = r.id
         and m.status = 'aguardando_aprovacao'
    ) then
      continue;
    end if;

    select p.* into v_passo
      from public.cadencia_passos p
     where p.cadencia_id = r.cadencia_id and p.ordem = r.passo_atual + 1;

    if not found then
      update public.cadencia_inscricoes set status='concluida', proximo_envio_em=null where id=r.id;
      continue;
    end if;

    if v_passo.parar_se_respondeu and exists (
      select 1 from public.mensagens m
       where m.negocio_id = r.negocio_id and m.direcao = 'entrada'
         and not m.automatica
         and coalesce(m.recebida_em, m.criado_em) > r.inscrito_em
    ) then
      update public.cadencia_inscricoes set status='respondeu', proximo_envio_em=null where id=r.id;

      update public.mensagens
         set status = 'cancelada',
             ultimo_erro = 'Cancelada: o lead respondeu antes deste toque sair.'
       where negocio_id = r.negocio_id
         and envio_manual
         and status = 'aguardando_aprovacao';
      continue;
    end if;

    select c.* into v_contato from public.contatos c where c.id = r.contato_id;

    if exists (
      select 1 from public.consentimentos k
       where k.contato_id = r.contato_id and k.canal = v_passo.canal and k.revogado_em is not null
    ) then
      update public.cadencia_inscricoes set status='cancelada', proximo_envio_em=null where id=r.id;
      update public.mensagens
         set status = 'cancelada',
             ultimo_erro = 'Cancelada: o contato revogou o consentimento neste canal.'
       where negocio_id = r.negocio_id
         and envio_manual
         and status = 'aguardando_aprovacao';
      continue;
    end if;

    v_destino := case when v_passo.canal = 'whatsapp'
                      then coalesce(nullif(v_contato.whatsapp, ''), v_contato.telefone)
                      else v_contato.email end;

    if coalesce(v_destino, '') = '' then
      v_tem_algum_destino :=
        coalesce(v_contato.email, '') <> ''
        or coalesce(nullif(v_contato.whatsapp, ''), v_contato.telefone, '') <> '';

      if v_tem_algum_destino then
        v_pular := true;
      else
        update public.cadencia_inscricoes set status='pausada', proximo_envio_em=null where id=r.id;
        insert into public.mensagens (
          tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
          canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
        ) values (
          r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
          v_passo.canal, 'falhou',
          'Cadencia pausada: o contato nao tem e-mail, WhatsApp nem telefone cadastrado.',
          'template', r.id::text || ':' || v_passo.id::text,
          'contato sem nenhum canal'
        ) on conflict (idempotency_key) do nothing;
        continue;
      end if;
    end if;

    if not v_pular then
      select t.* into v_tpl from public.templates_mensagem t where t.id = v_passo.template_id;

      if not found then
        update public.cadencia_inscricoes set status='pausada', proximo_envio_em=null where id=r.id;
        insert into public.mensagens (
          tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
          canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
        ) values (
          r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
          v_passo.canal, 'falhou',
          'Cadencia pausada: o passo ' || v_passo.ordem || ' esta sem modelo de mensagem.',
          'template', r.id::text || ':' || v_passo.id::text,
          'passo sem modelo'
        ) on conflict (idempotency_key) do nothing;
        continue;
      end if;

      if v_passo.canal = 'whatsapp' and coalesce(v_tpl.template_externo_id, '') = '' then
        v_manual := true;
      end if;
    end if;

    -- ─────────────────────────────────────────────────────────────────────
    -- ESCREVER O TOQUE — ou concluir que este passo não tem toque a escrever.
    -- ─────────────────────────────────────────────────────────────────────
    if v_pular then
      -- Contato sem endereço NESTE canal, mas com endereço no outro (só
      -- e-mail, ou só WhatsApp). Nenhuma mensagem é escrita.
      v_consumir := true;
    else
      v_primeiro_nome := split_part(coalesce(v_contato.nome, ''), ' ', 1);
      v_vendedor := coalesce(r.nome_da_caixa, r.nome_responsavel, 'Softeum');
      v_assunto := coalesce(v_tpl.assunto, 'Sobre ' || coalesce(v_contato.empresa, r.negocio_titulo));
      v_corpo := coalesce(v_tpl.corpo, '');

      v_assunto := replace(replace(replace(replace(v_assunto,
        '{{primeiro_nome}}', v_primeiro_nome), '{{contato}}', coalesce(v_contato.nome, '')),
        '{{empresa}}', coalesce(v_contato.empresa, '')), '{{vendedor}}', v_vendedor);
      v_corpo := replace(replace(replace(replace(v_corpo,
        '{{primeiro_nome}}', v_primeiro_nome), '{{contato}}', coalesce(v_contato.nome, '')),
        '{{empresa}}', coalesce(v_contato.empresa, '')), '{{vendedor}}', v_vendedor);

      insert into public.mensagens (
        tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
        canal, status, destino, assunto, corpo, gerado_por,
        template_externo, variaveis, idempotency_key, agendada_para, envio_manual
      ) values (
        r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
        v_passo.canal,
        case when r.autonoma and not v_manual then 'aprovada' else 'aguardando_aprovacao' end,
        v_destino,
        case when v_passo.canal = 'email' then v_assunto else null end,
        v_corpo, 'template',
        case when v_passo.canal = 'whatsapp' then v_tpl.template_externo_id else null end,
        case when v_passo.canal = 'whatsapp'
             then array[v_primeiro_nome, coalesce(v_contato.empresa, ''), v_vendedor]
             else null end,
        r.id::text || ':' || v_passo.id::text,
        now(),
        v_manual
      ) on conflict (idempotency_key) do nothing;

      get diagnostics v_inseriu = row_count;

      -- A CHAVE JÁ EXISTIA e a linha não entrou. Quer dizer que este passo já
      -- teve um toque que NÃO foi cancelado — enviado antes do ponteiro ser
      -- rebobinado, ou 'falhou' depois das cinco tentativas. (Toque cancelado
      -- não cai aqui: o gatilho renomeia a chave dele para 'cancelado:<id>'
      -- justamente para o passo poder ser reescrito.)
      --
      -- Sem esta saída a inscrição ficaria estacionada para sempre: nada foi
      -- escrito, então nenhum envio viria destravá-la.
      if v_inseriu = 0 then
        v_consumir := true;
      end if;
    end if;

    -- ─────────────────────────────────────────────────────────────────────
    -- O PASSO SEM TOQUE precisa ser consumido AQUI, na marra: não existe
    -- envio que possa avançar o ponteiro por ele.
    -- ─────────────────────────────────────────────────────────────────────
    if v_consumir then
      select p.* into v_seguinte
        from public.cadencia_passos p
       where p.cadencia_id = r.cadencia_id and p.ordem = v_passo.ordem + 1;

      if found then
        update public.cadencia_inscricoes
           set passo_atual = v_passo.ordem,
               proximo_envio_em = now() + make_interval(hours => v_seguinte.atraso_horas)
         where id = r.id;
      else
        update public.cadencia_inscricoes
           set passo_atual = v_passo.ordem, status = 'concluida', proximo_envio_em = null
         where id = r.id;
      end if;
      continue;
    end if;

    -- ─────────────────────────────────────────────────────────────────────
    -- O TOQUE FOI ESCRITO, E SÓ ISSO.
    --
    -- `passo_atual` fica onde está: quem o avança é `trg_toque_move_a_cadencia`,
    -- quando a mensagem sair de verdade. Era exatamente aqui que o defeito
    -- nascia — o ponteiro andava com a ESCRITA, e um toque cancelado antes de
    -- sair levava o passo embora com ele.
    --
    -- `proximo_envio_em = null` estaciona a inscrição: ela não volta a ser
    -- avaliada a cada minuto enquanto o toque espera aprovação. Quem a
    -- destrava é o gatilho — no envio, no cancelamento ou na falha.
    -- ─────────────────────────────────────────────────────────────────────
    update public.cadencia_inscricoes
       set proximo_envio_em = null
     where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

comment on function public.processar_cadencias(uuid) is
  'Escreve o proximo toque de cada inscricao vencida. NAO avanca `passo_atual` '
  '-- isso e do gatilho `trg_toque_move_a_cadencia`, no envio. A excecao e o '
  'passo pulado por falta de endereco no canal, que nao gera mensagem e por '
  'isso precisa ser consumido aqui.';
