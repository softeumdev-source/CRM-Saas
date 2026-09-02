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
type Tamanho = "sm" | "md";

const VARIANTE: Record<Variante, string> = {
  primario: "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800",
  secundario:
    "bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-200 " +
    "dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
  sutil:
    "text-slate-500 hover:bg-slate-100 hover:text-slate-800 " +
    "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
  perigo: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800",
};

const TAMANHO: Record<Tamanho, string> = {
  sm: "text-[11px] gap-1.5 rounded-lg px-3 py-1.5",
  md: "text-xs gap-2 rounded-xl px-4 py-2.5",
};

export interface BotaoProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  /** Troca o icone por um spinner e desabilita o botao. */
  carregando?: boolean;
  icone?: LucideIcon;
}

export function Botao({
  variante = "secundario",
  tamanho = "md",
  carregando = false,
  icone: Icone,
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
        "inline-flex items-center justify-center font-bold whitespace-nowrap",
        // transicoes nomeadas: nunca transition-colors duration-150 ease-out, que anima ate layout
        "transition-[background-color,color] duration-150 ease-out",
        // o projeto inteiro nao tinha um anel de foco sequer
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        "disabled:cursor-not-allowed disabled:opacity-60",
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
