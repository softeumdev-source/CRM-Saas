# Sistema de design — CRM Softeum

Os valores vivem em `src/app/globals.css`. Este arquivo diz **por que** e **como usar**.

## O diagnóstico que originou isto

Não era gosto. Era medição, em `src/components/`:

| Sintoma | Número |
|---|---|
| `font-bold` / `font-semibold` / `font-extrabold` / `font-medium` | 229 / 88 / 46 / 9 |
| `font-normal` | **0** |
| `dark:` escritos à mão | **774** |
| Raios diferentes em uso | 6 (`rounded-md` → `rounded-3xl`) |
| Paddings de cartão | 5 (`p-4`/`p-5`/`p-6`/`p-8`/`p-10`) |
| `focus-visible` em todo `src/components/admin/` | **1** |
| Mapas de cor concorrentes para a mesma escala | 3 |

Com **tudo** em negrito, o peso deixa de criar hierarquia — tudo grita no mesmo volume. É exatamente a sensação de "denso e estranho". E com 774 `dark:` à mão, o tema escuro era uma segunda paleta mantida em paralelo, que já tinha divergido.

## As regras

### Cor é token, nunca classe de paleta

```
❌  bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800
✅  bg-superficie border-fio
```

O tema escuro é a redefinição desses tokens num só lugar. **Cada `dark:` apagado durante a migração some sem levar o modo escuro junto** — é por isso que a migração é segura de fazer tela a tela.

| Papel | Token |
|---|---|
| Fundo da página | `bg-fundo` |
| Cartão / superfície | `bg-superficie` |
| Bloco recuado dentro de um cartão | `bg-recuo` |
| Fio (borda, divisória) | `border-fio`, `border-fio-forte` |
| Texto principal | `text-tinta` |
| Texto de apoio | `text-tinta-suave` |
| Texto terciário, ícone decorativo | `text-tinta-fraca` |
| Ação | `text-acento`, `bg-acento-fraco` |
| Estado | `ok` · `alerta` · `risco` · `info`, cada um com par `-fraco` |
| Preenchimento sólido (botão) | `bg-acento-solido` + `text-acento-tinta` |
| Véu atrás do modal | `bg-veu` |

O par sólido existe porque no escuro o acento **clareia** — texto branco sobre roxo claro perde contraste, então o botão inverte (fundo claro, tinta escura) em vez de ficar ilegível.

#### Contraste: os números, medidos

Todo texto do app é 12px ou 14px, ou seja **texto normal** para o WCAG: o piso é **4,5:1**, não os 3:1 de texto grande. A tabela é o pior caso de cada tinta — sobre `bg-recuo`, que é a superfície mais escura no claro e mais clara no escuro:

| Token | claro (fundo / cartão / recuo) | escuro (fundo / cartão / recuo) |
|---|---|---|
| `text-tinta` | 15,58 · 16,85 · 15,02 | 15,83 · 14,57 · 13,30 |
| `text-tinta-suave` | 5,79 · 6,26 · 5,58 | 8,18 · 7,53 · 6,87 |
| `text-tinta-fraca` | 4,77 · 5,16 · 4,60 | 5,89 · 5,42 · 4,95 |

**E os fundos TINGIDOS contam também.** `bg-acento-fraco` e companhia não são decoração: são fundo de balão de mensagem, de selo e de caixa de aviso — texto real fica em cima deles. Pior par de cada tinta sobre os cinco tingidos:

| Token | claro | escuro |
|---|---|---|
| `text-tinta` | 14,87 | 12,22 |
| `text-tinta-suave` | 5,52 | 6,31 |
| `text-tinta-fraca` | 4,55 | 4,54 |

`tinta-fraca` já reprovou **duas** vezes, e a segunda foi culpa da correção incompleta da primeira. Nasceu `#868f9c` / `#78818f` e dava 3,02 no claro. Virou `#666f7c` / `#818a98` — e aí o balão de mensagem enviada deu **4,49** no claro, e no escuro **quatro dos cinco tingidos** reprovaram (4,15 a 4,47). A medição tinha olhado as três superfícies e esquecido os tingidos.

Portanto: ao mexer em qualquer nível de tinta, **meça os OITO fundos** — `fundo`, `superficie`, `recuo` e os cinco `-fraco`. Medir só as superfícies é como esta regra nasceu errada duas vezes.

Os coloridos (`acento`, `ok`, `alerta`, `risco`, `info`) passam sobre `bg-superficie` e sobre o próprio par `-fraco` nos dois temas, do 4,76:1 (`ok` sobre `ok-fraco` no claro) para cima.

### Hierarquia vem de cor e tamanho, não de peso

Cinco tamanhos, piso de 12px (havia corpo de texto a 10px e 11px):

| Classe | Tamanho | Uso |
|---|---|---|
| `text-rotulo` | 12px | rótulo, selo, metadado |
| `text-corpo` | 14px | o padrão de tudo |
| `text-corpo-lg` | 16px | título de seção |
| `text-titulo` | 20px | título de tela |
| `text-display` | 28px | um número que é o assunto da tela |

Pesos permitidos: `font-normal` (padrão, **use-o**), `font-medium`, `font-semibold`. **`font-bold` e `font-extrabold` estão fora.** Se algo precisa de mais destaque, use `text-tinta` contra `text-tinta-suave`, ou suba um degrau de tamanho.

Número em coluna leva `tabular` (a utilidade), senão os dígitos dançam de linha para linha.

### Elevação é uma linguagem só

Fio para estrutura, sombra só para o que **flutua**. Não empilhe fio + sombra forte + mudança de fundo no mesmo elemento.

