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

const VARIANTE: Record<Variante, string> = {
  primario:
    "bg-acento-solido text-acento-tinta hover:bg-acento-solido-hover active:bg-acento-solido-hover",
  secundario: "bg-recuo text-tinta hover:bg-fio active:bg-fio",
  sutil: "text-tinta-suave hover:bg-recuo hover:text-tinta",
  perigo:
    "bg-risco-solido text-risco-tinta hover:bg-risco-solido-hover active:bg-risco-solido-hover",
};

const TAMANHO: Record<Tamanho, string> = {
  sm: "text-rotulo gap-1.5 rounded-lg px-2.5 py-1.5",
  md: "text-rotulo gap-2 rounded-xl px-4 py-2.5",
  // `lg` existe porque o botao primario de largura total estava redesenhado a
  // mao em quatro geometrias diferentes (gerar proposta, salvar contato,
  // inscrever na cadencia, convidar vendedor).
  lg: "text-corpo gap-2 rounded-xl px-5 py-3",
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
        // transicoes nomeadas: nunca `transition-all`, que anima ate layout
        "transition-[background-color,color] duration-150 ease-out",
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
