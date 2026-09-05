-- "SDR IA" sai do banco. Não existe essa pessoa.
--
-- Era um usuário de semente com papel de SDR, e-mail num domínio `.invalid`
-- (que não roteia, por definição) e login que nunca foi usado. Foi o nome dele
-- que vazou nos dois primeiros e-mails da cadência, quando o remetente ainda
-- era derivado do responsável pelo negócio.
--
-- A migração anterior o desativou. Esta apaga.
--
-- POR QUE UMA GUARDA, SE EU JÁ CONFERI
--
-- Conferi NESTA base: zero referências nas 15 colunas que apontam para
-- `usuarios` — negócios (responsável e vendedor de origem), atividades,
-- mensagens aprovadas, inscrições de cadência, propostas, notificações,
-- contatos, convites, integrações Google, regras de distribuição,
-- solicitações de desconto e a própria caixa do tenant.
--
-- Mas migração não roda só nesta base. Ela roda em qualquer cópia — a de
-- desenvolvimento de amanhã, a restaurada de um backup — e nessas o "SDR IA"
-- pode ter assinado coisa. `delete` numa linha referenciada ou levanta erro de
-- chave estrangeira, ou pior: passa, se alguma FK for `on delete set null`, e
-- apaga silenciosamente a autoria de um histórico.
--
-- A guarda varre as FKs por catálogo, em vez de listar as 15 colunas à mão:
-- lista escrita à mão envelhece, e a próxima coluna que alguém acrescentar não
-- estaria nela.
--
-- A DIREÇÃO DA CASCATA, QUE EU TINHA ENTENDIDO AO CONTRÁRIO
--
-- A FK é `usuarios_id_fkey: (id) REFERENCES auth.users(id) ON DELETE CASCADE`.
-- Ela aponta de `public.usuarios` PARA `auth.users` — então apagar em
-- `auth.users` remove a linha de `public.usuarios` junto, e não o contrário.
--
-- Medido em transação revertida: apagar só `public.usuarios` deixa a linha de
-- `auth.users` ÓRFÃ. Um login que ainda existe, sem perfil nenhum do lado da
-- aplicação — e as funções que decidem papel (`usuario_role()`,
-- `usuario_tenant_id()`) leem justamente a tabela que não teria mais a linha.
-- Conta órfã é pior do que conta desativada.
--
-- Por isso o `delete` é em `auth.users`, e `public.usuarios` sai pela cascata.

do $apaga$
declare
  v_id uuid;
  f record;
  v_refs bigint;
  v_total bigint := 0;
begin
  select id into v_id
    from public.usuarios
   where email = 'sdr-ia@softeum.invalid';

  if v_id is null then
    raise notice 'Nao ha usuario sdr-ia@softeum.invalid -- nada a fazer.';
    return;
  end if;

  for f in
    select c.conrelid::regclass::text as tabela, a.attname as coluna
      from pg_constraint c
      join lateral unnest(c.conkey) k(attnum) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f' and c.confrelid = 'public.usuarios'::regclass
  loop
    execute format('select count(*) from %s where %I = $1', f.tabela, f.coluna)
      into v_refs using v_id;

    if v_refs > 0 then
      raise exception
        'ABORTADO: % linha(s) em %.% ainda apontam para o usuario "SDR IA". '
        'Apagar aqui destruiria autoria de historico. Reatribua antes.',
        v_refs, f.tabela, f.coluna;
    end if;

    v_total := v_total + v_refs;
  end loop;

  -- Em `auth.users`, para a cascata levar `public.usuarios` junto.
  delete from auth.users where id = v_id;

  if exists (select 1 from public.usuarios where id = v_id) then
    raise exception
      'A cascata nao removeu public.usuarios. Nao deixe conta pela metade: '
      'confira a FK usuarios_id_fkey antes de seguir.';
  end if;

  raise notice 'Usuario "SDR IA" apagado, login incluido (0 referencias em % colunas).', v_total;
end
$apaga$;
