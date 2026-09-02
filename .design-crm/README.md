# Direções visuais do CRM

Mockups apresentados para escolha da direção visual antes do redesign.
Publicado em: https://claude.ai/code/artifact/fff03606-ac58-4bfa-90d2-81015a55059d

## O que tem aqui

Duas escolhas independentes — qualquer letra combina com qualquer número.

**Kanban:**
- `Calmo.dc.html` — A: mantém a navegação atual, corrige só a tipografia
- `Main.dc.html` — B: barra lateral, colunas estreitas, mais densidade (recomendado)
- `Editorial.dc.html` — C: tipografia grande, muito espaço, menos cards por tela

**Card aberto:**
- `CardGaveta.dc.html` — gaveta por cima do board, que continua visível
- `CardDividido.dc.html` — fila da etapa à esquerda, detalhe à direita

`canvas.json` posiciona os quadros e carrega as notas com o argumento a favor
e o contra de cada opção.

## Dados

Empresas, nomes e valores são inventados. Os nomes de etapa e as contagens
por etapa são os reais do funil de produção; nenhum dado de cliente real
foi usado.

## Regerar

O HTML publicado é montado a partir destes arquivos pela skill `design`
(`seed-canvas.mjs`), e por isso não é versionado. Para mudar algo, edite os
`.dc.html` aqui e semeie de novo.
