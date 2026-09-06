-- As duas funções que o repositório usava e nunca criava.
--
-- Levantamento: cruzei toda referência a função nas migrations (`execute
-- function` dos gatilhos, qualificada e não) e todo `.rpc("…")` do app contra
-- a lista do que as migrations definem. Sobraram exatamente duas:
--
--   `bloquear_dominios_concorrentes` — o gatilho
--     `trg_bloquear_dominios_concorrentes on contatos` a chama em
--     20260816000500_schema_base_gatilhos.sql, e `create trigger` valida a
--     função NA CRIAÇÃO. Ou seja: um banco novo montado a partir deste
--     repositório quebrava nessa linha e não subia — que é justamente o
--     momento em que se precisa dele (ambiente de teste, restauração).
--
--   `processar_lembretes` — chamada pelo job `processar-lembretes-cadencia`
--     do `pg_cron` (a cada 5 min, conferido em `cron.job`). Se o banco fosse
--     remontado do zero, o job existiria e a função não.
--
-- As duas EXISTEM em produção; o que faltava era estarem escritas aqui. O
-- corpo abaixo é o que está no banco hoje, copiado de `pg_get_functiondef`,
-- sem uma vírgula de diferença — esta migration não muda comportamento
-- nenhum, ela só para de mentir sobre o que o repositório contém.
--
-- `search_path = ''` nas duas porque é a regra que
-- 20260902194000_search_path_fixo_nas_funcoes_restantes.sql estabeleceu: com
-- o caminho vazio, todo nome não qualificado vira erro em vez de resolver
-- para o schema errado. Por isso todas as tabelas aparecem como `public.x`.

create or replace function public.bloquear_dominios_concorrentes()
  returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  if new.email is not null and new.email <> '' then
    if lower(split_part(new.email, '@', 2)) like '%softexpert%'
       or lower(split_part(new.email, '@', 2)) like '%neogrid%' then
      raise exception 'nao e permitido cadastrar e-mails deste dominio';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.processar_lembretes()
  returns integer
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_count int := 0;
begin
  with vencidos as (
    select a.id, a.usuario_id, a.titulo, a.negocio_id
    from public.atividades a
    where a.lembrete_data is not null
      and a.lembrete_data <= now()
      and a.lembrete_enviado = false
  ),
  marcados as (
    update public.atividades set lembrete_enviado = true
    where id in (select id from vencidos)
    returning id, usuario_id, titulo, negocio_id
  )
  insert into public.notificacoes (usuario_id, tipo, titulo, corpo, link)
  select m.usuario_id, 'lembrete_cadencia',
    coalesce('Lembrete: ' || m.titulo, 'Lembrete de cadencia'),
    'Cliente: ' || coalesce(c.empresa, c.nome, 'Sem nome') || ' — acao agendada para agora.',
    '/negocios/' || m.negocio_id || '?tab=cadencia'
  from marcados m
  left join public.negocios n on n.id = m.negocio_id
  left join public.contatos c on c.id = n.contato_id
  where m.usuario_id is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- `processar_lembretes` é chamada pelo `pg_cron`, que roda como `postgres`
-- dentro do banco — ninguém de fora precisa alcançá-la. O `public` na frente
-- do revoke é obrigatório e não é estilo: no Postgres o `execute` de função
-- nasce concedido a PUBLIC, então revogar só de `anon, authenticated` não
-- tira nada (a lição está escrita em 20260905100000). Em produção ela já
-- está assim — `has_function_privilege('anon', …)` devolve `false`; isto aqui
-- é para o banco novo nascer igual.
revoke execute on function public.processar_lembretes() from public, anon, authenticated;

-- `bloquear_dominios_concorrentes` é função de GATILHO: só o motor de
-- gatilhos a executa, e chamá-la por RPC não faz nada útil (`new` não
-- existe fora do gatilho). Hoje ela está com `execute` para anon e
-- authenticated por herança do PUBLIC — superfície de API sem uso.
revoke execute on function public.bloquear_dominios_concorrentes() from public, anon, authenticated;
