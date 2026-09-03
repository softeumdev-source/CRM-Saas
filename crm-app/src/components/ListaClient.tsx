"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { recorteDeFunil } from "@/lib/pipelines";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, formatarMoeda } from "@/lib/types";
import {
  descreverPrazo,
  diasSemContato,
  estaAtrasada,
  formatarDataHora,
  proximaAtividade,
  temAtividadeHoje,
} from "@/lib/atividades";

type Ordem = "recentes" | "sem_contato" | "valor" | "proxima_acao";

export function ListaClient({
  pipelineId,
  negocios: negociosIniciais,
  total,
  lote,
  etapas,
}: {
  pipelineId: string | null;
  negocios: NegocioComRelacoes[];
  /** Quantos existem no funil, não quantos vieram. */
  total: number;
  lote: number;
  etapas: EtapaPipeline[];
}) {
  const [negocios, setNegocios] = useEstadoDaProp(negociosIniciais);
  const [busca, setBusca] = useState("");
  const [etapaFiltro, setEtapaFiltro] = useState("all");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [carregados, setCarregados] = useEstadoDaProp(negociosIniciais.length);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscarAte = useCallback(
    (limite: number) =>
      createClient()
        .from("negocios")
        .select(SELECT_NEGOCIO_COMPLETO)
        .eq("pipeline_id", recorteDeFunil(pipelineId))
        .order("criado_em", { ascending: false })
        .range(0, limite - 1),
    [pipelineId],
  );

  const recarregar = useCallback(async () => {
    const { data } = await buscarAte(Math.max(carregados, lote));
    if (data) setNegocios(data as unknown as NegocioComRelacoes[]);
  }, [buscarAte, carregados, lote]);

  const carregarMais = useCallback(async () => {
    const alvo = carregados + lote;
    setCarregando(true);
    const { data, error } = await buscarAte(alvo);
    setCarregando(false);
    if (error) {
      setErro(`Não foi possível carregar mais: ${error.message}`);
      return;
    }
    const lista = (data as unknown as NegocioComRelacoes[]) || [];
    setNegocios(lista);
    setCarregados(lista.length);
  }, [buscarAte, carregados, lote, setNegocios, setCarregados]);

  // Sem `atividades`: o gatilho `atividades_tocar_negocio` já toca `negocios`
  // em tudo que esta tela mostra. Ver o comentário no KanbanPageClient.
  useSincronizacao(recarregar, {
    canal: "lista-negocios",
    tabelas: [
      { tabela: "negocios", filtro: `pipeline_id=eq.${recorteDeFunil(pipelineId)}` },
      { tabela: "contatos" },
    ],
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = negocios.filter((n) => {
      const matchBusca =
        termo === "" ||
        n.titulo.toLowerCase().includes(termo) ||
        (n.contato?.nome || "").toLowerCase().includes(termo) ||
        (n.contato?.empresa || "").toLowerCase().includes(termo) ||
        (n.contato?.email || "").toLowerCase().includes(termo) ||
        (n.contato?.cnpj || "").toLowerCase().includes(termo);
      const matchEtapa = etapaFiltro === "all" || n.etapa_id === etapaFiltro;
      return matchBusca && matchEtapa;
    });

    const semData = Number.MAX_SAFE_INTEGER;
    return lista.sort((a, b) => {
      if (ordem === "valor") return (b.valor || 0) - (a.valor || 0);
      if (ordem === "sem_contato") return (diasSemContato(b) ?? 9999) - (diasSemContato(a) ?? 9999);
      if (ordem === "proxima_acao") {
        const pa = proximaAtividade(a.atividades_pendentes)?.data_agendada;
        const pb = proximaAtividade(b.atividades_pendentes)?.data_agendada;
        return (pa ? new Date(pa).getTime() : semData) - (pb ? new Date(pb).getTime() : semData);
      }
      return new Date(b.criado_em || 0).getTime() - new Date(a.criado_em || 0).getTime();
    });
  }, [negocios, busca, etapaFiltro, ordem]);

  return (
    <div className="max-w-[1700px] mx-auto w-full px-4 sm:px-6 py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            Lista de Negócios ({filtrados.length})
          </h1>
          {/* A busca só alcança o que está carregado. Dizer isso é a diferença
              entre "não existe" e "ainda não veio" — sem esta linha, procurar
              um cliente que está na posição 300 devolveria "nenhum negócio
              encontrado", que é uma resposta errada. */}
          {carregados < total && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Mostrando {carregados} de {total}. A busca e os filtros trabalham
              sobre estes {carregados}.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar empresa, contato, e-mail ou CNPJ..."
              className="pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-64"
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
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
          >
            <option value="recentes">Mais recentes</option>
            <option value="sem_contato">Mais tempo sem contato</option>
            <option value="proxima_acao">Próxima ação</option>
            <option value="valor">Maior valor</option>
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
                <th className="p-4">Último contato</th>
                <th className="p-4">Próxima ação</th>
                <th className="p-4">Vendedor</th>
                <th className="p-4">CNPJ</th>
                <th className="p-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtrados.map((n) => {
                const hoje = temAtividadeHoje(n);
                const dias = diasSemContato(n);
                const proxima = proximaAtividade(n.atividades_pendentes);
                const atrasada = estaAtrasada(proxima?.data_agendada);
                return (
                  <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${hoje ? "bg-emerald-500" : "bg-amber-500"}`} />
                        {n.contato?.empresa || n.contato?.nome}
                      </p>
                      <p className="text-[11px] text-slate-500 pl-3.5">{n.contato?.nome}</p>
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
                    <td className="p-4">
                      {hoje ? (
                        <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Hoje
                        </span>
                      ) : dias === null ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">Nunca</span>
                      ) : (
                        <span className={dias >= 7 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-slate-500"}>
                          há {dias} {dias === 1 ? "dia" : "dias"}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {proxima ? (
                        <span className={`font-semibold ${atrasada ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300"}`}>
                          {atrasada && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                          {formatarDataHora(proxima.data_agendada)} ({descreverPrazo(proxima.data_agendada)})
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">Sem agendamento</span>
                      )}
                    </td>
                    <td className="p-4 font-medium text-slate-600 dark:text-slate-400">{n.responsavel?.nome || "Sem dono"}</td>
                    <td className="p-4">
                      {n.contato?.cnpj ? (
                        <span className="text-emerald-600 font-semibold">OK</span>
                      ) : (
                        <span className="text-amber-600 font-semibold">Faltando</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/negocios/${n.id}`}
                        className="px-3 py-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 rounded-xl transition-colors duration-150 ease-out whitespace-nowrap"
                      >
                        Ver detalhes
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400">
                    {carregados < total
                      ? `Nenhum negócio encontrado entre os ${carregados} carregados — carregue mais abaixo.`
                      : "Nenhum negócio encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {erro && (
          <p className="m-4 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}

        {carregados < total && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center">
            <button
              onClick={() => void carregarMais()}
              disabled={carregando}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors duration-150 ease-out disabled:opacity-60"
            >
              {carregando ? "Carregando…" : `Carregar mais ${Math.min(lote, total - carregados)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
