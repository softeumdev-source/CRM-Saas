"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";

export function ListaClient({ negocios, etapas }: { negocios: NegocioComRelacoes[]; etapas: EtapaPipeline[] }) {
  const [busca, setBusca] = useState("");
  const [etapaFiltro, setEtapaFiltro] = useState("all");

  const filtrados = useMemo(() => {
    return negocios.filter((n) => {
      const matchBusca =
        busca === "" ||
        n.titulo.toLowerCase().includes(busca.toLowerCase()) ||
        n.contato?.nome.toLowerCase().includes(busca.toLowerCase()) ||
        n.contato?.empresa?.toLowerCase().includes(busca.toLowerCase());
      const matchEtapa = etapaFiltro === "all" || n.etapa_id === etapaFiltro;
      return matchBusca && matchEtapa;
    });
  }, [negocios, busca, etapaFiltro]);

  return (
    <div className="max-w-[1700px] mx-auto w-full px-4 sm:px-6 py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Lista de Negocios ({filtrados.length})</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar..."
              className="pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          <select
            value={etapaFiltro}
            onChange={(e) => setEtapaFiltro(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
          >
            <option value="all">Todas as etapas</option>
            {etapas.map((et) => (
              <option key={et.id} value={et.id}>{et.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-bold text-[10px]">
                <th className="p-4">Empresa / Contato</th>
                <th className="p-4">Etapa</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Vendedor</th>
                <th className="p-4">CNPJ</th>
                <th className="p-4 text-right">Acao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtrados.map((n) => (
                <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-slate-900 dark:text-slate-100">{n.contato?.empresa || n.contato?.nome}</p>
                    <p className="text-[11px] text-slate-500">{n.contato?.nome}</p>
                  </td>
                  <td className="p-4">
                    <span
                      className="px-2.5 py-1 text-[11px] font-bold rounded-full"
                      style={{ background: (n.etapa?.cor || "#6366f1") + "22", color: n.etapa?.cor || "#6366f1" }}
                    >
                      {n.etapa?.nome}
                    </span>
                  </td>
                  <td className="p-4 font-extrabold text-indigo-600 dark:text-indigo-400">{formatarMoeda(n.valor)}</td>
                  <td className="p-4 font-medium text-slate-600 dark:text-slate-400">{n.responsavel?.nome || "Sem dono"}</td>
                  <td className="p-4">
                    {n.contato?.cnpj ? (
                      <span className="text-emerald-600 font-semibold">OK</span>
                    ) : (
                      <span className="text-amber-600 font-semibold">Faltando</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <Link href={`/negocios/${n.id}`} className="px-3 py-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 rounded-xl transition-all">
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
