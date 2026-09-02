import clsx from "clsx";

/**
 * Havia tres mapas de cor concorrentes codificando a MESMA escala semantica de
 * tres jeitos diferentes — prioridade do lead, status da proposta e status da
 * importacao. Aqui a escala existe uma vez, e cada dominio mapeia para ela.
 *
 * No estilo Papel o selo e fundo tingido sem contorno: contorno e ruido quando
 * ja existe cor de fundo.
 */

export type Tom = "neutro" | "sucesso" | "atencao" | "perigo" | "info";

const TOM: Record<Tom, string> = {
  neutro: "bg-stone-100 text-stone-600",
  sucesso: "bg-emerald-50 text-emerald-700",
  atencao: "bg-amber-50 text-amber-700",
  perigo: "bg-rose-50 text-rose-700",
  info: "bg-indigo-50 text-indigo-700",
};

export function Badge({
  tom = "neutro",
  className,
  children,
}: {
  tom?: Tom;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "text-corpo font-medium whitespace-nowrap",
        TOM[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Prioridade do negocio (era PRIORIDADE_COR em LeadCard). */
export const TOM_PRIORIDADE: Record<string, Tom> = {
  alta: "perigo",
  media: "atencao",
  baixa: "neutro",
};

/** O valor gravado no banco e sem acento; capitalize por CSS dava "Media". */
export const ROTULO_PRIORIDADE: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Status da proposta (era STATUS_COR em PropostaTab). */
export const TOM_PROPOSTA: Record<string, Tom> = {
  rascunho: "neutro",
  enviada: "atencao",
  assinada: "sucesso",
  cancelada: "perigo",
};

/** Classificacao da linha na importacao (era COR_STATUS em LeadsTab). */
export const TOM_IMPORTACAO: Record<string, Tom> = {
  novo: "sucesso",
  existe: "neutro",
  dup_arquivo: "neutro",
  sem_nome: "atencao",
  email_invalido: "perigo",
};
