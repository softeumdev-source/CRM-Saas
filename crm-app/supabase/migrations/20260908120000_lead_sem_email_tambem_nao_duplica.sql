-- ---------------------------------------------------------------------------
-- A regra "nao pode subir lead que ja existe" passa a valer TAMBEM sem e-mail.
--
-- O que ja existia so cobria lead COM e-mail, e cobria em dobro:
--   * `contatos_tenant_email_unique`  em (tenant_id, email)         -- com caixa
--   * `ux_contatos_tenant_email`      em (tenant_id, lower(email))  -- sem caixa
-- Os dois sao PARCIAIS (`where email is not null`). Lead sem e-mail nao colide
-- com nada, e a unica defesa era a classificacao da tela de importacao — que
-- roda sobre uma leitura feita NO MOMENTO do upload. Duas importacoes ao mesmo
-- tempo, ou uma leitura velha, ainda duplicavam.
--
-- Ter DOIS indices para a mesma regra tambem era um defeito por si so: a tela
-- gravava o e-mail so com `trim()`, entao `Joao@x.com` com `joao@x.com` na base
-- nao casava com o `on conflict (tenant_id, email)`, o Postgres tentava
-- INSERIR, e o indice do `lower` barrava com 23505 — derrubando o lote inteiro
-- de 500 linhas em vez da linha. Medido antes desta migracao: 229 e-mails na
-- base, TODOS ja em minusculas, e 0 duplicados por diferenca de caixa. Ou seja,
-- nao ha dado a consertar; o que falta e impedir o proximo arquivo.
--
-- Esta migracao faz tres coisas, nesta ordem:
--   1) uma funcao imutavel de normalizacao de texto, para poder entrar em
--      indice (o `unaccent` NAO esta instalado aqui, e ele nao e imutavel);
--   2) um gatilho que normaliza o e-mail em TODA escrita, venha de onde vier —
--      importacao, modal de novo lead, webhook, RPC. E o que faz os dois
--      indices concordarem para sempre;
--   3) o indice unico que faltava, para lead SEM e-mail.
-- ---------------------------------------------------------------------------

-- 1) NORMALIZACAO DE TEXTO DIGITADO POR GENTE.
--
-- Mesma regra que `chaveEmpresaNome` aplica no TypeScript (`importarLeads.ts`):
-- minusculas, sem acento, espacos colapsados. As duas precisam concordar, senao
-- a tela classifica como novo o que o banco recusa — que e o pior dos mundos:
-- o usuario ve "sera importado" e leva um erro.
--
-- O acento sai por `translate` e nao por `unaccent` porque `unaccent` e STABLE,
-- nao IMMUTABLE, e indice exige imutavel. O mapa cobre o portugues; o que
-- escapar dele apenas nao normaliza, e no maximo deixa passar um duplicado —
-- nunca recusa um lead legitimo.
create or replace function public.texto_chave(p text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(translate(
          p,
          'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝÿý',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'
        )),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

comment on function public.texto_chave(text) is
  'Normaliza texto digitado por gente para comparacao: minusculas, sem acento, '
  'espacos colapsados. Devolve NULL para vazio. Espelha chaveEmpresaNome() do '
  'TypeScript. Imutavel de proposito: e usada em indice.';

-- 2) O E-MAIL ENTRA SEMPRE NORMALIZADO.
--
-- Isso e o que dispensa confiar em cada chamador. A tela de importacao passou a
-- normalizar tambem (em `paraContato`), mas o modal de novo lead insere direto,
-- e o webhook do WhatsApp e as RPCs tambem escrevem aqui. Um gatilho e o unico
-- lugar que pega todos.
--
-- String vazia vira NULL de proposito: '' nao e um e-mail, e enquanto ele
-- existia a linha ficava FORA dos tres indices — nao colidia por e-mail (os
-- indices pedem `email is not null`) nem pela chave de empresa+nome logo
-- abaixo (que pede `email is null`). Era um buraco silencioso. Medido: 0 linhas
-- com '' hoje, entao a conversao nao mexe em nada existente.
create or replace function public.contatos_normalizar_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := nullif(btrim(lower(new.email)), '');
  return new;
end;
$$;

drop trigger if exists contatos_normalizar_email_trg on public.contatos;
create trigger contatos_normalizar_email_trg
  before insert or update of email on public.contatos
  for each row
  execute function public.contatos_normalizar_email();

-- 3) O INDICE QUE FALTAVA: lead SEM e-mail nao duplica mais.
--
-- A chave inclui o NOME, e isso e o ponto: duas PESSOAS diferentes na mesma
-- empresa continuam entrando normalmente (e o arquivo desta importacao tem 4
-- casos assim — BRF, Hershey, Tordilho, Advansat). O que passa a ser
-- fisicamente impossivel e a MESMA pessoa da MESMA empresa entrar duas vezes.
--
-- Sem empresa ou sem nome a linha fica de fora do indice, pelo mesmo motivo que
-- `chaveEmpresaNome` devolve vazio nesse caso: duas linhas pobres nao sao a
-- mesma pessoa, sao duas linhas pobres. Bloquear ai recusaria lead legitimo.
--
-- Medido antes de criar: 8 contatos sem e-mail, todos com empresa E nome, e 0
-- colisoes — o indice nasce sem precisar apagar nada.
create unique index if not exists ux_contatos_sem_email_empresa_nome
  on public.contatos (
    tenant_id,
    public.texto_chave(empresa),
    public.texto_chave(nome)
  )
  where email is null
    and public.texto_chave(empresa) is not null
    and public.texto_chave(nome) is not null;

comment on index public.ux_contatos_sem_email_empresa_nome is
  'Terceira chave de deduplicacao, para lead sem e-mail: mesma empresa + mesma '
  'pessoa nao entra duas vezes. Pessoas DIFERENTES na mesma empresa continuam '
  'entrando, porque a chave inclui o nome.';
