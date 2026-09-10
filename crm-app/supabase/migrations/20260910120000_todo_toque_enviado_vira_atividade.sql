-- ---------------------------------------------------------------------------
-- Todo toque que sai vira atividade — não só os que passam pelo despachante.
--
-- O SINTOMA, relatado junto com o do passo errado: "não está registrando as
-- cadências em atividades". Conferido, e o buraco é grande:
--
--   canal / caminho                        enviados   sem atividade
--   WhatsApp manual (cadência)                  37          37   (todos)
--   e-mail de cadência                          42           7
--   e-mail de resposta                          10          10   (todos)
--                                               ──          ──
--                                               89          54
--
-- ---------------------------------------------------------------------------
-- A CAUSA: a atividade era escrita por UM caminho, e existem quatro.
--
-- Quem grava a atividade hoje é a RPC `concluir_envio`, e ela só roda quando o
-- despachante manda a mensagem por um provedor (Resend, API da Meta).
--
-- O WhatsApp da cadência não passa por lá. `registrarTarefaEnviada`
-- (src/lib/cadencia.ts) faz um `update mensagens set status='enviada'` direto
-- do navegador — é a pessoa dizendo "abri o WhatsApp Web e mandei". Isso é
-- deliberado e está certo: passar por 'aprovada' daria uma janela em que o
-- cron poderia mandar a MESMA mensagem pela API da Meta, e o cliente receberia
-- duas vezes. Só que, não passando por `concluir_envio`, a atividade nunca era
-- escrita.
--
-- É o mesmo formato de defeito do `negocios.ganho` de ontem: um fato que
-- depende de alguém lembrar de chamar a função certa, em vez de ser garantido
-- por quem é dono do fato. E o resultado é o mesmo — o histórico do lead mente
-- por omissão, e o card não conta como trabalhado.
--
-- ---------------------------------------------------------------------------
-- O CONSERTO: quem grava a atividade é a TABELA, não o caminho.
--
-- Um gatilho em `mensagens`: a mensagem virou 'enviada' e é de saída, então a
-- atividade nasce. Não importa se veio do despachante, do clique no WhatsApp
-- Web, da resposta de e-mail ou de um caminho que ainda não existe.
--
-- `concluir_envio` PERDE o bloco que inseria a atividade, no mesmo passo — se
-- os dois continuassem escrevendo, todo e-mail despachado geraria duas.
--
-- ---------------------------------------------------------------------------
-- `atividades.mensagem_id`, e por que a coluna nova se paga.
--
-- Sem ela não há como dizer "esta atividade já foi registrada para este
-- toque", e sem isso duas coisas quebram:
--
--   - o backfill dos 54 duplicaria as 35 que já existem;
--   - uma mensagem que voltasse para 'aprovada' numa retentativa e fosse
--     enviada de novo geraria uma segunda atividade.
--
-- Com a coluna + índice único, as duas viram `on conflict do nothing`. E de
-- quebra a tela do negócio ganha o vínculo entre a linha do histórico e a
-- mensagem que a originou.
--
-- `on delete set null`: apagar uma mensagem não apaga o registro de que o
-- contato aconteceu.
-- ---------------------------------------------------------------------------

alter table public.atividades
  add column if not exists mensagem_id uuid references public.mensagens(id) on delete set null;

comment on column public.atividades.mensagem_id is
  'O toque que gerou esta atividade. Unico: e o que impede a mesma mensagem de '
  'virar duas linhas do historico.';

create unique index if not exists ux_atividades_mensagem
  on public.atividades (mensagem_id)
  where mensagem_id is not null;

-- ---------------------------------------------------------------------------
-- PASSO 1: casar as atividades que JÁ existem com a mensagem que as gerou.
--
-- Antes de criar as que faltam, é preciso saber quais não faltam. O casamento
-- é por negócio + canal + proximidade no tempo, porque não havia vínculo — e
-- `distinct on` garante uma atividade por mensagem, a mais próxima.
-- ---------------------------------------------------------------------------
do $$
declare
  v_casadas int;
begin
  with candidata as (
    select distinct on (m.id) m.id as mensagem_id, a.id as atividade_id
      from public.mensagens m
      join public.atividades a
        on a.negocio_id = m.negocio_id
       and a.mensagem_id is null
       and a.tipo = case when m.canal = 'whatsapp' then 'whatsapp' else 'email' end
       and a.criado_em between m.enviada_em - interval '5 minutes'
                           and m.enviada_em + interval '5 minutes'
     where m.status = 'enviada'
       and m.direcao = 'saida'
       and m.enviada_em is not null
       and m.negocio_id is not null
     order by m.id, abs(extract(epoch from (a.criado_em - m.enviada_em)))
  )
  update public.atividades a
     set mensagem_id = c.mensagem_id
    from candidata c
   where a.id = c.atividade_id;
  get diagnostics v_casadas = row_count;

  raise notice 'Atividades existentes vinculadas ao toque: %.', v_casadas;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 2: o gatilho.
-- ---------------------------------------------------------------------------

