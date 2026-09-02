import clsx from "clsx";
import { Loader2, type LucideIcon } from "lucide-react";

/**
 * O botao primario estava copiado em 32 lugares, com 5 variantes divergentes
 * de peso, raio e sombra. Aqui ele existe uma vez, falando so em tokens.
 *
 * Sem "use client": nao ha estado nem efeito. O arquivo herda a fronteira de
 * quem importa, entao serve a componente de servidor e de cliente.
 */

type Variante = "primario" | "secundario" | "sutil" | "perigo";
type Tamanho = "sm" | "md";

const VARIANTE: Record<Variante, string> = {
  // O escuro carrega a acao principal; o indigo fica para foco e link, para a
  // tela nao ter dois azuis disputando atencao.
  primario: "bg-tinta text-superficie hover:brightness-125 active:brightness-110",
  // Fundo rebaixado e nao branco-com-sombra: a maioria dos botoes vive DENTRO
  // de um cartao branco, e branco sobre branco simplesmente sumia. Sombra aqui
  // tambem seria errada — no Papel sombra quer dizer "flutua", e botao nao flutua.
  secundario: "bg-recuo text-tinta hover:bg-fio active:bg-fio",
  sutil: "text-tinta-suave hover:bg-recuo hover:text-tinta",
  perigo: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800",
};

const TAMANHO: Record<Tamanho, string> = {
  sm: "text-corpo gap-1.5 rounded-lg px-3 py-1.5",
  md: "text-corpo-lg gap-2 rounded-lg px-4 py-2",
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
        "transition-[background-color,filter,box-shadow] duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:brightness-100",
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
