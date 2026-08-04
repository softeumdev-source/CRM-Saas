"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Users, XCircle } from "lucide-react";
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

  const etapaPerdido = etapas.find((e) => e.nome.toLowerCase() === "perdido");
  const etapasAtivas = etapas.filter((e) => e.id !== etapaPerdido?.id);

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

  const matrizVendedorEtapa = vendedores.map((v) => {
    const negociosDoVendedor = negocios.filter((n) => n.responsavel_id === v.id);
    const totalAtivos = negociosDoVendedor.filter((n) => n.etapa_id !== etapaPerdido?.id).length;
    const totalPerdidos = negociosDoVendedor.filter((n) => n.etapa_id === etapaPerdido?.id).length;
    const totalValorVendedor = negociosDoVendedor.filter((n) => n.etapa_id !== etapaPerdido?.id).reduce((acc, n) => acc + (n.valor || 0), 0);

    const porEtapa = etapasAtivas.map((etapa) => {
      const count = negociosDoVendedor.filter((n) => n.etapa_id === etapa.id).length;
      const valor = negociosDoVendedor.filter((n) => n.etapa_id === etapa.id).reduce((acc, n) => acc + (n.valor || 0), 0);
      return { etapa, count, valor };
    });

    return { vendedor: v, porEtapa, totalAtivos, totalPerdidos, totalValorVendedor, total: negociosDoVendedor.length };
  });

  const matrizFiltrada = busca.trim()
    ? matrizVendedorEtapa.filter((m) => m.vendedor.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : matrizVendedorEtapa;

  const semDonoNeg = negocios.filter((n) => !n.responsavel_id);
  const semDonoPorEtapa = etapasAtivas.map((etapa) => ({
    etapa,
    count: semDonoNeg.filter((n) => n.etapa_id === etapa.id).length,
    valor: semDonoNeg.filter((n) => n.etapa_id === etapa.id).reduce((acc, n) => acc + (n.valor || 0), 0),
  }));
  const semDonoPerdidos = semDonoNeg.filter((n) => n.etapa_id === etapaPerdido?.id).length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Buscar vendedor</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do vendedor..."
                className="pl-8 pr-3 py-2.5 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full sm:w-56"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Filtrar funil</label>
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="px-4 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full"
            >
              <option value="all">Visao geral (todos os vendedores)</option>
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
          <p className="text-[11px] text-slate-400">{negociosFiltrados.length} negocios</p>
        </div>
      </div>

      {/* Matriz vendedor x etapa */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-600" />
          <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">Leads por Vendedor x Etapa do Funil</h3>
        </div>
        <p className="text-xs text-slate-500">Veja quantos leads cada vendedor tem em cada etapa. Perdidos contam separadamente.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-white dark:bg-slate-900 z-10 min-w-[140px]">Vendedor</th>
                {etapasAtivas.map((etapa) => (
                  <th key={etapa.id} className="p-3 text-center min-w-[90px]">
                    <span
                      className="text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block"
                      style={{ background: (etapa.cor || "#6366f1") + "22", color: etapa.cor || "#6366f1" }}
                    >
                      {etapa.nome}
                    </span>
                  </th>
                ))}
                <th className="p-3 text-center min-w-[80px]">
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                    Perdidos
                  </span>
                </th>
                <th className="p-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[70px]">Ativos</th>
                <th className="p-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[100px]">Valor Ativo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {matrizFiltrada.map((row) => (
                <tr key={row.vendedor.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 sticky left-0 bg-white dark:bg-slate-900 z-10">
                    <p className="font-bold text-slate-900 dark:text-slate-100">{row.vendedor.nome}</p>
                    <p className="text-[10px] text-slate-400">{row.total} leads total</p>
                  </td>
                  {row.porEtapa.map((cell) => (
                    <td key={cell.etapa.id} className="p-3 text-center">
                      {cell.count > 0 ? (
                        <div>
                          <span
                            className="text-sm font-extrabold"
                            style={{ color: cell.etapa.cor || "#6366f1" }}
                          >
                            {cell.count}
                          </span>
                          <p className="text-[10px] text-slate-400">{formatarMoeda(cell.valor)}</p>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">—</span>
                      )}
                    </td>
                  ))}
                  <td className="p-3 text-center">
                    {row.totalPerdidos > 0 ? (
                      <span className="text-sm font-extrabold text-rose-500">{row.totalPerdidos}</span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">{row.totalAtivos}</span>
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">{formatarMoeda(row.totalValorVendedor)}</span>
                  </td>
                </tr>
              ))}
              {/* Sem dono row */}
              <tr className="bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">
                <td className="p-3 sticky left-0 bg-amber-50/50 dark:bg-amber-950/20 z-10">
                  <p className="font-bold text-amber-700 dark:text-amber-400">Sem dono (pool)</p>
                  <p className="text-[10px] text-amber-500">{semDonoNeg.length} leads total</p>
                </td>
                {semDonoPorEtapa.map((cell) => (
                  <td key={cell.etapa.id} className="p-3 text-center">
                    {cell.count > 0 ? (
                      <div>
                        <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">{cell.count}</span>
                        <p className="text-[10px] text-slate-400">{formatarMoeda(cell.valor)}</p>
                      </div>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </td>
                ))}
                <td className="p-3 text-center">
                  {semDonoPerdidos > 0 ? (
                    <span className="text-sm font-extrabold text-rose-500">{semDonoPerdidos}</span>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-700">—</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">{semDonoNeg.filter((n) => n.etapa_id !== etapaPerdido?.id).length}</span>
                </td>
                <td className="p-3 text-center">
                  <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                    {formatarMoeda(semDonoNeg.filter((n) => n.etapa_id !== etapaPerdido?.id).reduce((acc, n) => acc + (n.valor || 0), 0))}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Distribuicao por etapa (detail view when a vendor is selected) */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">Distribuicao por etapa</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {etapas.map((etapa) => {
            const doEtapa = negociosFiltrados.filter((n) => n.etapa_id === etapa.id);
            const valor = doEtapa.reduce((acc, n) => acc + (n.valor || 0), 0);
            const isPerdido = etapa.id === etapaPerdido?.id;
            return (
              <div
                key={etapa.id}
                className={`p-4 rounded-2xl border space-y-2 ${
                  isPerdido
                    ? "border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    {isPerdido && <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                    {etapa.nome}
                  </span>
                  <span
                    className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                    style={{ background: (isPerdido ? "#ef4444" : etapa.cor || "#6366f1") + "22", color: isPerdido ? "#ef4444" : etapa.cor || "#6366f1" }}
                  >
                    {doEtapa.length}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-xs text-slate-500">Valor:</span>
                  <span className={`text-sm font-extrabold ${isPerdido ? "text-rose-500" : "text-indigo-600 dark:text-indigo-400"}`}>{formatarMoeda(valor)}</span>
                </div>
                {doEtapa.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-1 max-h-48 overflow-y-auto">
                    {doEtapa.map((n) => (
                      <Link
                        key={n.id}
                        href={`/negocios/${n.id}`}
                        className={`text-[11px] p-1.5 rounded-lg border flex items-center justify-between hover:border-indigo-400 transition-colors ${
                          isPerdido
                            ? "bg-white dark:bg-slate-900 border-rose-200/60 dark:border-rose-900"
                            : "bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800"
                        }`}
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