create or replace function public.mensagem_enviada_registra_atividade()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status <> 'enviada' or new.direcao <> 'saida' or new.negocio_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'enviada' then
    return null;
  end if;

  -- `criado_em` e `concluida_em` recebem a hora do ENVIO, e não `now()`.
  -- `atividades_tocar_negocio` lê justamente esses campos com `greatest()`
  -- para mover `ultima_atividade_em` — carimbar "agora" faria um toque de
  -- ontem parecer trabalho de hoje e reordenaria o board por engano.
  insert into public.atividades (
    negocio_id, usuario_id, mensagem_id, tipo, titulo, concluida, concluida_em, criado_em
  ) values (
    new.negocio_id,
    new.aprovada_por,
    new.id,
    case when new.canal = 'whatsapp' then 'whatsapp' else 'email' end,
    case
      when new.inscricao_id is not null
        then 'Cadência: ' || coalesce(nullif(btrim(new.assunto), ''),
                                      case when new.canal = 'whatsapp' then 'WhatsApp enviado'
                                           else 'e-mail enviado' end)
      else coalesce(nullif(btrim(new.assunto), ''), 'Mensagem enviada')
    end,
    true,
    coalesce(new.enviada_em, now()),
    coalesce(new.enviada_em, now())
  )
  on conflict (mensagem_id) where mensagem_id is not null do nothing;

  return null;
end;
$function$;

comment on function public.mensagem_enviada_registra_atividade() is
  'Todo toque de saida que vira "enviada" vira atividade, venha do '
  'despachante, do clique no WhatsApp Web ou de qualquer caminho futuro. '
  'Antes isso morava so em `concluir_envio`, e 54 dos 89 envios nao viravam '
  'historico porque nao passavam por la.';

drop trigger if exists trg_mensagem_enviada_registra_atividade on public.mensagens;
create trigger trg_mensagem_enviada_registra_atividade
  after insert or update of status on public.mensagens
  for each row
  execute function public.mensagem_enviada_registra_atividade();

revoke all on function public.mensagem_enviada_registra_atividade() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PASSO 3: `concluir_envio` para de escrever a atividade.
--
-- Idêntica à anterior, menos o bloco do `insert into atividades` — que agora é
-- do gatilho. Duas fontes escrevendo a mesma linha dariam histórico em dobro.
-- ---------------------------------------------------------------------------

create or replace function public.concluir_envio(
  p_id uuid,
  p_ok boolean,
  p_provedor_id text default null,
  p_erro text default null,
  p_erro_codigo text default null,
  p_thread_externo text default null,
  p_message_id_externo text default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tentativas int;
  v_canal text;
  v_tenant uuid;
begin
  select tentativas, canal, tenant_id
    into v_tentativas, v_canal, v_tenant
    from public.mensagens where id = p_id;
  if not found then return 'inexistente'; end if;

  if p_ok then
    -- A atividade NÃO é escrita aqui: quem escreve é
    -- `trg_mensagem_enviada_registra_atividade`, para valer também nos
    -- caminhos que não passam por esta função.
    update public.mensagens
       set status = 'enviada',
           enviada_em = now(),
           provedor_id = p_provedor_id,
           thread_externo = coalesce(p_thread_externo, thread_externo),
           message_id_externo = coalesce(p_message_id_externo, message_id_externo),
           ultimo_erro = null,
           erro_codigo = null
     where id = p_id;

    if v_canal = 'whatsapp' then perform public.whatsapp_avaliar_bloqueio(v_tenant); end if;
    return 'enviada';
  end if;

  if v_tentativas >= 5 then
    update public.mensagens
       set status = 'falhou', ultimo_erro = p_erro, erro_codigo = p_erro_codigo
     where id = p_id;
    if v_canal = 'whatsapp' then perform public.whatsapp_avaliar_bloqueio(v_tenant); end if;
    return 'falhou';
  end if;

  update public.mensagens
     set status = 'aprovada',
         ultimo_erro = p_erro,
         erro_codigo = p_erro_codigo,
         proxima_tentativa_em = now() + make_interval(mins => power(2, v_tentativas)::int),
         agendada_para = now() + make_interval(mins => power(2, v_tentativas)::int)
   where id = p_id;
  return 'reagendada';
end;
$function$;

-- ---------------------------------------------------------------------------
-- PASSO 4: O PASSIVO — as 54 que nunca viraram histórico.
-- ---------------------------------------------------------------------------
do $$
declare
  v_criadas int;
  v_restam int;
begin
  insert into public.atividades (
    negocio_id, usuario_id, mensagem_id, tipo, titulo, concluida, concluida_em, criado_em
  )
  select m.negocio_id,
         m.aprovada_por,
         m.id,
         case when m.canal = 'whatsapp' then 'whatsapp' else 'email' end,
         case
           when m.inscricao_id is not null
             then 'Cadência: ' || coalesce(nullif(btrim(m.assunto), ''),
                                           case when m.canal = 'whatsapp' then 'WhatsApp enviado'
                                                else 'e-mail enviado' end)
           else coalesce(nullif(btrim(m.assunto), ''), 'Mensagem enviada')
         end,
         true,
         m.enviada_em,
         m.enviada_em
    from public.mensagens m
   where m.status = 'enviada'
     and m.direcao = 'saida'
     and m.enviada_em is not null
     and m.negocio_id is not null
     and not exists (select 1 from public.atividades a where a.mensagem_id = m.id)
  on conflict (mensagem_id) where mensagem_id is not null do nothing;
  get diagnostics v_criadas = row_count;

  select count(*) into v_restam
    from public.mensagens m
   where m.status = 'enviada' and m.direcao = 'saida'
     and m.enviada_em is not null and m.negocio_id is not null
     and not exists (select 1 from public.atividades a where a.mensagem_id = m.id);

  if v_restam > 0 then
    raise exception 'Sobraram % toques enviados sem atividade.', v_restam;
  end if;

  raise notice 'Atividades criadas para o passivo: %.', v_criadas;
end $$;
