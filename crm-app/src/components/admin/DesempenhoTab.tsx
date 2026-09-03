"use client";

import { useMemo, useState } from "react";
import { Trophy, TrendingDown, Target, Percent, DollarSign, Award, Users, Filter, type LucideIcon } from "lucide-react";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { formatarMoeda, iniciais } from "@/lib/types";
import {
  PERIODOS,
  type PeriodoChave,
  metricasPorVendedor,
  totaisEquipe,
  funilConversao,
  inicioPeriodo,
  formatarPct,
} from "@/lib/metricas";

export function DesempenhoTab({
  vendedores,
  negocios,
  etapas,
  historicoEtapas,
}: {
  vendedores: Usuario[];
  negocios: NegocioComRelacoes[];
  etapas: EtapaPipeline[];
  historicoEtapas: { negocio_id: string; etapa_id: string | null }[];
}) {
  const [periodo, setPeriodo] = useState<PeriodoChave>("mes");
  const [vendedorFunil, setVendedorFunil] = useState<string>("all");

  const metricas = useMemo(() => metricasPorVendedor(vendedores, negocios, periodo), [vendedores, negocios, periodo]);
  const totais = useMemo(() => totaisEquipe(metricas), [metricas]);

  const ranking = useMemo(() => [...metricas].sort((a, b) => b.receitaGanha - a.receitaGanha), [metricas]);
  const maxReceita = Math.max(1, ...ranking.map((m) => m.receitaGanha));

  const melhorId = ranking.length && ranking[0].receitaGanha > 0 ? ranking[0].vendedor.id : null;
  // Pior = menor conversão entre quem já fechou algo (desempate: menor receita).
  const comFechamento = metricas.filter((m) => m.ganhos + m.perdidos > 0);
  const piorId =
    comFechamento.length > 1
      ? [...comFechamento].sort(
          (a, b) => (a.taxaConversao ?? 0) - (b.taxaConversao ?? 0) || a.receitaGanha - b.receitaGanha,
        )[0].vendedor.id
      : null;

  const negociosFunil = vendedorFunil === "all" ? negocios : negocios.filter((n) => n.responsavel_id === vendedorFunil);
  const funil = useMemo(() => funilConversao(etapas, negociosFunil, historicoEtapas), [etapas, negociosFunil, historicoEtapas]);
  const topoFunil = Math.max(1, ...funil.map((f) => f.alcancaram));

  const motivosPerda = useMemo(() => {
    const inicio = inicioPeriodo(periodo);
    const mapa = new Map<string, number>();
    for (const n of negocios) {
      if (n.ganho !== false) continue;
      if (inicio && (!n.fechado_em || new Date(n.fechado_em).getTime() < inicio.getTime())) continue;
      const motivo = (n.motivo_perda || "Sem motivo informado").trim() || "Sem motivo informado";
      mapa.set(motivo, (mapa.get(motivo) || 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [negocios, periodo]);
  const maxMotivo = Math.max(1, ...motivosPerda.map(([, c]) => c));

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="bg-superficie p-4 rounded-2xl border border-fio shadow-xs flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-tinta-fraca" />
        <span className="text-rotulo font-medium text-tinta-suave uppercase tracking-wider">Período</span>
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.chave}
              onClick={() => setPeriodo(p.chave)}
              className={`px-3 py-1.5 text-rotulo font-medium rounded-xl transition-colors duration-150 ease-out ${
                periodo === p.chave
                  ? "bg-acento-solido text-acento-tinta shadow-md"
                  : "bg-recuo text-tinta-suave hover:text-tinta"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs da equipe */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={DollarSign} cor="#10b981" label="Receita ganha" valor={formatarMoeda(totais.receitaGanha)} sub={`${totais.ganhos} negócios`} />
        <KpiCard icon={Percent} cor="#6366f1" label="Taxa de conversão" valor={formatarPct(totais.taxaConversao)} sub={`${totais.ganhos}G / ${totais.perdidos}P`} />
        <KpiCard icon={Award} cor="#f59e0b" label="Ticket médio" valor={formatarMoeda(totais.ticketMedio)} sub="por negócio ganho" />
        <KpiCard icon={TrendingDown} cor="#f43f5e" label="Perdidos" valor={String(totais.perdidos)} sub="no período" />
        <KpiCard icon={Target} cor="#3b82f6" label="Pipeline aberto" valor={formatarMoeda(totais.abertosValor)} sub={`${totais.abertosCount} em aberto`} />
      </div>

      {/* Ranking de vendedores */}
      <div className="bg-superficie p-6 rounded-2xl border border-fio shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-alerta" />
          <h3 className="font-medium text-tinta text-corpo-lg">Ranking de vendedores</h3>
          <span className="text-rotulo text-tinta-fraca ml-auto">ordenado por receita ganha</span>
        </div>

        {ranking.length === 0 && <p className="text-corpo text-tinta-fraca py-6 text-center">Nenhum vendedor ativo ainda.</p>}

        <div className="space-y-2.5">
          {ranking.map((m, i) => {
            const ehMelhor = m.vendedor.id === melhorId;
            const ehPior = m.vendedor.id === piorId && m.vendedor.id !== melhorId;
            return (
              <div
                key={m.vendedor.id}
                className={`p-3.5 rounded-2xl border transition-colors ${
                  ehMelhor
                    ? "border-alerta/40 bg-alerta-fraco/60"
                    : ehPior
                      ? "border-risco/40 bg-risco-fraco/50"
                      : "border-fio bg-recuo/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-corpo font-black text-tinta-fraca">{i + 1}º</span>
                  <div className="h-9 w-9 rounded-full bg-acento-fraco text-acento grid place-items-center text-rotulo font-medium shrink-0">
                    {iniciais(m.vendedor.nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-corpo text-tinta truncate">{m.vendedor.nome}</span>
                      {ehMelhor && (
                        <span className="text-rotulo font-medium px-2 py-0.5 rounded-full bg-alerta/20 text-alerta flex items-center gap-1">
                          <Trophy className="h-3 w-3" /> Melhor
                        </span>
                      )}
                      {ehPior && (
                        <span className="text-rotulo font-medium px-2 py-0.5 rounded-full bg-risco/20 text-risco flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" /> Precisa de atenção
                        </span>
                      )}
                    </div>
                    {/* barra de receita */}
                    <div className="mt-1.5 h-2 w-full bg-fio rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(m.receitaGanha / maxReceita) * 100}%`,
                          background: ehMelhor ? "#f59e0b" : ehPior ? "#f43f5e" : "#6366f1",
                          minWidth: m.receitaGanha > 0 ? "0.5rem" : 0,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-corpo font-medium text-tinta">{formatarMoeda(m.receitaGanha)}</p>
                    <p className="text-rotulo text-tinta-fraca">
                      conv. <span className="font-medium text-tinta-suave">{formatarPct(m.taxaConversao)}</span>
                    </p>
                  </div>
                </div>
                {/* mini-métricas */}
                <div className="mt-2.5 pl-9 grid grid-cols-2 sm:grid-cols-4 gap-2 text-rotulo">
                  <MiniMetric label="Ganhos" valor={String(m.ganhos)} />
                  <MiniMetric label="Perdidos" valor={String(m.perdidos)} />
                  <MiniMetric label="Ticket médio" valor={formatarMoeda(m.ticketMedio)} />
                  <MiniMetric
                    label="Meta"
                    valor={m.meta > 0 ? formatarPct(m.atingimentoMeta) : "—"}
                    hint={m.meta > 0 ? `${formatarMoeda(m.receitaGanha)} / ${formatarMoeda(m.meta)}` : "sem meta"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Funil de conversão */}
      <div className="bg-superficie p-6 rounded-2xl border border-fio shadow-xs space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium text-tinta text-corpo-lg">Funil de conversão</h3>
          <div className="ml-auto flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-tinta-fraca" />
            <select
              aria-label="Ver o funil de conversão de um vendedor"
              value={vendedorFunil}
              onChange={(e) => setVendedorFunil(e.target.value)}
              className="px-3 py-1.5 text-rotulo font-medium bg-recuo border border-fio rounded-xl"
            >
              <option value="all">Toda a equipe</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          {funil.map((f) => (
            <div key={f.etapa.id}>
              <div className="flex items-center gap-3">
                <span className="text-rotulo font-medium text-tinta-suave w-44 shrink-0 truncate">{f.etapa.nome}</span>
                <div className="flex-1 h-7 bg-recuo rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg flex items-center justify-end pr-2 transition-colors duration-150 ease-out"
                    style={{ width: `${(f.alcancaram / topoFunil) * 100}%`, background: (f.etapa.cor || "#6366f1"), minWidth: f.alcancaram > 0 ? "2rem" : 0 }}
                  >
                    <span className="text-rotulo font-medium text-white drop-shadow">{f.alcancaram}</span>
                  </div>
                </div>
              </div>
              {f.conversaoParaProxima !== null && (
                <div className="flex items-center gap-2 pl-44 py-0.5">
                  <span className="text-tinta-fraca">↓</span>
                  <span
                    className={`text-rotulo font-medium ${
                      f.conversaoParaProxima >= 0.5 ? "text-ok" : f.conversaoParaProxima >= 0.25 ? "text-alerta" : "text-risco"
                    }`}
                  >
                    {formatarPct(f.conversaoParaProxima)} avançam
                  </span>
                </div>
              )}
            </div>
          ))}
          {funil.every((f) => f.alcancaram === 0) && (
            <p className="text-corpo text-tinta-fraca py-6 text-center">Sem negócios no funil ainda.</p>
          )}
        </div>
      </div>

      {/* Motivos de perda */}
      {motivosPerda.length > 0 && (
        <div className="bg-superficie p-6 rounded-2xl border border-fio shadow-xs space-y-4">
          <h3 className="font-medium text-tinta text-corpo-lg">Principais motivos de perda</h3>
          <div className="space-y-2">
            {motivosPerda.map(([motivo, count]) => (
              <div key={motivo} className="flex items-center gap-3">
                <span className="text-rotulo font-medium text-tinta-suave w-48 shrink-0 truncate" title={motivo}>{motivo}</span>
                <div className="flex-1 h-5 bg-recuo rounded-lg overflow-hidden">
                  <div className="h-full bg-risco/80 rounded-lg" style={{ width: `${(count / maxMotivo) * 100}%` }} />
                </div>
                <span className="text-rotulo font-medium text-tinta-suave w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, cor, label, valor, sub }: { icon: LucideIcon; cor: string; label: string; valor: string; sub: string }) {
  return (
    <div className="bg-superficie p-4 rounded-2xl border border-fio shadow-xs">
      <div className="flex items-center gap-2">
        <span className="h-7 w-7 rounded-lg grid place-items-center" style={{ background: cor + "22" }}>
          <Icon className="h-4 w-4" style={{ color: cor }} />
        </span>
        <span className="text-rotulo font-medium text-tinta-suave uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-titulo font-medium text-tinta mt-2">{valor}</p>
      <p className="text-rotulo text-tinta-fraca">{sub}</p>
    </div>
  );
}

function MiniMetric({ label, valor, hint }: { label: string; valor: string; hint?: string }) {
  return (
    <div className="bg-superficie rounded-lg px-2.5 py-1.5 border border-fio/70" title={hint}>
      <p className="text-tinta-fraca text-rotulo uppercase tracking-wide font-medium">{label}</p>
      <p className="font-medium text-tinta">{valor}</p>
    </div>
  );
}
