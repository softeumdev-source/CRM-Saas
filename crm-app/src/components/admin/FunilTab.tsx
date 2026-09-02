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
    filtro === "all"
      ? negocios
      : filtro === "sem_dono"
        ? negocios.filter((n) => !n.responsavel_id)
        : negocios.filter((n) => n.responsavel_id === filtro);

  const negociosFiltrados =
    busca.trim() && filtro === "all"
      ? negociosPorFiltro.filter(
          (n) => n.responsavel_id && vendedoresFiltrados.some((v) => v.id === n.responsavel_id),
        )
      : negociosPorFiltro;

  const totalValor = negociosFiltrados.reduce((acc, n) => acc + (n.valor || 0), 0);
  const semDonoCount = negocios.filter((n) => !n.responsavel_id).length;

  return (
    <div className="space-y-6">
      <div className="bg-cartao p-5 rounded-xl border border-fio shadow-cartao flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div>
            <label className="text-rotulo uppercase text-tinta-fraca mb-1 block">
              Buscar vendedor
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tinta-fraca" />
              <input
                aria-label="Buscar vendedor"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do vendedor..."
                className="pl-8 pr-3 py-2.5 text-xs font-semibold bg-recuo border border-fio rounded-xl w-full sm:w-56"
              />
            </div>
          </div>
          <div>
            <label className="text-rotulo uppercase text-tinta-fraca mb-1 block">
              Filtrar funil
            </label>
            <select
              aria-label="Filtrar funil"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="px-4 py-2.5 text-corpo-lg font-medium bg-recuo border border-fio rounded-xl w-full"
            >
              <option value="all">Visão geral (todos os vendedores)</option>
              <option value="sem_dono">Leads sem dono (pool) — {semDonoCount}</option>
              {vendedoresFiltrados.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-right">
          <p className="text-corpo text-tinta-suave">Valor total no filtro</p>
          <p className="font-serif text-2xl tabular-nums text-acento">
            {formatarMoeda(totalValor)}
          </p>
          <p className="text-corpo text-tinta-fraca">{negociosFiltrados.length} negócios</p>
        </div>
      </div>

      <div className="bg-cartao p-6 rounded-xl border border-fio shadow-cartao space-y-4">
        <h3 className="text-titulo text-tinta">Distribuição por etapa</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {etapas.map((etapa) => {
            const doEtapa = negociosFiltrados.filter((n) => n.etapa_id === etapa.id);
            const valor = doEtapa.reduce((acc, n) => acc + (n.valor || 0), 0);
            return (
              <div key={etapa.id} className="p-4 rounded-xl border border-fio bg-recuo space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs text-tinta ">{etapa.nome}</span>
                  <span
                    className="text-corpo font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: (etapa.cor || "#6366f1") + "22",
                      color: etapa.cor || "#6366f1",
                    }}
                  >
                    {doEtapa.length}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-corpo text-tinta-suave">Valor:</span>
                  <span className="font-serif text-lg tabular-nums text-tinta">
                    {formatarMoeda(valor)}
                  </span>
                </div>
                {doEtapa.length > 0 && (
                  <div className="pt-2 border-t border-fio space-y-1">
                    {doEtapa.map((n) => (
                      <Link
                        key={n.id}
                        href={`/negocios/${n.id}`}
                        className="text-corpo p-1.5 bg-cartao rounded-lg border border-fio flex items-center justify-between hover:border-indigo-400 transition-colors"
                      >
                        <span className="font-semibold text-tinta truncate max-w-[130px]">
                          {n.contato?.empresa || n.contato?.nome}
                        </span>
                        <span className="font-medium text-tinta-suave ">
                          {formatarMoeda(n.valor)}
                        </span>
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
