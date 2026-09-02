"use client";

import clsx from "clsx";

/**
 * O controle segmentado aparecia em 4 telas, escrito a mao nas 4, e ja tinha
 * divergido em raio, peso e cor do item ativo. Aqui ele existe uma vez.
 *
 * Aceita contagem por opcao porque foi assim que a linha de "cards de resumo"
 * do kanban desapareceu: os numeros que estavam la eram exatamente os desses
 * filtros, so que sem poder clicar.
 *
 * Precisa de "use client": tem onChange.
 */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoTrocar,
  rotulo,
  className,
}: {
  opcoes: { chave: T; label: string; contagem?: number }[];
  valor: T;
  aoTrocar: (chave: T) => void;
  /** Descreve o grupo para leitor de tela, ex.: "Filtrar por situação". */
  rotulo: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={clsx("inline-flex items-center gap-0.5 rounded-lg bg-recuo p-0.5", className)}
    >
      {opcoes.map((o) => {
        const ativo = o.chave === valor;
        return (
          <button
            key={o.chave}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoTrocar(o.chave)}
            className={clsx(
              "text-corpo flex items-center gap-1.5 rounded-md px-2.5 py-1.5 whitespace-nowrap",
              "transition-[background-color,color,box-shadow] duration-150 ease-out",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acento",
              ativo
                ? "bg-cartao font-medium text-tinta shadow-cartao"
                : "text-tinta-suave hover:text-tinta",
            )}
          >
            {o.label}
            {o.contagem !== undefined && (
              <span
                className={clsx(
                  "tabular-nums",
                  ativo ? "text-tinta-suave" : "text-tinta-fraca",
                )}
              >
                {o.contagem}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
