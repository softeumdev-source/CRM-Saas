"use client";

import { useMemo, useState } from "react";
import {
  Trophy,
  TrendingDown,
  Target,
  Percent,
  DollarSign,
  Award,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { formatarMoeda, iniciais } from "@/lib/types";
import { Segmentado } from "@/components/ui";
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

  const metricas = useMemo(
    () => metricasPorVendedor(vendedores, negocios, periodo),
    [vendedores, negocios, periodo],
  );
  const totais = useMemo(() => totaisEquipe(metricas), [metricas]);

  const ranking = useMemo(
    () => [...metricas].sort((a, b) => b.receitaGanha - a.receitaGanha),
    [metricas],
  );
  const maxReceita = Math.max(1, ...ranking.map((m) => m.receitaGanha));

  const melhorId = ranking.length && ranking[0].receitaGanha > 0 ? ranking[0].vendedor.id : null;
  // Pior = menor conversão entre quem já fechou algo (desempate: menor receita).
  const comFechamento = metricas.filter((m) => m.ganhos + m.perdidos > 0);
  const piorId =
    comFechamento.length > 1
      ? [...comFechamento].sort(
          (a, b) =>
            (a.taxaConversao ?? 0) - (b.taxaConversao ?? 0) || a.receitaGanha - b.receitaGanha,
        )[0].vendedor.id
      : null;

  const negociosFunil =
    vendedorFunil === "all" ? negocios : negocios.filter((n) => n.responsavel_id === vendedorFunil);
  const funil = useMemo(
    () => funilConversao(etapas, negociosFunil, historicoEtapas),
    [etapas, negociosFunil, historicoEtapas],
  );
  const topoFunil = Math.max(1, ...funil.map((f) => f.alcancaram));

  const motivosPerda = useMemo(() => {
    const inicio = inicioPeriodo(periodo);
    const mapa = new Map<string, number>();
    for (const n of negocios) {
      if (n.ganho !== false) continue;
      if (inicio && (!n.fechado_em || new Date(n.fechado_em).getTime() < inicio.getTime()))
        continue;
      const motivo = (n.motivo_perda || "Sem motivo informado").trim() || "Sem motivo informado";
      mapa.set(motivo, (mapa.get(motivo) || 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [negocios, periodo]);
  const maxMotivo = Math.max(1, ...motivosPerda.map(([, c]) => c));

  return (
    <div className="space-y-6">
      {/* O cartao inteiro so para hospedar quatro pills era peso demais: o
          controle e o mesmo Segmentado do resto do sistema, solto na pagina. */}
      <Segmentado
        rotulo="Período"
        valor={periodo}
        aoTrocar={setPeriodo}
        opcoes={PERIODOS.map((p) => ({ chave: p.chave, label: p.label }))}
        className="flex-wrap"
      />

      {/* KPIs da equipe */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={DollarSign}
          cor="#10b981"
          label="Receita ganha"
          valor={formatarMoeda(totais.receitaGanha)}
          sub={`${totais.ganhos} negócios`}
        />
        <KpiCard
          icon={Percent}
          cor="#6366f1"
          label="Taxa de conversão"
          valor={formatarPct(totais.taxaConversao)}
          sub={`${totais.ganhos}G / ${totais.perdidos}P`}
        />
        <KpiCard
          icon={Award}
          cor="#f59e0b"
          label="Ticket médio"
          valor={formatarMoeda(totais.ticketMedio)}
          sub="por negócio ganho"
        />
        <KpiCard
          icon={TrendingDown}
          cor="#f43f5e"
          label="Perdidos"
          valor={String(totais.perdidos)}
          sub="no período"
        />
        <KpiCard
          icon={Target}
          cor="#3b82f6"
          label="Pipeline aberto"
          valor={formatarMoeda(totais.abertosValor)}
          sub={`${totais.abertosCount} em aberto`}
        />
      </div>

      {/* Ranking de vendedores */}
      <div className="bg-cartao p-6 rounded-xl border border-fio shadow-cartao space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h3 className="text-titulo text-tinta">Ranking de vendedores</h3>
          <span className="text-corpo text-tinta-fraca ml-auto">ordenado por receita ganha</span>
        </div>

        {ranking.length === 0 && (
          <p className="text-corpo-lg text-tinta-fraca py-6 text-center">
            Nenhum vendedor ativo ainda.
          </p>
        )}

        <div className="space-y-2.5">
          {ranking.map((m, i) => {
            const ehMelhor = m.vendedor.id === melhorId;
            const ehPior = m.vendedor.id === piorId && m.vendedor.id !== melhorId;
            return (
              <div
                key={m.vendedor.id}
                // `border` sem cor herda currentColor no Tailwind v4 — virava um contorno
                // escuro em volta de cada linha. Aqui a distincao e so o fundo.
                className={`rounded-xl p-3.5 transition-colors ${
                  ehMelhor ? "bg-amber-50" : ehPior ? "bg-rose-50" : "bg-recuo"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-corpo w-6 shrink-0 text-center tabular-nums text-tinta-fraca">
                    {i + 1}º
                  </span>
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-recuo text-corpo font-semibold text-tinta-suave">
                    {iniciais(m.vendedor.nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-titulo text-tinta truncate">{m.vendedor.nome}</span>
                      {ehMelhor && (
                        <span className="text-corpo flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                          <Trophy className="h-3 w-3" /> Melhor
                        </span>
                      )}
                      {ehPior && (
                        <span className="text-corpo flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
                          <TrendingDown className="h-3 w-3" /> Precisa de atenção
                        </span>
                      )}
                    </div>
                    {/* barra de receita */}
                    <div className="mt-1.5 h-2 w-full bg-recuo rounded-full overflow-hidden">
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
                    <p className="text-corpo-lg font-semibold text-tinta">
                      {formatarMoeda(m.receitaGanha)}
                    </p>
                    <p className="text-corpo text-tinta-fraca">
                      conv.{" "}
                      <span className="font-medium text-tinta-suave">
                        {formatarPct(m.taxaConversao)}
                      </span>
                    </p>
                  </div>
                </div>
                {/* mini-métricas */}
                <div className="mt-2.5 pl-9 grid grid-cols-2 sm:grid-cols-4 gap-2 text-corpo">
                  <MiniMetric label="Ganhos" valor={String(m.ganhos)} />
                  <MiniMetric label="Perdidos" valor={String(m.perdidos)} />
                  <MiniMetric label="Ticket médio" valor={formatarMoeda(m.ticketMedio)} />
                  <MiniMetric
                    label="Meta"
                    valor={m.meta > 0 ? formatarPct(m.atingimentoMeta) : "—"}
                    hint={
                      m.meta > 0
                        ? `${formatarMoeda(m.receitaGanha)} / ${formatarMoeda(m.meta)}`
                        : "sem meta"
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Funil de conversão */}
      <div className="bg-cartao p-6 rounded-xl border border-fio shadow-cartao space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-titulo text-tinta">Funil de conversão</h3>
          <div className="ml-auto flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-tinta-fraca" />
            <select
              aria-label="Filtrar por vendedor"
              value={vendedorFunil}
              onChange={(e) => setVendedorFunil(e.target.value)}
              className="px-3 py-1.5 text-corpo-lg font-medium bg-recuo border border-fio rounded-xl"
            >
              <option value="all">Toda a equipe</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          {funil.map((f) => (
            <div key={f.etapa.id}>
              <div className="flex items-center gap-3">
                <span className="text-corpo-lg font-medium text-tinta w-44 shrink-0 truncate">
                  {f.etapa.nome}
                </span>
                <div className="flex-1 h-7 bg-recuo rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg flex items-center justify-end pr-2 transition-colors"
                    style={{
                      width: `${(f.alcancaram / topoFunil) * 100}%`,
                      background: f.etapa.cor || "#6366f1",
                      minWidth: f.alcancaram > 0 ? "2rem" : 0,
                    }}
                  >
                    <span className="text-corpo font-semibold text-white drop-shadow">
                      {f.alcancaram}
                    </span>
                  </div>
                </div>
              </div>
              {f.conversaoParaProxima !== null && (
                <div className="flex items-center gap-2 pl-44 py-0.5">
                  <span className="text-tinta-fraca ">↓</span>
                  <span
                    className={`text-corpo font-medium ${
                      f.conversaoParaProxima >= 0.5
                        ? "text-emerald-700"
                        : f.conversaoParaProxima >= 0.25
                          ? "text-amber-700"
                          : "text-rose-700"
                    }`}
                  >
                    {formatarPct(f.conversaoParaProxima)} avançam
                  </span>
                </div>
              )}
            </div>
          ))}
          {funil.every((f) => f.alcancaram === 0) && (
            <p className="text-corpo-lg text-tinta-fraca py-6 text-center">
              Sem negócios no funil ainda.
            </p>
          )}
        </div>
      </div>

      {/* Motivos de perda */}
      {motivosPerda.length > 0 && (
        <div className="bg-cartao p-6 rounded-xl border border-fio shadow-cartao space-y-4">
          <h3 className="text-titulo text-tinta">Principais motivos de perda</h3>
          <div className="space-y-2">
            {motivosPerda.map(([motivo, count]) => (
              <div key={motivo} className="flex items-center gap-3">
                <span
                  className="text-corpo-lg font-medium text-tinta w-48 shrink-0 truncate"
                  title={motivo}
                >
                  {motivo}
                </span>
                <div className="flex-1 h-5 bg-recuo rounded-md overflow-hidden">
                  <div
                    className="h-full bg-rose-400/80 rounded-md"
                    style={{ width: `${(count / maxMotivo) * 100}%` }}
                  />
                </div>
                <span className="text-corpo-lg font-medium text-tinta-suave w-8 text-right">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  cor,
  label,
  valor,
  sub,
}: {
  icon: LucideIcon;
  cor: string;
  label: string;
  valor: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl bg-cartao shadow-cartao p-4">
      <div className="flex items-center gap-2">
        <span
          className="h-7 w-7 rounded-lg grid place-items-center"
          style={{ background: cor + "22" }}
        >
          <Icon className="h-4 w-4" style={{ color: cor }} />
        </span>
        <span className="text-corpo font-medium text-tinta-suave uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="font-serif text-2xl tabular-nums text-tinta mt-2">{valor}</p>
      <p className="text-corpo text-tinta-fraca">{sub}</p>
    </div>
  );
}

function MiniMetric({ label, valor, hint }: { label: string; valor: string; hint?: string }) {
  return (
    // Sem contorno nem fundo: com os quatro emoldurados eles pareciam campos
    // de formulario vazios. Aqui e so rotulo em cima do numero.
    <div className="flex flex-col gap-0.5" title={hint}>
      <span className="text-rotulo uppercase text-tinta-fraca">{label}</span>
      <span className="text-corpo-lg tabular-nums text-tinta">{valor}</span>
    </div>
  );
}
