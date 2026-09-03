"use client";

import { useState } from "react";
import { Plus, Layers, CheckCircle2, AlertTriangle } from "lucide-react";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { estaAtrasada, ordenarPorCadencia, proximaAtividade, temAtividadeHoje } from "@/lib/atividades";
import { LeadCard, type VarianteDoCard } from "@/components/LeadCard";

export function KanbanBoard({
  etapas,
  negocios,
  variante = "vendas",
  totaisPorEtapa,
  carregadosPorEtapa,
  carregandoMais,
  onCarregarMais,
  onNovoNegocio,
  onMoverNegocio,
}: {
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
  /** Qual board e este. Vem de `pipeline.chave`, nao de adivinhacao. */
  variante?: VarianteDoCard;
  /** Quantos existem no banco por etapa — pode ser mais do que está carregado. */
  totaisPorEtapa: Record<string, number>;
  /** Quantos estão carregados por etapa, ANTES dos filtros de busca/foco. */
  carregadosPorEtapa: Record<string, number>;
  carregandoMais: boolean;
  onCarregarMais: () => void;
  onNovoNegocio: (etapaId: string) => void;
  onMoverNegocio: (negocioId: string, etapaId: string) => void;
}) {
  const [etapaAlvo, setEtapaAlvo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const handleDrop = (e: React.DragEvent, etapaId: string) => {
    e.preventDefault();
    setEtapaAlvo(null);
    setArrastando(null);
    const negocioId = e.dataTransfer.getData("text/plain");
    if (!negocioId) return;
    onMoverNegocio(negocioId, etapaId);
  };

  return (
    <div className="flex-1 min-h-0 overflow-x-auto pb-6 pt-4 px-4 sm:px-6">
      <div className="flex gap-4 min-w-max h-full">
        {etapas.map((etapa) => {
          const doEtapa = ordenarPorCadencia(negocios.filter((n) => n.etapa_id === etapa.id));
          const totalValor = doEtapa.reduce((acc, n) => acc + (n.valor || 0), 0);
          const trabalhadosHoje = doEtapa.filter((n) => temAtividadeHoje(n)).length;
          const atrasados = doEtapa.filter((n) => estaAtrasada(proximaAtividade(n.atividades_pendentes)?.data_agendada)).length;
          const cor = etapa.cor || "#6366f1";
          const alvo = etapaAlvo === etapa.id;
          // Três números diferentes, e confundi-los é o que faz um board
          // mentir: `total` é quanto existe no banco, `carregados` é quanto
          // veio nesta fatia, e `doEtapa.length` é quanto sobrou depois da
          // busca e do foco. "Faltam" tem que sair dos dois primeiros — se
          // saísse do filtrado, digitar qualquer busca faria toda coluna pedir
          // "ver mais".
          const total = totaisPorEtapa[etapa.id] ?? doEtapa.length;
          const carregados = carregadosPorEtapa[etapa.id] ?? doEtapa.length;
          const faltam = Math.max(0, total - carregados);
          const filtrando = doEtapa.length !== carregados;

          return (
            <div
              key={etapa.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (etapaAlvo !== etapa.id) setEtapaAlvo(etapa.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setEtapaAlvo(null);
              }}
              onDrop={(e) => handleDrop(e, etapa.id)}
              className={`w-[320px] shrink-0 flex flex-col rounded-2xl border p-3.5 h-full max-h-full transition-colors duration-150 ease-out ${
                alvo ? "ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-slate-950" : ""
              }`}
              style={{ borderColor: cor + "40", background: cor + (alvo ? "1f" : "0a") }}
            >
              <div className="mb-3 pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{etapa.nome}</h2>
                    <span
                      className="px-2 py-0.5 text-xs font-bold rounded-full shrink-0"
                      style={{ background: cor + "22", color: cor }}
                      title={
                        filtrando
                          ? `${doEtapa.length} de ${carregados} carregados (${total} no total)`
                          : faltam > 0
                            ? `${carregados} carregados de ${total}`
                            : undefined
                      }
                    >
                      {filtrando ? doEtapa.length : faltam > 0 ? `${carregados}/${total}` : total}
                    </span>
                  </div>
                  <button
                    onClick={() => onNovoNegocio(etapa.id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 dark:hover:bg-slate-800 transition-colors duration-150 ease-out shrink-0"
                    title={`Adicionar negócio em ${etapa.nome}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Valor na etapa:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{formatarMoeda(totalValor)}</span>
                </div>
                {doEtapa.length > 0 && (
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title="Negócios com atividade registrada hoje">
                      <CheckCircle2 className="h-3 w-3" /> {trabalhadosHoje} hoje
                    </span>
                    {atrasados > 0 && (
                      <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400" title="Negócios com próximo passo atrasado">
                        <AlertTriangle className="h-3 w-3" /> {atrasados} atrasado{atrasados > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
                {doEtapa.length === 0 ? (
                  <div className="h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center p-4 text-center">
                    <Layers className="h-6 w-6 text-slate-300 dark:text-slate-600 mb-1" />
                    <p className="text-xs text-slate-400 font-medium">Nenhum negócio nesta etapa</p>
                  </div>
                ) : (
                  doEtapa.map((negocio) => (
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
                      className={`cursor-grab active:cursor-grabbing transition-opacity ${
                        arrastando === negocio.id ? "opacity-40" : ""
                      }`}
                    >
                      <LeadCard negocio={negocio} variante={variante} />
                    </div>
                  ))
                )}

                {faltam > 0 && (
                  <button
                    onClick={onCarregarMais}
                    disabled={carregandoMais}
                    className="w-full py-2 text-[11px] font-bold text-slate-500 hover:text-indigo-600 bg-white/70 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl transition-colors duration-150 ease-out disabled:opacity-60"
                  >
                    {carregandoMais ? "Carregando…" : `Ver mais ${faltam > 50 ? 50 : faltam}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
