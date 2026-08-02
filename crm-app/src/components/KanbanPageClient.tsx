"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { NewLeadModal } from "@/components/NewLeadModal";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";

export function KanbanPageClient({
  etapas,
  negocios,
  vendedores,
  usuarioAtual,
}: {
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
  vendedores: Usuario[];
  usuarioAtual: Usuario;
}) {
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <div className="flex-1 flex flex-col">
      <div className="max-w-[1700px] mx-auto w-full px-4 sm:px-6 pt-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Pipeline de Vendas</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Arraste os cards entre as etapas do funil.</p>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 active:scale-[0.98] transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Negocio</span>
        </button>
      </div>

      <KanbanBoard etapas={etapas} negociosIniciais={negocios} onNovoNegocio={() => setModalAberto(true)} />

      {modalAberto && (
        <NewLeadModal
          etapas={etapas}
          vendedores={vendedores}
          usuarioAtual={usuarioAtual}
          onClose={() => setModalAberto(false)}
        />
      )}
    </div>
  );
}
