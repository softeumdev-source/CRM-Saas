-- O remetente passa a ser UMA pessoa, e ela se chama William Machado.
--
-- O QUE SAÍA ANTES, MEDIDO NAS MENSAGENS JÁ ENVIADAS
--
-- O nome que chega ao cliente vinha de TRÊS lugares diferentes, nenhum deles a
-- caixa que de fato manda:
--
--   * o corpo assinava `{{vendedor}}`, resolvido aqui em SQL como
--     `coalesce(r.nome_responsavel, 'Softeum')` — o responsável pelo NEGÓCIO;
--   * o cabeçalho `From` usava `nomeDeExibicao(responsavel)`, no TypeScript,
--     que devolvia "Primeiro (Softeum)";
--   * quando não havia responsável — que é o estado normal de um lead novo em
--     prospecção, porque ele nasce no pool — os dois caíam em "Softeum".
--
-- O resultado real, conferido em `mensagens`: os e-mails de 04/09 20:20 e 20:23
-- saíram assinados "SDR IA", o nome de um usuário-robô de semente. Os de 22:30
-- e 23:14 saíram como "Softeum, da Softeum", porque `{{vendedor}}` e
-- `{{empresa}}` caíram no mesmo literal.
--
-- A CORREÇÃO É DE MODELAGEM, NÃO DE TEXTO
--
-- O nome do remetente é propriedade da CAIXA, não consequência de quem conectou
-- o Google nem de quem clicou. A caixa é uma só (`comercial@softeum.com.br`),
-- então o nome também é um só, e fica ao lado dela em `tenants`.
--
-- Isso resolve o caso que nenhuma das três fontes resolvia: lead sem dono. E
-- resolve a armadilha de "usar o nome do dono da caixa", que produziria
-- "Admin Softeum" — a conexão Google pertence ao usuário admin
-- (softeumdev@gmail.com), não ao vendedor.

alter table public.tenants
  add column if not exists caixa_email_nome text;

comment on column public.tenants.caixa_email_nome is
  'Nome que o cliente ve no From e na assinatura do corpo. E da CAIXA, e nao do '
  'usuario que conectou o Google nem de quem clicou em enviar: a caixa e uma so, '
  'entao a pessoa que o cliente conhece tambem e uma so.';

update public.tenants
   set caixa_email_nome = 'William Machado'
 where caixa_email_nome is null;


-- ── O usuário do vendedor ganha o sobrenome ───────────────────────────────
-- O banco tinha só "William". O nome completo aparece na assinatura, no convite
-- da agenda e no histórico — e "William" sozinho num e-mail comercial para
-- alguém que nunca ouviu falar da empresa é menos do que a pessoa merece.
update public.usuarios
   set nome = 'William Machado'
 where nome = 'William';


-- ── "SDR IA" sai de circulação ────────────────────────────────────────────
--
-- Não existe essa pessoa, e foi o nome dela que vazou nos dois primeiros
-- e-mails. Conferido antes de mexer: ZERO referências em todas as 15 colunas
-- que apontam para `usuarios` (negócios, atividades, mensagens, inscrições,
-- propostas, notificações, regras de distribuição, a caixa do tenant…), e o
-- login nunca foi usado — `auth.users.last_sign_in_at` é nulo, e o e-mail está
-- num domínio `.invalid`, que não roteia por definição.
--
-- DESATIVAR, e não apagar. O efeito visível é o mesmo: some de todo seletor de
-- responsável, de toda lista e de toda distribuição, porque as consultas
-- filtram `ativo`. A diferença é que `delete` em `public.usuarios` cascateia
-- para `auth.users` e não tem volta, e não há pressa nenhuma que justifique
-- isso. Se você quiser apagar de vez, é uma linha.
update public.usuarios
   set ativo = false
 where email = 'sdr-ia@softeum.invalid';


-- ── O corpo passa a assinar pelo nome da caixa ────────────────────────────
--
-- Duas trocas cirúrgicas em `processar_cadencias()`, por substituição no texto
-- que vem de `pg_get_functiondef`, e não recopiando as ~140 linhas da função:
-- transcrever à mão para mudar duas linhas é um jeito caro de introduzir um
-- erro novo, e a função já foi reescrita três vezes hoje.
--
-- O bloco levanta se qualquer uma das duas não casar — migração que "não fez
-- nada" em silêncio é pior do que migração que falha.
do $assinatura$
declare
  v_def text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'processar_cadencias';

  if v_def is null then
    raise exception 'processar_cadencias() nao existe';
  end if;

  -- 1. A consulta do laço passa a trazer o nome da caixa do tenant.
  v_novo := replace(
    v_def,
    '           u.nome as nome_responsavel
      from public.cadencia_inscricoes i
      join public.cadencias c on c.id = i.cadencia_id
      join public.negocios n on n.id = i.negocio_id
      left join public.usuarios u on u.id = n.responsavel_id',
    '           u.nome as nome_responsavel,
           t.caixa_email_nome as nome_da_caixa
      from public.cadencia_inscricoes i
      join public.cadencias c on c.id = i.cadencia_id
      join public.negocios n on n.id = i.negocio_id
      left join public.usuarios u on u.id = n.responsavel_id
      left join public.tenants t on t.id = i.tenant_id'
  );
  if v_novo = v_def then
    raise exception 'Nao consegui acrescentar o join de tenants em processar_cadencias()';
  end if;
  v_def := v_novo;

  -- 2. `{{vendedor}}` passa a preferir o nome da caixa.
  --    A ordem importa: a caixa primeiro porque é ela que manda de verdade. O
  --    responsável fica como segundo, para o dia em que cada vendedor tiver a
  --    própria caixa. E 'Softeum' continua no fim, para nunca sair vazio.
  v_novo := replace(
    v_def,
    'v_vendedor := coalesce(r.nome_responsavel, ''Softeum'');',
    'v_vendedor := coalesce(r.nome_da_caixa, r.nome_responsavel, ''Softeum'');'
  );
  if v_novo = v_def then
    raise exception 'Nao consegui trocar a origem de v_vendedor em processar_cadencias()';
  end if;

  execute v_novo;
  raise notice 'processar_cadencias(): {{vendedor}} passa a vir do nome da caixa';
end
$assinatura$;
