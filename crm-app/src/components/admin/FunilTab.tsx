"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { Cartao, Rotulo, Selecao } from "@/components/ui";

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
      <Cartao className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div>
            <label htmlFor="funiltab-1" className="text-rotulo font-medium text-tinta-suave block mb-1">Buscar vendedor</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tinta-fraca" />
              <input id="funiltab-1"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do vendedor..."
                className="foco pl-8 pr-3 py-2.5 text-rotulo font-medium bg-recuo border border-fio rounded-2xl w-full sm:w-56"
              />
            </div>
          </div>
          <div>
            <label htmlFor="funiltab-2" className="text-rotulo font-medium text-tinta-suave block mb-1">Filtrar funil</label>
            <Selecao id="funiltab-2" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-full">
              <option value="all">Visão geral (todos os vendedores)</option>
              <option value="sem_dono">Leads sem dono (pool) — {semDonoCount}</option>
              {vendedoresFiltrados.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </Selecao>
          </div>
        </div>
        <div className="text-right">
          <p className="text-rotulo text-tinta-suave">Valor total no filtro</p>
          <p className="text-titulo font-medium text-acento">{formatarMoeda(totalValor)}</p>
          <p className="text-rotulo text-tinta-fraca">{negociosFiltrados.length} negócios</p>
        </div>
      </Cartao>

      <Cartao className="space-y-4">
        <Rotulo>Distribuição por etapa</Rotulo>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {etapas.map((etapa) => {
            const doEtapa = negociosFiltrados.filter((n) => n.etapa_id === etapa.id);
            const valor = doEtapa.reduce((acc, n) => acc + (n.valor || 0), 0);
            return (
              <div key={etapa.id} className="p-4 rounded-2xl border border-fio bg-recuo space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-rotulo text-tinta">{etapa.nome}</span>
                  <span
                    className="text-rotulo font-medium px-2 py-0.5 rounded-full"
                    style={{ background: (etapa.cor || "#6366f1") + "22", color: etapa.cor || "#6366f1" }}
                  >
                    {doEtapa.length}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-rotulo text-tinta-suave">Valor:</span>
                  <span className="text-corpo font-medium text-acento">{formatarMoeda(valor)}</span>
                </div>
                {doEtapa.length > 0 && (
                  <div className="pt-2 border-t border-fio/80 space-y-1">
                    {doEtapa.map((n) => (
                      <Link
                        key={n.id}
                        href={`/negocios/${n.id}`}
                        className="text-rotulo p-1.5 bg-superficie rounded-lg border border-fio/60 flex items-center justify-between hover:border-acento transition-colors"
                      >
                        <span className="font-medium text-tinta truncate max-w-32">
                          {n.contato?.empresa || n.contato?.nome}
                        </span>
                        <span className="font-medium text-tinta-suave">{formatarMoeda(n.valor)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Cartao>
    </div>
  );
}
