-- ---------------------------------------------------------------------------
-- Duas peças que a entrada de mensagens precisa, e que existiam só no banco.
--
-- Foram aplicadas direto durante o desenvolvimento (para poder exercitar a
-- resolução remetente -> contato com dado real antes de escrever o sync) e
-- estavam faltando aqui. Sem este arquivo, um ambiente novo sobe sem a RPC e
-- sem as colunas de cursor: `resolverPorTelefone` quebra em tempo de execução
-- e o sync do Gmail não tem onde guardar o `historyId`.
--
-- Tudo com `if not exists` / `create or replace`: em produção é no-op.
-- ---------------------------------------------------------------------------

-- 1. Achar o contato pelo telefone, com a MESMA regra do índice.
--
-- Existe como RPC em vez de virar um `.ilike()` no TypeScript por um motivo
-- concreto: reimplementar a regra do nono dígito no cliente criaria duas
-- verdades — uma alimentando o índice funcional, outra fazendo a busca — e as
-- duas iriam divergir na primeira correção que alguém fizesse em só um lado.
--
-- `security definer` porque quem chama é o webhook / o sync, que precisa
-- resolver o número ANTES de saber a qual negócio (e portanto a qual dono) a
-- mensagem pertence. Devolve só id, nome e tenant: nada que sirva para varrer
-- a base de contatos de alguém.
create or replace function public.contatos_por_telefone(p_numero text)
returns table(id uuid, nome text, tenant_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  select c.id, c.nome, c.tenant_id
    from public.contatos c
   -- Número que não reduz a chave nenhuma (vazio, lixo) não casa com NADA.
   -- Sem esta guarda, `null = null` seria falso de qualquer forma, mas a
   -- intenção fica explícita em vez de depender do comportamento do NULL.
   where public.telefone_chave(p_numero) is not null
     and (
       public.telefone_chave(c.whatsapp) = public.telefone_chave(p_numero)
       or public.telefone_chave(c.telefone) = public.telefone_chave(p_numero)
     )
   limit 20;
$$;

revoke execute on function public.contatos_por_telefone(text) from public, anon;
grant execute on function public.contatos_por_telefone(text) to authenticated, service_role;

-- 2. O cursor do Gmail, por caixa.
--
-- `gmail_history_id` é o ponto de retomada. Nulo significa "nunca sincronizou",
-- e é isso que faz a PRIMEIRA sincronização gravar só o cursor sem importar
-- histórico — importar e-mail antigo encerraria toda cadência ativa daquele
-- negócio com um status que parece correto ("respondeu").
--
-- `gmail_erro` é para o erro ficar VISÍVEL na tela de integrações. Um sync que
-- falha calado é indistinguível de uma caixa em que ninguém escreveu.
alter table public.integracoes_google
  add column if not exists gmail_history_id text,
  add column if not exists gmail_sincronizado_em timestamptz,
  add column if not exists gmail_erro text;

comment on column public.integracoes_google.gmail_history_id is
  'Cursor do Gmail (historyId). Nulo = nunca sincronizou; a primeira rodada só grava o cursor.';
