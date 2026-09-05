# Sistema de design — CRM Softeum

Direção: **Linear / Vercel — mínimo e preciso**, em tema claro.
Densidade: **a de hoje** (nada sai do card, nada encolhe).
Movimento: **L2 — fluido**.

Os valores vivem em `src/app/globals.css`. Este arquivo diz **por que** e **como usar**.

---

## 1. Tema visual e atmosfera

Uma parede branca de museu com uma linha de texto. O CRM é uma **ferramenta de
trabalho de oito horas por dia**, não uma vitrine: a interface recua para que o
funil, os nomes das empresas e os números apareçam.

A régua é o Linear: um sistema quase inteiramente **acromático** — neutros frios
e tinta — pontuado por **um único acento**, que só aparece onde há ação. A
hierarquia não vem de cor nem de moldura: vem de **tamanho, peso e espaço**. Fio
de 1px para estrutura, sombra só para o que flutua, e nada de gradiente, brilho
ou enfeite.

**Palavras-chave**: preciso · silencioso · denso · confiável · sem enfeite.

**A frase que decide as dúvidas**: *se um elemento não ajuda a decidir com qual
negócio mexer agora, ele recua* — recua, não some.

### O que MUDA nesta revisão, e o que NÃO muda

| Muda | Não muda |
|---|---|
| Os neutros (mais frios, fio mais fino) | A densidade: nenhum card encolhe |
| A tipografia (Inter com `cv01`/`ss03`, pesos 400/510/590) | O conteúdo: nada sai de tela nenhuma |
| O alinhamento e o ritmo vertical | A estrutura: nenhuma tela é reorganizada |
| O movimento sobe de L1 para L2 | Os tokens semânticos (`ok`/`alerta`/`risco`/`info`) |

---

## 2. Paleta e papéis

Cor é **token**, nunca classe de paleta. O tema escuro é a redefinição destes
mesmos tokens num lugar só.

```
❌  bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800
✅  bg-superficie border-fio
```

### Superfícies e tinta — tema claro

| Papel | Token | Hex | RGB |
|---|---|---|---|
| Fundo da página | `--cor-fundo` | `#fafafa` | `250 250 250` |
| Cartão / superfície | `--cor-superficie` | `#ffffff` | `255 255 255` |
| Bloco recuado | `--cor-recuo` | `#f4f4f5` | `244 244 245` |
| Fio (borda, divisória) | `--cor-fio` | `#e8e8ea` | `232 232 234` |
| Fio forte (hover, ênfase) | `--cor-fio-forte` | `#d4d4d8` | `212 212 216` |
| Texto principal | `--cor-tinta` | `#18181b` | `24 24 27` |
| Texto de apoio | `--cor-tinta-suave` | `#52525b` | `82 82 91` |
| Texto terciário | `--cor-tinta-fraca` | `#63636d` | `99 99 109` |

Os neutros são **frios e da mesma família** (escala zinc), como manda o craft R7:
nada de branco puro no fundo, nada de preto puro na tinta, e nenhum cinza de
temperatura diferente entrando por acidente.

### Ação e estado

| Papel | Token | Claro | Escuro |
|---|---|---|---|
| Ação (texto, ícone) | `acento` | `#4f46e5` | `#8b86f8` |
| Ação (fundo tênue) | `acento-fraco` | `#eef0fe` | `#211f45` |
| Botão preenchido | `acento-solido` + `acento-tinta` | `#4f46e5` / `#ffffff` | `#7d78f2` / `#14142b` |
| Sucesso | `ok` / `ok-fraco` | `#0e7a51` / `#e6f5ee` | `#46c48d` / `#102f22` |
| Atenção | `alerta` / `alerta-fraco` | `#96600a` / `#fdf3e1` | `#e0a63c` / `#33260c` |
| Risco | `risco` / `risco-fraco` | `#b22440` / `#fdeef1` | `#f2718c` / `#3a1520` |
| Informação | `info` / `info-fraco` | `#0a6d9c` / `#e7f3fa` | `#57b3e0` / `#0d2937` |
| Véu do modal | `veu` | `rgb(12 15 20 / .55)` | `rgb(4 6 10 / .68)` |

O par sólido existe porque no escuro o acento **clareia**: texto branco sobre
roxo claro perde contraste, então o botão inverte em vez de ficar ilegível.

