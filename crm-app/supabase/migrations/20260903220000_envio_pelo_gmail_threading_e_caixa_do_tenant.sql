-- O que faltava para uma conversa de e-mail ser uma conversa.
--
-- Medido antes de escrever isto: `thread_externo` existe desde a migration
-- 20260903180000 e NUNCA é escrito na saída — nem pelo insert da cadência
-- (20260903190000:129), nem pela rota de resposta. Ou seja: agrupar por thread
-- devolveria um balde gigante de nulos para tudo que o CRM manda. E o
-- `provedor_id`, único id de saída que era gravado, não é lido em lugar nenhum.
--
-- Nada aqui perde dado: `mensagens` está vazia (0 linhas) e as colunas são
-- todas anuláveis.

-- 1) As duas pontas que costuram uma thread.
--
-- `message_id_externo` é o Message-ID RFC desta mensagem — o nosso, quando nós
-- mandamos; o do cliente, quando ele responde. `in_reply_to` é o Message-ID que
-- ela responde. Com os dois, a conversa se remonta sem depender do Gmail: é o
-- que faz a thread funcionar também no cliente de e-mail do outro lado.
alter table public.mensagens
  add column if not exists message_id_externo text,
  add column if not exists in_reply_to text;

comment on column public.mensagens.message_id_externo is
  'Message-ID (RFC 5322) desta mensagem. Na saída é gerado por nós antes do envio, '
  'porque a próxima resposta do cliente vai cita-lo em In-Reply-To.';
comment on column public.mensagens.in_reply_to is
  'Message-ID da mensagem que esta responde. Vem do cabeçalho na entrada.';

-- A aba de e-mail agrupa por thread dentro de um negócio; sem índice isso é
-- varredura da tabela inteira a cada abertura de card.
create index if not exists mensagens_thread_idx
  on public.mensagens (negocio_id, thread_externo)
  where thread_externo is not null;

-- 2) A caixa de saída do tenant.
--
-- O envio deixa de sair de um endereço de sistema e passa a sair da caixa
-- comercial, que é a mesma que a sincronização já lê. É por isso que a resposta
-- do cliente volta para dentro do CRM em vez de morrer numa caixa que ninguém
-- abre.
--
-- Aponta para o USUÁRIO, e não para um texto com o e-mail, porque quem manda de
-- verdade é a conexão Google dele (`integracoes_google.usuario_id`) — guardar o
-- endereço solto deixaria configurar uma caixa que não tem token nenhum.
alter table public.tenants
  add column if not exists caixa_email_usuario_id uuid references public.usuarios(id) on delete set null;

comment on column public.tenants.caixa_email_usuario_id is
  'Usuário cuja conexão Google é a caixa de saída do tenant (comercial@…). '
  'ON DELETE SET NULL: desligar a pessoa não pode derrubar a tabela do tenant — '
  'o envio passa a recusar com "caixa não configurada", que é visível e corrigível.';

-- 3) `concluir_envio` guardando a thread.
--
-- Precisa ser DROP e CREATE, não `create or replace`: acrescentar parâmetro
-- muda a assinatura, e o `create or replace` criaria uma SEGUNDA função de
-- mesmo nome. Com as duas existindo, a chamada de 5 argumentos casaria nas duas
-- e o Postgres recusaria por ambiguidade — quebrando o despachante em produção.
--
-- Os dois parâmetros novos entram com default null e no fim da lista, então os
-- chamadores atuais (que passam por nome) continuam válidos sem tocar em nada.
drop function if exists public.concluir_envio(uuid, boolean, text, text, text);

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
as $$
declare
  v_tentativas int;
  v_canal text;
  v_tenant uuid;
begin
  select tentativas, canal, tenant_id into v_tentativas, v_canal, v_tenant
    from public.mensagens where id = p_id;
  if not found then return 'inexistente'; end if;

  if p_ok then
    -- `coalesce` nos dois novos: um provedor que não devolve thread (o WhatsApp)
    -- não pode apagar o que já estava lá.
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
$$;

revoke all on function public.concluir_envio(uuid, boolean, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.concluir_envio(uuid, boolean, text, text, text, text, text) to service_role;
