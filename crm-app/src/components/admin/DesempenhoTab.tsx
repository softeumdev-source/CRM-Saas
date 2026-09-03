"use client";

import { useMemo, useState } from "react";
import { Trophy, TrendingDown, Target, Percent, DollarSign, Award, Users, Filter, type LucideIcon } from "lucide-react";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { formatarMoeda, iniciais } from "@/lib/types";
import { Botao, Cartao, Rotulo, Selecao, Selo, Vazio, type Tom } from "@/components/ui";
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
      {/* O filtro é controle, não conteúdo: fica sobre o fundo da página, sem
          virar um cartão que compete com os números logo abaixo. */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-tinta-fraca" />
        <span className="text-rotulo text-tinta-suave">Período</span>
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <Botao
              key={p.chave}
              tamanho="sm"
              // O `shadow-md` daqui era sombra emprestada: o botão flutuava mais
              // que o cartão que o continha. A seleção é dita pela cor.
              variante={periodo === p.chave ? "primario" : "sutil"}
              onClick={() => setPeriodo(p.chave)}
            >
              {p.label}
            </Botao>
          ))}
        </div>
      </div>

      {/* KPIs da equipe */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={DollarSign} tom="ok" label="Receita ganha" valor={formatarMoeda(totais.receitaGanha)} sub={`${totais.ganhos} negócios`} />
        <KpiCard icon={Percent} tom="acento" label="Taxa de conversão" valor={formatarPct(totais.taxaConversao)} sub={`${totais.ganhos}G / ${totais.perdidos}P`} />
        <KpiCard icon={Award} tom="alerta" label="Ticket médio" valor={formatarMoeda(totais.ticketMedio)} sub="por negócio ganho" />
        <KpiCard icon={TrendingDown} tom="risco" label="Perdidos" valor={String(totais.perdidos)} sub="no período" />
        <KpiCard icon={Target} tom="info" label="Pipeline aberto" valor={formatarMoeda(totais.abertosValor)} sub={`${totais.abertosCount} em aberto`} />
      </div>

      {/* Ranking de vendedores */}
      <Cartao className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-alerta" />
          <Rotulo>Ranking de vendedores</Rotulo>
          <span className="text-rotulo text-tinta-fraca ml-auto">ordenado por receita ganha</span>
        </div>

        {ranking.length === 0 && (
          <Vazio icone={Users} titulo="Nenhum vendedor ativo">
            Convide alguém na aba Time — o ranking aparece assim que houver quem medir.
          </Vazio>
        )}

        {/* Linhas, não cartões. Cada vendedor tomava ~145px porque as quatro
            métricas viraram quatro caixas com fio — que competiam com o nome e
            faziam três pessoas ocuparem uma tela inteira. Agora a métrica é
            texto numa linha e o destaque vem do FIO à esquerda, não de um
            cartão colorido inteiro. */}
        <div className="divide-y divide-fio -mx-5">
          {ranking.map((m, i) => {
            const ehMelhor = m.vendedor.id === melhorId;
            const ehPior = m.vendedor.id === piorId && m.vendedor.id !== melhorId;
            return (
              <div
                key={m.vendedor.id}
                className={`px-5 py-3 border-l-2 ${
                  ehMelhor ? "border-l-alerta" : ehPior ? "border-l-risco" : "border-l-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-corpo font-semibold text-tinta-fraca tabular">{i + 1}</span>
                  <div className="h-8 w-8 rounded-full bg-acento-fraco text-acento grid place-items-center text-rotulo font-medium shrink-0">
                    {iniciais(m.vendedor.nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-corpo text-tinta truncate">{m.vendedor.nome}</span>
                      {ehMelhor && <Selo tom="alerta" icone={Trophy}>Melhor</Selo>}
                      {ehPior && <Selo tom="risco" icone={TrendingDown}>Precisa de atenção</Selo>}
                    </div>
                    {/* Métricas em linha, com o rótulo apagado e o número firme:
                        é a hierarquia fazendo o trabalho que quatro caixas
                        estavam tentando fazer com moldura. */}
                    <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap text-rotulo text-tinta-fraca mt-0.5">
                      <span>
                        <span className="text-tinta-suave font-medium tabular">{m.ganhos}</span> ganhos
                      </span>
                      <span>
                        <span className="text-tinta-suave font-medium tabular">{m.perdidos}</span> perdidos
                      </span>
                      <span>
                        ticket <span className="text-tinta-suave font-medium tabular">{formatarMoeda(m.ticketMedio)}</span>
                      </span>
                      <span title={m.meta > 0 ? `${formatarMoeda(m.receitaGanha)} de ${formatarMoeda(m.meta)}` : "sem meta definida"}>
                        meta{" "}
                        <span className="text-tinta-suave font-medium tabular">
                          {m.meta > 0 ? formatarPct(m.atingimentoMeta) : "—"}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-corpo-lg font-semibold text-tinta tabular">{formatarMoeda(m.receitaGanha)}</p>
                    <p className="text-rotulo text-tinta-fraca tabular">
                      {formatarPct(m.taxaConversao)} de conversão
                    </p>
                  </div>
                </div>
                {/* A barra vira um sublinhado da linha inteira: mede sem virar
                    mais um objeto na tela. */}
                <div className="mt-2 h-1 w-full bg-fio rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(m.receitaGanha / maxReceita) * 100}%`,
                      // Token, não hex: com o hex cravado esta barra ficava com a
                      // cor clara sobre fundo escuro no tema escuro.
                      background: `var(--cor-${ehMelhor ? "alerta" : ehPior ? "risco" : "acento"})`,
                      minWidth: m.receitaGanha > 0 ? "0.25rem" : 0,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Cartao>

      {/* Funil de conversão */}
      <Cartao className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Rotulo>Funil de conversão</Rotulo>
          <div className="ml-auto flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-tinta-fraca" />
            <Selecao
              aria-label="Ver o funil de conversão de um vendedor"
              value={vendedorFunil}
              onChange={(e) => setVendedorFunil(e.target.value)}
            >
              <option value="all">Toda a equipe</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </Selecao>
          </div>
        </div>

        <div>
          {funil.map((f, i) => (
            <div key={f.etapa.id}>
              <div className="flex items-center gap-3 py-1">
                <span className="flex items-center gap-2 w-48 shrink-0 min-w-0">
                  {/* A cor da etapa vira um PONTO ao lado do nome, não a barra.
                      É o que liga o funil ao board sem transformar uma série só
                      em seis matizes. */}
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: f.etapa.cor || "var(--grafico-3)" }}
                  />
                  <span className="text-rotulo text-tinta-suave truncate" title={f.etapa.nome}>
                    {f.etapa.nome}
                  </span>
                </span>
                {/* Trilho recessivo, um degrau da superfície. Barra de 20px
                    (o teto da spec é 24), ponta arredondada só na extremidade
                    do dado e reta na linha de base. */}
                <div className="flex-1 h-5 bg-recuo rounded-r-[4px]">
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{
                      width: `${(f.alcancaram / topoFunil) * 100}%`,
                      background: `var(--grafico-${Math.min(i + 1, 6)})`,
                      minWidth: f.alcancaram > 0 ? "0.25rem" : 0,
                    }}
                  />
                </div>
                {/* Valor na ponta, em tinta — nunca na cor do dado. */}
                <span className="text-corpo font-medium text-tinta tabular w-10 text-right shrink-0">
                  {f.alcancaram}
                </span>
              </div>
              {f.conversaoParaProxima !== null && (
                <div className="flex items-center gap-1.5 pl-[13px] h-4">
                  {/* O degrau entre etapas é a história do funil, então fica —
                      mas recessivo: um fio vertical e um número pequeno, não
                      mais uma linha colorida competindo com as barras. */}
                  <span aria-hidden className="w-px h-full bg-fio ml-[3px]" />
                  <span className="text-rotulo text-tinta-fraca tabular ml-1.5">
                    {formatarPct(f.conversaoParaProxima)} avançam
                  </span>
                </div>
              )}
            </div>
          ))}
          {funil.every((f) => f.alcancaram === 0) && (
            <Vazio icone={Target} titulo="Sem negócios no funil">
              As barras aparecem quando houver negócio nas etapas do período escolhido.
            </Vazio>
          )}
        </div>
      </Cartao>

      {/* Motivos de perda */}
      {motivosPerda.length > 0 && (
        <Cartao className="space-y-4">
          <Rotulo>Principais motivos de perda</Rotulo>
          {/* Série ÚNICA sobre categorias sem ordem natural: uma cor só para
              todas as barras. Antes usava `risco`, que é um token de ESTADO —
              reservado para bom/ruim, e um motivo de perda não é um estado. */}
          <div className="space-y-1">
            {motivosPerda.map(([motivo, count]) => (
              <div key={motivo} className="flex items-center gap-3 py-1">
                <span className="text-rotulo text-tinta-suave w-48 shrink-0 truncate" title={motivo}>{motivo}</span>
                <div className="flex-1 h-5 bg-recuo rounded-r-[4px]">
                  <div
                    className="h-full bg-grafico-3 rounded-r-[4px]"
                    style={{ width: `${(count / maxMotivo) * 100}%`, minWidth: count > 0 ? "0.25rem" : 0 }}
                  />
                </div>
                <span className="text-corpo font-medium text-tinta tabular w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </Cartao>
      )}
    </div>
  );
}

/**
 * O KPI trazia a cor cravada em hex e aplicada por `style={{}}`. Duas
 * consequências, as duas medidas: a fileira inteira **ignorava o tema escuro**
 * — ficava com o indigo/emerald claros sobre fundo escuro — e o VALOR, que é o
 * assunto do cartão, era menor que o título da página.
 *
 * Agora o tom sai do sistema e o número é a maior coisa da tela, que é para o
 * que `text-display` existe: "um número que é o assunto".
 */
const TOM_KPI: Record<Tom, string> = {
  neutro: "bg-recuo text-tinta-suave",
  acento: "bg-acento-fraco text-acento",
  ok: "bg-ok-fraco text-ok",
  alerta: "bg-alerta-fraco text-alerta",
  risco: "bg-risco-fraco text-risco",
  info: "bg-info-fraco text-info",
};

function KpiCard({ icon: Icon, tom, label, valor, sub }: { icon: LucideIcon; tom: Tom; label: string; valor: string; sub: string }) {
  return (
    <Cartao preenchimento="md">
      <div className="flex items-center gap-2">
        <span className={`h-7 w-7 rounded-lg grid place-items-center shrink-0 ${TOM_KPI[tom]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-rotulo text-tinta-suave">{label}</span>
      </div>
      <p className="text-display font-semibold text-tinta tabular tracking-tight mt-2">{valor}</p>
      <p className="text-rotulo text-tinta-fraca">{sub}</p>
    </Cartao>
  );
}