**O acento aparece SÓ onde há ação.** Um dado que não se clica nunca é indigo.

### Contraste: a regra que já nasceu errada duas vezes

Todo texto do app é 12px ou 14px — **texto normal** para o WCAG, piso de
**4,5:1**. E os fundos TINGIDOS contam: `acento-fraco` e companhia são fundo de
balão, de selo e de caixa de aviso, com texto real em cima.

> Ao mexer em **qualquer** nível de tinta, meça os **OITO** fundos: `fundo`,
> `superficie`, `recuo` e os cinco `-fraco`. Medir só as três superfícies é como
> esta regra nasceu errada — duas vezes. A segunda foi culpa da correção
> incompleta da primeira: `tinta-fraca` passou nas superfícies e reprovou em
> **quatro dos cinco tingidos** no escuro (4,15 a 4,47).

Toda mudança de neutro é acompanhada de uma nova medição dos oito pares, nos
dois temas, registrada aqui antes de subir.

---

## 3. Tipografia

### Família

```css
--font-sans: var(--font-inter), "SF Pro Display", -apple-system, system-ui,
             "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
```

A Inter vem do `next/font/google` sem `weight` declarado, ou seja **variável**:
os pesos 510 e 590 existem de verdade, não são arredondados.

**As features OpenType são a identidade, não enfeite:**

```css
body { font-feature-settings: "cv01", "ss03"; }
```

`cv01` troca o `a` de dois andares pelo de um andar; `ss03` ajusta letras para um
desenho mais geométrico. É o que separa "usei Inter" de "desenhei com Inter" — e
é a mudança mais visível desta revisão, sem mexer em um pixel de layout.

### Escala — cinco tamanhos, piso de 12px

| Classe | Tamanho | Entrelinha | Espacejamento | Uso |
|---|---|---|---|---|
| `text-rotulo` | 12px | 1.4 | +0.01em | rótulo, selo, metadado |
| `text-corpo` | 14px | 1.55 | normal | o padrão de tudo |
| `text-corpo-lg` | 16px | 1.5 | normal | título de seção |
| `text-titulo` | 20px | 1.3 | **−0.022em** | título de tela |
| `text-display` | 28px | 1.15 | **−0.022em** | um número que é o assunto |

**Compressão na escala**: quanto maior o tamanho, mais apertado o espacejamento
(−0.022em a partir de 20px, normal abaixo de 16px). É o que faz um número grande
ler como engenharia e não como cartaz.

### Pesos — três, e só três

| Peso | Papel |
|---|---|
| **400** | leitura. O padrão. Use-o. |
| **510** | ênfase de interface: rótulo, botão, nome numa lista |
| **590** | ênfase forte: título de seção, o número que é o assunto |

510 e 590, e não 500 e 600: são os pesos do Linear e existem porque a Inter
variável os tem. 510 dá o "levemente destacado" sem o volume do medium; 590 dá
autoridade sem o peso do bold.

**`font-bold` e `font-extrabold` estão fora.** Se algo precisa de mais destaque,
use `text-tinta` contra `text-tinta-suave`, ou suba um degrau de tamanho.

Número em coluna leva `tabular`, senão os dígitos dançam de linha para linha.

---

## 4. Componentes e seus estados

Importe **sempre** de `@/components/ui`, nunca do arquivo direto.

| Componente | Substitui |
|---|---|
| `Botao` (`primario`/`secundario`/`sutil`/`perigo` × `sm`/`md`/`lg`) | o botão primário copiado 32× em 5 geometrias |
| `Cartao` / `Recuo` / `Rotulo` / `Apoio` / `Vazio` | a receita de cartão redigitada em toda tela |
| `Campo` + `Entrada` / `AreaTexto` / `Selecao` | 19 controles crus no admin; ids por `useId()` |
| `Selo` / `Ponto` / `Alerta` | os 3 mapas de cor concorrentes |
| `Abas` + `PainelDaAba` + `useAbaNaUrl` | 4 grupos de abas sem `role="tablist"` |
| `Modal` / `Confirmar` | modais à mão sem Escape, foco preso nem `aria-modal` |

### Os cinco estados, obrigatórios

Nenhum elemento interativo entra no app sem os cinco:

