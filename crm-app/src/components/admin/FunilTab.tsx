"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";

export function FunilTab({
  vendedores,
  negocios,
  etapas,
}: {
  vendedores: Usuario[];
  negocios: NegocioComRelacoes[];
  etapas: EtapaPipeline[];
}) {
  const [filtro, setFiltro] = useState<string>("all");
  const [busca, setBusca] = useState("");

  const vendedoresFiltrados = busca.trim()
    ? vendedores.filter((v) => v.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : vendedores;

  const negociosPorFiltro =
    filtro === "all" ? negocios : filtro === "sem_dono" ? negocios.filter((n) => !n.responsavel_id) : negocios.filter((n) => n.responsavel_id === filtro);

  const negociosFiltrados =
    busca.trim() && filtro === "all"
      ? negociosPorFiltro.filter((n) => n.responsavel_id && vendedoresFiltrados.some((v) => v.id === n.responsavel_id))
      : negociosPorFiltro;

  const totalValor = negociosFiltrados.reduce((acc, n) => acc + (n.valor || 0), 0);
  const semDonoCount = negocios.filter((n) => !n.responsavel_id).length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div>
            <label htmlFor="funiltab-1" className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Buscar vendedor</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input id="funiltab-1"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do vendedor..."
                className="pl-8 pr-3 py-2.5 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full sm:w-56"
              />
            </div>
          </div>
          <div>
            <label htmlFor="funiltab-2" className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Filtrar funil</label>
            <select id="funiltab-2"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="px-4 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full"
            >
              <option value="all">Visão geral (todos os vendedores)</option>
              <option value="sem_dono">Leads sem dono (pool) — {semDonoCount}</option>
              {vendedoresFiltrados.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Valor total no filtro</p>
          <p className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">{formatarMoeda(totalValor)}</p>
          <p className="text-[11px] text-slate-400">{negociosFiltrados.length} negócios</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">Distribuição por etapa</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {etapas.map((etapa) => {
            const doEtapa = negociosFiltrados.filter((n) => n.etapa_id === etapa.id);
            const valor = doEtapa.reduce((acc, n) => acc + (n.valor || 0), 0);
            return (
              <div key={etapa.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{etapa.nome}</span>
                  <span
                    className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                    style={{ background: (etapa.cor || "#6366f1") + "22", color: etapa.cor || "#6366f1" }}
                  >
                    {doEtapa.length}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-xs text-slate-500">Valor:</span>
                  <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">{formatarMoeda(valor)}</span>
                </div>
                {doEtapa.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-1">
                    {doEtapa.map((n) => (
                      <Link
                        key={n.id}
                        href={`/negocios/${n.id}`}
                        className="text-[11px] p-1.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/60 dark:border-slate-800 flex items-center justify-between hover:border-indigo-400 transition-colors"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">
                          {n.contato?.empresa || n.contato?.nome}
                        </span>
                        <span className="font-bold text-slate-600 dark:text-slate-400">{formatarMoeda(n.valor)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
