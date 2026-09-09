-- ---------------------------------------------------------------------------
-- Contato sem e-mail, identificado só pelo WhatsApp, também não entra duplicado.
-- E a trava de e-mail deixa de ter a brecha do espaço em branco.
--
-- ---------------------------------------------------------------------------
-- O QUE JÁ EXISTIA, E QUE CONTINUA VALENDO
--
-- A trava de e-mail duplicado JÁ é do banco, e não da tela — dois índices
-- únicos sobre `contatos`, sem nenhuma referência a etapa ou funil, então ela
-- vale igual para lead novo, lead em negociação e lead perdido:
--
--   contatos_tenant_email_unique   unique (tenant_id, email)
--   ux_contatos_tenant_email       unique (tenant_id, lower(email))
--   ux_contatos_sem_email_empresa_nome
--                                  unique (tenant_id, chave(empresa), chave(nome))
--                                  quando email is null
--
-- Conferido contra a planilha de 221 leads: 208 dos 212 e-mails já estavam
-- cadastrados, e os índices recusariam todos.
--
-- ---------------------------------------------------------------------------
-- BRECHA 1: O ESPAÇO EM BRANCO.
--
-- `ux_contatos_tenant_email` usa `lower(email)`, sem `btrim`. Então
-- " joao@x.com" e "joao@x.com" são chaves DIFERENTES e os dois entram. O
-- índice irmão, `contatos_tenant_email_unique`, é sobre o texto cru e nem a
-- caixa alta ele pega.
--
-- Um CSV com espaço sobrando numa célula é o caso mais banal que existe, e era
-- suficiente para furar a única trava que o sistema tinha.
--
-- Duas correções, e as duas são necessárias:
--   a) um gatilho apara o e-mail na escrita — assim o dado GRAVADO fica limpo,
--      e não só a chave do índice;
--   b) o índice passa a ser sobre `lower(btrim(email))`.
--
-- Só (b) deixaria entrar o espaço no banco e apenas não duplicaria; só (a)
-- deixaria o índice velho valendo para as linhas antigas. Juntas, o dado é
-- limpo e a chave é honesta.
--
-- `contatos_tenant_email_unique` NÃO é removido de propósito: a importação usa
-- `upsert(..., { onConflict: "tenant_id,email" })`, e o PostgREST exige um
-- índice único exatamente nessas colunas. Derrubá-lo quebraria a importação
-- inteira — e é o tipo de estrago que só aparece no próximo arquivo grande.
--
-- ---------------------------------------------------------------------------
-- BRECHA 2: O CONTATO QUE SÓ TEM WHATSAPP.
--
-- `telefone` e `whatsapp` tinham índice, mas NÃO único. Um lead sem e-mail,
-- identificado só pelo número, entrava quantas vezes fosse importado.
--
-- O índice novo é `unique (tenant_id, chave_do_telefone) where email is null`.
-- Três decisões dentro disso:
--
-- 1. `coalesce(telefone_chave(whatsapp), telefone_chave(telefone))` — o mesmo
--    número vale, esteja ele no campo de WhatsApp ou no de telefone. Sem o
--    coalesce, o mesmo contato entraria duas vezes só por ter sido digitado em
--    campos diferentes.
--
-- 2. `telefone_chave()` já existe e é `immutable` (requisito para entrar em
--    índice). Ela normaliza de verdade: tira máscara, só prefixa 55 quando o
--    número parece brasileiro, e corta o nono dígito com `left(4)||right(8)` —
--    então (11) 99999-8888 e +55 11 9999-8888 são a MESMA chave.
--
-- 3. `where email is null` é o recorte, e ele é deliberado.
--
--    Quando há e-mail, o e-mail é a identidade e os índices acima já resolvem.
--    Quando NÃO há, o número é a única identidade que sobra — e é exatamente
--    esse o caso do pedido.
--
--    Aplicar a trava de telefone a TODO contato pareceria mais rigoroso e
--    seria pior: em B2B é comum duas pessoas da mesma empresa dividirem o
--    telefone da central. O índice global recusaria a segunda pessoa — uma
--    pessoa real, com e-mail próprio — e a importação a contaria como
--    "duplicada". Trava que recusa dado legítimo é pior que a duplicata que
--    ela evita.
--
-- Conferido antes de criar: ZERO contatos colidem por essa chave hoje, então
-- o índice sobe sem precisar limpar nada.
-- ---------------------------------------------------------------------------

-- ── (a) o dado gravado fica limpo ──────────────────────────────────────────

create or replace function public.contatos_normalizar_email()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- `nullif(...,'')` e não só `btrim`: e-mail que era só espaço vira NULL, e
  -- não string vazia. É a diferença entre "não tem e-mail" (entra na trava de
  -- empresa+nome) e "tem um e-mail vazio" (não entra em trava nenhuma).
  new.email := nullif(btrim(new.email), '');
  return new;
end;
$function$;

comment on function public.contatos_normalizar_email() is
  'Apara espacos do e-mail na escrita e transforma vazio em NULL, para que as '
  'travas de duplicidade vejam sempre a mesma forma do mesmo endereco.';

drop trigger if exists trg_contatos_normalizar_email on public.contatos;
create trigger trg_contatos_normalizar_email
  before insert or update of email on public.contatos
  for each row
  execute function public.contatos_normalizar_email();

revoke all on function public.contatos_normalizar_email() from public, anon, authenticated;

-- Limpa o passivo antes de apertar o indice. Hoje sao 0 linhas — o `update`
-- fica como rede para qualquer coisa que entre entre esta migration e o deploy.
update public.contatos
   set email = nullif(btrim(email), '')
 where email is distinct from nullif(btrim(email), '');

-- ── (b) a chave do indice passa a ignorar espaco ───────────────────────────

drop index if exists public.ux_contatos_tenant_email;
create unique index ux_contatos_tenant_email
  on public.contatos (tenant_id, lower(btrim(email)))
  where email is not null and btrim(email) <> '';

-- ── BRECHA 2: o contato que so tem WhatsApp ────────────────────────────────

create unique index if not exists ux_contatos_sem_email_telefone
  on public.contatos (
    tenant_id,
    coalesce(public.telefone_chave(whatsapp), public.telefone_chave(telefone))
  )
  where email is null
    and coalesce(public.telefone_chave(whatsapp), public.telefone_chave(telefone)) is not null;

comment on index public.ux_contatos_sem_email_telefone is
  'Contato sem e-mail nao entra duas vezes com o mesmo numero. Recorte em '
  '`email is null` de proposito: com e-mail, ele e a identidade e os indices '
  'de e-mail ja resolvem; sem e-mail, o numero e a unica identidade que sobra.';

-- ── VERIFICACAO ────────────────────────────────────────────────────────────

do $$
declare
  v_dup_email int;
  v_dup_fone int;
begin
  select count(*) into v_dup_email from (
    select tenant_id, lower(btrim(email)) from public.contatos
     where email is not null and btrim(email) <> ''
     group by 1,2 having count(*) > 1) d;

  select count(*) into v_dup_fone from (
    select tenant_id, coalesce(public.telefone_chave(whatsapp), public.telefone_chave(telefone)) as k
      from public.contatos
     where email is null
     group by 1,2 having count(*) > 1 and k is not null) d;

  if v_dup_email > 0 or v_dup_fone > 0 then
    raise exception 'Duplicatas restantes: % por e-mail, % por telefone.', v_dup_email, v_dup_fone;
  end if;

  raise notice 'Travas no ar: e-mail (com btrim) e telefone para contato sem e-mail.';
end $$;
