"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { ordenarPorCadencia, situacaoDoNegocio, type TomSituacao } from "@/lib/atividades";

/**
 * A fila da etapa, à esquerda do negócio aberto.
 *
 * É a resposta ao problema que a exploração chamou de "perda de contexto":
 * abrir um card era navegação de página inteira, o board desmontava e remontava
 * ao voltar. Aqui os vizinhos da mesma etapa ficam à mão, na mesma ordem do
 * board (ordenarPorCadencia), e trocar de negócio é um clique.
 *
 * O item aberto é o único branco — mesma regra do board: branco flutua sobre
 * o fundo rebaixado, o resto fica rente.
 */

const TOM_TEXTO: Record<TomSituacao, string> = {
  ok: "text-emerald-700",
  neutro: "text-tinta-suave",
  atencao: "text-amber-700",
  perigo: "text-rose-700",
};

export function FilaDaEtapa({
  etapa,
  negocios,
  negocioAbertoId,
}: {
  etapa: EtapaPipeline | null | undefined;
  negocios: NegocioComRelacoes[];
  negocioAbertoId: string;
}) {
  const aberto = useRef<HTMLAnchorElement>(null);

  // A fila segue a ordem do board (quem foi trabalhado hoje desce para o fim),
  // então o negócio aberto pode nascer fora da área visível.
  useEffect(() => {
    aberto.current?.scrollIntoView({ block: "nearest" });
  }, [negocioAbertoId]);

  const ordenados = ordenarPorCadencia(negocios);
  const total = negocios.reduce((acc, n) => acc + (n.valor || 0), 0);

  return (
    <aside
      aria-label={etapa ? `Fila da etapa ${etapa.nome}` : "Fila da etapa"}
      className="flex w-80 shrink-0 flex-col bg-recuo"
    >
      <div className="flex flex-col gap-2 px-4 pb-3 pt-5">
        <Link
          href="/"
          className="text-corpo flex w-fit items-center gap-2 font-medium text-tinta-suave transition-colors duration-150 ease-out hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Voltar ao pipeline
        </Link>

        <div className="mt-1 flex items-center gap-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: etapa?.cor || "var(--acento)" }}
          />
          <h2 className="text-titulo min-w-0 flex-1 truncate text-tinta">{etapa?.nome ?? "Sem etapa"}</h2>
          <span className="text-corpo tabular-nums font-medium text-tinta-suave">{negocios.length}</span>
        </div>
        <span className="text-corpo tabular-nums pl-3.5 text-tinta-fraca">
          {formatarMoeda(total)} nesta etapa
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-3">
        {ordenados.map((n) => {
          const ehAberto = n.id === negocioAbertoId;
          const situacao = situacaoDoNegocio(n);
          return (
            <Link
              key={n.id}
              href={`/negocios/${n.id}`}
              ref={ehAberto ? aberto : undefined}
              aria-current={ehAberto ? "page" : undefined}
              className={clsx(
                "flex flex-col gap-1.5 rounded-xl px-3.5 py-3",
                "transition-[background-color,box-shadow] duration-150 ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
                ehAberto ? "bg-cartao shadow-cartao" : "hover:bg-cartao/60",
              )}
            >
              <div className="flex items-baseline gap-2.5">
                <span className="text-corpo-lg min-w-0 flex-1 font-medium text-tinta">
                  {n.contato?.empresa || n.contato?.nome || n.titulo}
                </span>
                <span className="font-serif whitespace-nowrap text-base leading-none tabular-nums text-tinta">
                  {formatarMoeda(n.valor)}
                </span>
              </div>
              <span className="text-corpo truncate text-tinta-suave">
                {[n.contato?.nome, n.contato?.cargo].filter(Boolean).join(" · ") || "Sem contato"}
              </span>
              <span className={clsx("text-corpo truncate font-medium", TOM_TEXTO[situacao.tom])}>
                {situacao.texto}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