| Estado | Botão primário | Botão sutil | Campo | Cartão clicável |
|---|---|---|---|---|
| **default** | `bg-acento-solido text-acento-tinta` | `text-tinta-suave` | `border-fio bg-superficie` | `border-fio bg-superficie shadow-cartao` |
| **hover** | `bg-acento-solido-hover` | `text-tinta bg-recuo` | `border-fio-forte` | `border-fio-forte` |
| **focus-visible** | `foco` | `foco` | `foco` | `foco` |
| **active** | `scale-98` | `bg-recuo` | — | `scale-99` |
| **disabled** | `opacity-60` | `opacity-60` | `opacity-60 bg-recuo` | — |

`foco` é **uma utilidade**, não quatro classes copiadas:

```css
@utility foco {
  &:focus-visible { outline: 2px solid var(--cor-acento); outline-offset: 2px; }
}
```

Medido: dos 92 `<button>` do app, **23** tinham anel de foco. Hoje são os 92.

Toda superfície assíncrona tem **carregando**, **vazio** e **erro** desenhados.
Use `Vazio`, que obriga a dizer o que fazer a seguir.

`Selo` é nomeado pelo **significado** (`tom="risco"`), não pela cor: quando o
vermelho mudar, o código que diz "risco" continua certo.

---

## 5. Layout e espaçamento

### Grades e larguras

| Token | Valor | Uso |
|---|---|---|
| `max-w-pagina` | 1700px | a largura do app (navbar, boards, lista, admin) |
| `max-w-leitura` | 1100px | tela em que se lê e se decide (quarentena) |
| medida de texto | 62–75ch | parágrafo corrido nunca passa disso |

**Nunca `justify-between` num contêiner largo para distribuir.** Ele não
distribui: joga as pontas para longe e cava um vão no meio. Medido num viewport
de 1790px, o valor do funil terminava em 420px e o primeiro indicador começava em
1320px — **900px de nada**, a maior região vazia da tela. Linha larga corre da
esquerda para a direita e termina onde o conteúdo termina.

### Espaçamento

A escala de 4px do Tailwind. **Sem valor arbitrário** (`h-4.5`, `mt-[13px]`).

O vão *dentro* de um grupo tem que ser visivelmente menor que o vão *entre*
grupos — se forem iguais, o agrupamento some.

Três famílias de valor entre colchetes são deliberadas e ficam:

- `transition-[background-color,color]` — nomear a propriedade É a regra.
- unidade que não é pixel: `max-w-[62ch]`, `max-h-[90vh]`, `grid-cols-[1.4fr_1fr]`.
- `rounded-[10px]` do quadrado interno da logo: é o raio **concêntrico** (12px do
  `rounded-xl` de fora menos os 2px do `p-0.5`).

### Três raios, e só

`rounded-lg` (8px) controles e selos · `rounded-xl` (12px) campos e blocos
internos · `rounded-2xl` (16px) cartões e modais.

---

## 6. Elevação

Fio para estrutura, sombra só para o que **flutua**. Não empilhe fio + sombra
forte + mudança de fundo no mesmo elemento.

```css
--sombra-cartao:    0 1px 2px rgb(16 20 28 / 0.04);   /* escuro: rgb(0 0 0 / .30) */
--sombra-flutuante: 0 4px 6px -2px rgb(16 20 28 / 0.06),
                    0 12px 24px -6px rgb(16 20 28 / 0.10);
```

- `Cartao` → `border-fio` + `shadow-cartao` (quase imperceptível)
- `Modal`, menu → `shadow-flutuante`

**Duas sombras, e só duas.** `shadow-md`, `shadow-lg` e `shadow-xs` do Tailwind
estão fora: são uma terceira linguagem, e nenhuma tem versão para o tema escuro —
`shadow-cartao` tem.

---

## 7. Movimento — nível L2

120–250ms, `ease-out` para o que entra, `ease-in` para o que sai. Anime
`transform` e `opacity`. **Nunca `transition-all`** — sempre a propriedade
nomeada.

```
❌  transition-all duration-300
✅  transition-[background-color,color] duration-150 ease-out
```

### O que L2 acrescenta ao que já existe