- `Cartao` → `border-fio` + `shadow-cartao` (quase imperceptível, dá só o descolamento)
- `Modal`, menu → `shadow-flutuante`

### Três raios, e só

`rounded-lg` (8px) para controles e selos · `rounded-xl` (12px) para campos e blocos internos · `rounded-2xl` (16px) para cartões e modais.

Os tokens de raio **não** foram redefinidos de propósito: sobrescrever `--radius-*` mudaria `rounded-lg` em 86 lugares de uma vez. A escala se estreita por revisão.

### Espaçamento

A escala de 4px do Tailwind. **Sem valor arbitrário** (`h-4.5`, `mt-[13px]`). O vão *dentro* de um grupo tem que ser visivelmente menor que o vão *entre* grupos — se forem iguais, o agrupamento some.

Sobraram três famílias de valor entre colchetes, e as três são deliberadas, não descuido:

- `transition-[background-color,color]` — é o **oposto** de descuido: nomear a propriedade é a regra de movimento logo abaixo.
- unidade que não é pixel — `max-w-[62ch]` (medida de leitura), `max-h-[90vh]`, `grid-cols-[1.4fr_1fr]`. A escala de 4px não fala essas línguas.
- `rounded-[10px]` do quadrado interno da logo: é o raio **concêntrico** (12px do `rounded-xl` de fora menos os 2px do `p-0.5`). Usar 8px abriria meia-lua em cada canto.

Duas larguras são token, e não número solto: `max-w-pagina` (1700px, a largura do app) e `max-w-leitura` (1100px, para tela em que se lê e se decide). A primeira estava escrita à mão em seis arquivos.

### Todo estado é desenhado

Todo elemento interativo tem `hover`, `focus-visible`, `active` e `disabled`. O anel de foco é a utilidade **`foco`** — uma classe, em vez de quatro `focus-visible:outline-*` copiadas (e esquecidas em 24 dos 30 inputs).

Medido: dos 92 `<button>` do app, **23** tinham anel de foco. Hoje são os 92. E não sobrou nenhum `focus-visible:outline-*` à mão — havia três em que a classe da COR tinha sumido na migração de paleta, ou seja, um anel de 2px na cor do texto, e ninguém tinha percebido. `outline-hidden`/`outline-none` só existe onde `foco` entra logo em seguida como substituto.

Toda superfície assíncrona tem **carregando**, **vazio** e **erro** desenhados. Use `Vazio`, que obriga a dizer o que fazer a seguir em vez de só "nenhum resultado".

### Movimento é física

120–250ms, `ease-out` para o que entra. Anime `transform` e `opacity`. **Nunca `transition-all`** — sempre a propriedade nomeada:

```
❌  transition-all duration-300
✅  transition-[background-color,color] duration-150 ease-out
```

`prefers-reduced-motion` já está tratado globalmente em `globals.css`.

### O que não fazer

1. **Sem gradiente.** Gradiente é a decisão de cor que não foi tomada. (Havia três: o cartão escuro da Visão Geral, a barra de prioridade do card, o hero do admin.)
2. **Sem glow.** Nada de `shadow-indigo-600/20` para "destacar". Destaque se ganha com tamanho, peso, contraste e espaço.
3. **Sem preto nem branco puro.** Sem degrau entre fundo e cartão, o cartão some.
4. **Sem `placeholder` como único rótulo.** Ele some quando a pessoa digita.
5. **Sem cor como única informação.** Ponto colorido sempre com `title` ou texto ao lado.
6. **Sem `<select>` sem borda que grava no `change`.** Era a troca de etapa acidental mais fácil do app.

## Os componentes

Importe **sempre** de `@/components/ui`, nunca do arquivo direto.

| Componente | Substitui |
|---|---|
| `Botao` (`primario`/`secundario`/`sutil`/`perigo` × `sm`/`md`/`lg`, `larguraTotal`, `carregando`) | o botão primário copiado 32× em 5 geometrias |
| `Cartao` / `Recuo` / `Rotulo` / `Apoio` / `Vazio` | a receita de cartão redigitada em toda tela |
| `Campo` + `Entrada` / `AreaTexto` / `Selecao` | 19 controles crus no admin; ids gerados por `useId()` |
| `Selo` / `Ponto` / `Alerta` | os 3 mapas de cor concorrentes |
| `Abas` + `PainelDaAba` + `useAbaNaUrl` | 4 grupos de abas sem `role="tablist"` nem estado na URL |
| `Modal` / `Confirmar` | modais à mão sem Escape, foco preso nem `aria-modal` |

`Selo` é nomeado pelo **significado** (`tom="risco"`), não pela cor: quando o vermelho mudar, o código que diz "risco" continua certo.

`useAbaNaUrl` grava com `history.replaceState`, **não** com o router: trocar de aba não é navegar, e `useSearchParams` obrigaria a envolver a árvore num `<Suspense>` sob pena de o build quebrar se a rota virar estática — e o doc desta versão do Next avisa que a falta do Suspense **passa despercebida em desenvolvimento** e só aparece no build de produção.

## Como migrar uma tela

1. Troque as cores por tokens e **apague os `dark:` daquela tela** (eles ficam corretos sozinhos).
2. Troque cartões/campos/botões/selos escritos à mão pelos componentes.
3. Baixe o peso: quase tudo vira `font-normal`; o título da seção vira `font-semibold`.
4. Colapse os raios para os três permitidos.
5. Confira `hover`, `focus-visible`, `disabled`, vazio e erro.

Uma tela migrada não deve sobrar nenhum `dark:`, nenhum `slate-`, nenhum `indigo-`.
