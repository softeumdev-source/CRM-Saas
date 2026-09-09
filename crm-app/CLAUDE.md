@AGENTS.md

# Entregar significa: no ar, funcionando

Não pergunte se deve abrir PR nem se deve fazer merge. Não existe "está na
branch, me avise se quiser publicar" — isso não é uma entrega, é trabalho
parado. Leve a tarefa pedida até produção e só então diga que está pronta.

O caminho inteiro, sempre:

1. Desenvolver na branch designada.
2. Validar (ver abaixo) — este repositório **não tem CI**, então o que não for
   verificado aqui chega quebrado no ar.
3. Commitar, fazer merge em `main` e `git push -u origin main`.
4. Aplicar as migrations no Supabase (ver abaixo).
5. Confirmar que o deploy de produção ficou `READY` antes de dizer que acabou.

Isto vale para o que foi pedido. Ação destrutiva ou fora do escopo pedido
(apagar dados, mexer em quem não pediram) continua pedindo confirmação.

## Validar antes de todo push

Os três, limpos, sem exceção:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Migrations não bastam no repositório

O app lê etapas, funis e regras do BANCO. Uma migration só commitada não muda
nada para quem usa o sistema: aplique também no projeto Supabase
`softeum-crm` (ref `gvdiyeomfprevxhgdynw`), e confira o resultado com um
`select` depois — não confie no "success".

O contrário também vale: nunca aplique SQL no banco sem deixar o arquivo em
`supabase/migrations/`. O ledger (`supabase_migrations.schema_migrations`) já
divergiu do repositório por causa disso.

Mudança só de dados/schema (uma coluna nova, uma etapa nova) chega ao ar assim
que aplicada no Supabase, sem deploy. Mudança de código só chega com o push em
`main`. Não confunda os dois ao dizer o que já está valendo.

## Onde isto roda

- Produção: `main` → Vercel (projeto `crm-saas`) → <https://crm.softeum.com.br>
- Cada branch gera preview automático; preview tem proteção SSO da Vercel.
- Região `gru1`. Os cron jobs vivem no Postgres (`pg_cron`), não na Vercel, e
  chamam o app de volta por `pg_net` usando `app_url` do Vault.