| Onde | Efeito | Implementação |
|---|---|---|
| Barra do topo | ganha fio inferior e sombra ao rolar | `IntersectionObserver` num sentinela de 1px |
| Cartões e linhas de lista | entram com `fadeInUp` de 12px, cascata de 40ms | `IntersectionObserver`, dispara uma vez |
| Troca de aba | conteúdo entra com `opacity 0→1` + `translateY 4px`, 160ms | CSS puro |
| Coluna do kanban ao arrastar | superfície tinge, fio marca o alvo | já existe |
| Botão em `active` | `scale(0.98)` | já existe |

**Nada roda em laço, nada toca sozinho, nada faz bounce.** Um CRM aberto oito
horas por dia não pode ter movimento que chame atenção depois da primeira vez.

**Sem GSAP, sem Lenis, sem ScrollTrigger.** L2 aqui é `IntersectionObserver` +
CSS: zero dependência nova e zero risco de travar a rolagem do board.

### Redução de movimento

Experiência **reduzida**, não quebrada — os elementos aparecem no lugar final,
sem transição:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 8. O que fazer e o que não fazer

### Fazer

1. **Cor sempre por token.** Uma tela migrada não tem `slate-`, `indigo-` nem `dark:`.
2. **Hierarquia por tamanho e cor antes de peso.** `text-tinta` contra `text-tinta-suave` resolve quase tudo.
3. **Um elemento por tela com permissão de ser grande.** Um `text-display` por tela, e ele é o número que é o assunto.
4. **Sinal só quando varia.** Um aviso presente em 100% dos itens não é aviso: é ruído que treina a pessoa a ignorar a cor.
5. **Medir antes de opinar.** Toda afirmação sobre o app vem de uma contagem no código ou de uma consulta no banco.
6. **Olhar a tela renderizada antes de mandar para produção.** Se o ambiente não alcança o app, monte uma página de prova descartável, tire screenshot — e apague-a antes do commit.

### Não fazer

7. **Sem gradiente.** Gradiente é a decisão de cor que não foi tomada.
8. **Sem glow.** Nada de `shadow-indigo-600/20` para "destacar". Destaque se ganha com tamanho, peso, contraste e espaço.
9. **Sem preto nem branco puro.** Sem degrau entre fundo e cartão, o cartão some.
10. **Sem `placeholder` como único rótulo.** Ele some quando a pessoa digita.
11. **Sem cor como única informação.** Ponto colorido sempre com `title` ou texto ao lado.
12. **Sem `<select>` sem borda que grava no `change`.** Era a troca de etapa acidental mais fácil do app. Use `Campo` + `Selecao`.
13. **Sem `justify-between` para distribuir num contêiner largo.** Ver §5.
14. **Sem tirar informação em nome de limpeza.** Densidade é decisão do dono do produto, não do designer. Se um card está pesado, o conserto é cor, peso e alinhamento — não deletar o que ele diz.

> A 14 é a regra mais importante desta revisão, e ela existe porque eu quebrei:
> esvaziei o card do board de seis sinais para um, e foi rejeitado. Estava
> tecnicamente defensável e mesmo assim errado — a densidade não estava em
> discussão.

---

## 9. Responsivo

| Faixa | Comportamento |
|---|---|
| `< 640px` | navbar vira fileira rolável; board mostra uma coluna e um naco da seguinte; agenda mostra **3 dias**; grades de 2 colunas viram 1 |
| `640–1024px` (`sm`/`md`) | 2 colunas nos formulários; board rola na horizontal; cabeçalhos quebram em duas linhas |
| `> 1024px` (`lg`) | layout cheio, `max-w-pagina` centralizado |

**Alvos de toque**: `pointer-coarse:min-h-11` (44px) em todo controle do board e
da agenda. Ponteiro fino não paga esse imposto de altura.

**Sem estouro horizontal em nenhuma largura.** Conteúdo largo (tabela, board,
bloco de código) rola dentro do próprio contêiner com `overflow-x-auto`; o
`<body>` nunca rola para o lado.

---

## Como migrar uma tela

1. Troque as cores por tokens e **apague os `dark:` daquela tela**.
2. Troque cartões/campos/botões/selos escritos à mão pelos componentes.
3. Ajuste o peso: quase tudo é 400; rótulo e botão são 510; título de seção é 590.
4. Colapse os raios para os três permitidos.
5. Confira os cinco estados, mais vazio e erro.
6. **Renderize e olhe.** Sem isso, do passo 1 ao 5 é fé.
