"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import clsx from "clsx";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { ordenarPorCadencia } from "@/lib/atividades";
import { LeadCard } from "@/components/LeadCard";

/**
 * O board no estilo Papel. A coluna tem fundo rebaixado (--recuo) e e isso que
 * faz o card branco sem contorno continuar destacado num board cheio — foi a
 * duvida testada no mockup antes de virar codigo.
 *
 * A cor da etapa ficou num ponto de 6px em vez de tingir a coluna inteira:
 * sete fundos coloridos lado a lado brigavam com os cards.
 *
 * A cadeia h-full/min-h-0 e o que faz cada coluna rolar por dentro em vez de
 * esticar o board. Nao mexer sem conferir rolando.
 */
export function KanbanBoard({
  etapas,
  negocios,
  onNovoNegocio,
  onMoverNegocio,
}: {
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
  onNovoNegocio: (etapaId: string) => void;
  onMoverNegocio: (negocioId: string, etapaId: string) => void;
}) {
  const [etapaAlvo, setEtapaAlvo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const soltar = (e: React.DragEvent, etapaId: string) => {
    e.preventDefault();
    setEtapaAlvo(null);
    setArrastando(null);
    const negocioId = e.dataTransfer.getData("text/plain");
    if (!negocioId) return;
    onMoverNegocio(negocioId, etapaId);
  };

  return (
    <div className="min-h-0 flex-1 overflow-x-auto px-4 pb-6 sm:px-6">
      <div className="flex h-full min-w-max gap-3.5">
        {etapas.map((etapa) => {
          const daEtapa = ordenarPorCadencia(negocios.filter((n) => n.etapa_id === etapa.id));
          const total = daEtapa.reduce((acc, n) => acc + (n.valor || 0), 0);
          const alvo = etapaAlvo === etapa.id;

          return (
            <section
              key={etapa.id}
              aria-label={etapa.nome}
              onDragOver={(e) => {
                e.preventDefault();
                if (etapaAlvo !== etapa.id) setEtapaAlvo(etapa.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setEtapaAlvo(null);
              }}
              onDrop={(e) => soltar(e, etapa.id)}
              className={clsx(
                "flex h-full max-h-full w-66 shrink-0 flex-col rounded-2xl bg-recuo",
                "transition-[outline-color] duration-150 ease-out",
                // outline em vez de ring com offset: nao desloca o layout do
                // vizinho enquanto o card esta sendo arrastado
                "outline-2 -outline-offset-2",
                alvo ? "outline-acento" : "outline-transparent",
              )}
            >
              <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: etapa.cor || "var(--acento)" }}
                  />
                  <h2 className="text-titulo min-w-0 flex-1 truncate text-tinta">{etapa.nome}</h2>
                  <span className="text-corpo tabular-nums font-medium text-tinta-suave">
                    {daEtapa.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNovoNegocio(etapa.id)}
                    aria-label={`Novo negócio em ${etapa.nome}`}
                    title={`Novo negócio em ${etapa.nome}`}
                    className="-mr-1 shrink-0 rounded-md p-1 text-tinta-fraca transition-colors duration-150 ease-out hover:bg-cartao hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                {/* A probabilidade e da etapa, nao do negocio: e copiada dela em
                    todo insert e em todo movimento. Aqui ela descreve a coluna. */}
                <span className="text-corpo tabular-nums pl-3.5 text-tinta-fraca">
                  {formatarMoeda(total)}
                  {etapa.probabilidade != null && ` · ${etapa.probabilidade}% de fechamento`}
                </span>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5">
                {daEtapa.length === 0 ? (
                  <p className="text-corpo rounded-xl border border-dashed border-fio px-3 py-8 text-center text-tinta-fraca">
                    {alvo ? "Solte aqui" : "Nenhum negócio nesta etapa"}
                  </p>
                ) : (
                  daEtapa.map((negocio) => (
                    <div
                      key={negocio.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", negocio.id);
                        e.dataTransfer.effectAllowed = "move";
                        setArrastando(negocio.id);
                      }}
                      onDragEnd={() => {
                        setArrastando(null);
                        setEtapaAlvo(null);
                      }}
                      className={clsx(
                        "cursor-grab transition-opacity duration-150 ease-out active:cursor-grabbing",
                        arrastando === negocio.id && "opacity-40",
                      )}
                    >
                      <LeadCard negocio={negocio} />
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
