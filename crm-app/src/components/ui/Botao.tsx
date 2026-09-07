import { Loader2, type LucideIcon } from "lucide-react";

/**
 * O botao primario estava copiado em 32 lugares, com 5 variantes divergentes
 * de peso, raio e sombra. Aqui ele existe uma vez, na mesma linguagem visual
 * do resto do app (slate + indigo, raio 12px).
 *
 * Duas coisas mudaram em relacao as copias, e sao de proposito:
 * - saiu o `shadow-indigo-600/20`: glow tingido e enfase emprestada, e o
 *   indigo solido ja carrega a acao sozinho;
 * - saiu o `transition-colors duration-150 ease-out`, que animava ate layout. As transicoes agora sao
 *   nomeadas.
 *
 * Sem "use client": nao ha estado. Herda a fronteira de quem importa.
 */

type Variante = "primario" | "secundario" | "sutil" | "perigo";
type Tamanho = "sm" | "md" | "lg";

/**
 * ACTIVE de verdade, e nao uma copia do hover.
 *
 * Eram dois furos diferentes. No mouse, `active` repetia a MESMA cor do hover
 * nas tres variantes cheias: apertar um botao que o cursor ja apontava nao
 * mudava um pixel, entao nao havia confirmacao de que o clique pegou. No toque
 * o furo e do `sutil`: o Tailwind v4 embrulha todo `hover:` num
 * `@media (hover: hover)`, e o `sutil` so tinha hover — no celular ele nao dava
 * sinal nenhum.
 *
 * A tabela dos cinco estados do DESIGN.md pede `scale-98` no primario e
 * `bg-recuo` no sutil. A escala e o unico sinal que funciona nos DOIS
 * ponteiros, entao ela vale para as quatro variantes; o `sutil` ganha tambem a
 * cor que a tabela pede, porque ele aparece dentro de `Abas` e `Segmentado`,
 * que ja sao `bg-recuo` — ali a cor some e so a escala responde.
 *
 * Escala nao e acento: continua sendo o indigo solido, e so ele, que diz
 * "acao".
 */
const VARIANTE: Record<Variante, string> = {
  primario:
    "bg-acento-solido text-acento-tinta hover:bg-acento-solido-hover active:bg-acento-solido-hover active:scale-98",
  secundario: "bg-recuo text-tinta hover:bg-fio active:bg-fio active:scale-98",
  sutil:
    "text-tinta-suave hover:bg-recuo hover:text-tinta active:bg-recuo active:text-tinta active:scale-98",
  perigo:
    "bg-risco-solido text-risco-tinta hover:bg-risco-solido-hover active:bg-risco-solido-hover active:scale-98",
};

/**
 * `pointer-coarse:min-h-11` em todos os tamanhos: 44px e o alvo de toque
 * minimo, e medido no navegador a 390px o `md` dava 36,8px e o `sm` 27px.
 * Num CRM isso importa mais do que a media: "Reconectar" e "Desconectar" ficam
 * COLADOS na tela de integracoes, e um dos dois e destrutivo — errar o dedo ali
 * desconecta a conta de alguem.
 *
 * A variante e por PONTEIRO, nao por largura: um monitor estreito nao vira
 * touch, e um tablet largo nao deixa de ser. No mouse a densidade continua a
 * mesma, que e o que um CRM cheio de lista precisa.
 */
const TAMANHO: Record<Tamanho, string> = {
  sm: "text-rotulo gap-1.5 rounded-lg px-2.5 py-1.5 pointer-coarse:min-h-11",
  md: "text-rotulo gap-2 rounded-xl px-4 py-2.5 pointer-coarse:min-h-11",
  // `lg` existe porque o botao primario de largura total estava redesenhado a
  // mao em quatro geometrias diferentes (gerar proposta, salvar contato,
  // inscrever na cadencia, convidar vendedor).
  lg: "text-corpo gap-2 rounded-xl px-5 py-3 pointer-coarse:min-h-11",
};

export interface BotaoProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  /** Troca o icone por um spinner e desabilita o botao. */
  carregando?: boolean;
  icone?: LucideIcon;
  larguraTotal?: boolean;
}

export function Botao({
  variante = "secundario",
  tamanho = "md",
  carregando = false,
  icone: Icone,
  larguraTotal = false,
  disabled,
  className = "",
  children,
  ...props
}: BotaoProps) {
  return (
    <button
      type={props.type ?? "button"}
      disabled={disabled || carregando}
      className={[
        // `font-semibold`, nao `font-bold`: o app tinha 372 usos de peso e
        // nenhum `font-normal`, entao o negrito nao distinguia mais nada.
        "inline-flex items-center justify-center font-semibold whitespace-nowrap",
        // Transicoes NOMEADAS: nunca `transition-all`, que anima ate layout.
        //
        // O terceiro nome e `scale`, e nao `transform`: no Tailwind v4 (4.3.3
        // neste repo) a classe `scale-98` compila para `scale: var(--tw-scale-x)
        // var(--tw-scale-y)` — propriedade propria, e nao um atalho de
        // `transform`. Medido no CSS de saida deste build. Com `transform` na
        // lista o pressionar saltaria seco, sem os 150ms.
        "transition-[background-color,color,scale] duration-150 ease-out",
        "foco",
        "disabled:cursor-not-allowed disabled:opacity-60",
        larguraTotal ? "w-full" : "",
        VARIANTE[variante],
        TAMANHO[tamanho],
        className,
      ].join(" ")}
      {...props}
    >
      {carregando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : Icone ? (
        <Icone className="h-3.5 w-3.5" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
