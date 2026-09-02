import clsx from "clsx";
import { Loader2, type LucideIcon } from "lucide-react";

/**
 * O botao primario estava copiado em 32 lugares, com 5 variantes divergentes
 * de peso, raio e sombra. Aqui ele existe uma vez.
 *
 * Sem "use client": nao ha estado nem efeito. O arquivo herda a fronteira de
 * quem importa, entao serve tanto a componente de servidor (sem onClick)
 * quanto a de cliente.
 */

type Variante = "primario" | "secundario" | "sutil" | "perigo";
type Tamanho = "sm" | "md";

const VARIANTE: Record<Variante, string> = {
  primario:
    "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 " +
    "disabled:bg-indigo-600/50",
  secundario:
    "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 " +
    "border border-slate-200 dark:border-slate-700 " +
    "hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700",
  sutil:
    "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 " +
    "active:bg-slate-200 dark:active:bg-slate-700",
  perigo:
    "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-600/50",
};

const TAMANHO: Record<Tamanho, string> = {
  sm: "text-corpo px-3 py-1.5 gap-1.5 rounded-lg",
  md: "text-corpo px-4 py-2 gap-2 rounded-lg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  /** Troca o icone por um spinner e desabilita o botao. */
  carregando?: boolean;
  icone?: LucideIcon;
}

export function Button({
  variante = "secundario",
  tamanho = "md",
  carregando = false,
  icone: Icone,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={props.type ?? "button"}
      disabled={disabled || carregando}
      className={clsx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap",
        // transicoes nomeadas: nunca transition-all, que anima ate layout
        "transition-[background-color,border-color,color] duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTE[variante],
        TAMANHO[tamanho],
        className,
      )}
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
