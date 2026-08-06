"use client";

import { useEffect, useState } from "react";
import { Plus, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { LeadCard } from "@/components/LeadCard";

export function KanbanBoard({
  etapas,
  negociosIniciais,
  onNovoNegocio,
}: {
  etapas: EtapaPipeline[];
  negociosIniciais: NegocioComRelacoes[];
  onNovoNegocio: () => void;
}) {
  const [negocios, setNegocios] = useState(negociosIniciais);

  useEffect(() => setNegocios(negociosIniciais), [negociosIniciais]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("negocios-kanban")
      .on("postgres_changes", { event: "*", schema: "public", table: "negocios" }, () => {
        supabase
          .from("negocios")
          .select("*, contato:contatos(*), responsavel:usuarios(*), etapa:etapas_pipeline(*), atividades_pendentes:atividades(id, data_agendada, concluida)")
          .then(({ data }) => data && setNegocios(data as NegocioComRelacoes[]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDrop = async (e: React.DragEvent, etapaId: string) => {
    e.preventDefault();
    const negocioId = e.dataTransfer.getData("text/plain");
    if (!negocioId) return;
    const etapa = etapas.find((et) => et.id === etapaId);
    setNegocios((prev) =>
      prev.map((n) => (n.id === negocioId ? { ...n, etapa_id: etapaId, etapa: etapa ?? n.etapa } : n))
    );
    const supabase = createClient();
    await supabase
      .from("negocios")
      .update({ etapa_id: etapaId, probabilidade: etapa?.probabilidade ?? 10, atualizado_em: new Date().toISOString() })
      .eq("id", negocioId);
    await supabase.from("atividades").insert({
      negocio_id: negocioId,
      tipo: "mudanca_etapa",
      titulo: `Etapa alterada para: ${etapa?.nome}`,
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-x-auto pb-6 pt-4 px-4 sm:px-6">
      <div className="flex gap-4 min-w-max h-full">
        {etapas.map((etapa) => {
          const hoje = new Date().toDateString();
          const doEtapa = negocios
            .filter((n) => n.etapa_id === etapa.id)
            .slice()
            .sort((a, b) => {
              const aHoje = a.ultima_atividade_em ? new Date(a.ultima_atividade_em).toDateString() === hoje : false;
              const bHoje = b.ultima_atividade_em ? new Date(b.ultima_atividade_em).toDateString() === hoje : false;
              if (aHoje === bHoje) return 0;
              return aHoje ? 1 : -1;
            });
          const totalValor = doEtapa.reduce((acc, n) => acc + (n.valor || 0), 0);

          return (
            <div
              key={etapa.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, etapa.id)}
              className="w-[320px] shrink-0 flex flex-col rounded-2xl border p-3.5 h-full max-h-full"
              style={{
                borderColor: (etapa.cor || "#6366f1") + "40",
                background: (etapa.cor || "#6366f1") + "0a",
              }}
            >
              <div className="mb-3.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100">{etapa.nome}</h2>
                    <span
                      className="px-2 py-0.5 text-xs font-bold rounded-full"
                      style={{ background: (etapa.cor || "#6366f1") + "22", color: etapa.cor || "#6366f1" }}
                    >
                      {doEtapa.length}
                    </span>
                  </div>
                  <button
                    onClick={onNovoNegocio}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 dark:hover:bg-slate-800 transition-all"
                    title="Adicionar negócio nesta etapa"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Valor na etapa:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{formatarMoeda(totalValor)}</span>
                </div>
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
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", negocio.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <LeadCard negocio={negocio} />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
