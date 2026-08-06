import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";

export type PeriodoChave = "mes" | "30d" | "90d" | "ano" | "tudo";

export const PERIODOS: { chave: PeriodoChave; label: string }[] = [
  { chave: "mes", label: "Mês atual" },
  { chave: "30d", label: "Últimos 30 dias" },
  { chave: "90d", label: "Últimos 90 dias" },
  { chave: "ano", label: "Ano atual" },
  { chave: "tudo", label: "Tudo" },
];

/** Início do período (inclusivo). null = sem limite (tudo). */
export function inicioPeriodo(chave: PeriodoChave, agora = new Date()): Date | null {
  switch (chave) {
    case "mes":
      return new Date(agora.getFullYear(), agora.getMonth(), 1);
    case "30d":
      return new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "ano":
      return new Date(agora.getFullYear(), 0, 1);
    case "tudo":
      return null;
  }
}

function dentroDoPeriodo(iso: string | null | undefined, inicio: Date | null): boolean {
  if (inicio === null) return true;
  if (!iso) return false;
  return new Date(iso).getTime() >= inicio.getTime();
}

export interface MetricaVendedor {
  vendedor: Usuario;
  ganhos: number;
  perdidos: number;
  receitaGanha: number;
  ticketMedio: number;
  /** ganhos / (ganhos + perdidos). 0..1. null quando não fechou nada. */
  taxaConversao: number | null;
  abertosCount: number;
  abertosValor: number;
  /** valor ponderado pela probabilidade da etapa (pipeline previsto). */
  abertosPonderado: number;
  meta: number;
  /** receitaGanha / meta quando meta > 0, senão null. */
  atingimentoMeta: number | null;
}

/**
 * Calcula as métricas por vendedor no período. Ganho/perda são contados por
 * `fechado_em` (data em que o negócio foi fechado); o pipeline em aberto é o
 * estado atual (snapshot), independente de período.
 */
export function metricasPorVendedor(
  vendedores: Usuario[],
  negocios: NegocioComRelacoes[],
  periodo: PeriodoChave,
  agora = new Date(),
): MetricaVendedor[] {
  const inicio = inicioPeriodo(periodo, agora);

  return vendedores.map((vendedor) => {
    const meus = negocios.filter((n) => n.responsavel_id === vendedor.id);

    const ganhosArr = meus.filter((n) => n.ganho === true && dentroDoPeriodo(n.fechado_em, inicio));
    const perdidosArr = meus.filter((n) => n.ganho === false && dentroDoPeriodo(n.fechado_em, inicio));
    const abertosArr = meus.filter((n) => n.ganho === null || n.ganho === undefined);

    const receitaGanha = ganhosArr.reduce((acc, n) => acc + (n.valor || 0), 0);
    const abertosValor = abertosArr.reduce((acc, n) => acc + (n.valor || 0), 0);
    const abertosPonderado = abertosArr.reduce(
      (acc, n) => acc + (n.valor || 0) * ((n.probabilidade ?? n.etapa?.probabilidade ?? 0) / 100),
      0,
    );
    const fechados = ganhosArr.length + perdidosArr.length;
    const meta = vendedor.meta_mensal || 0;

    return {
      vendedor,
      ganhos: ganhosArr.length,
      perdidos: perdidosArr.length,
      receitaGanha,
      ticketMedio: ganhosArr.length > 0 ? receitaGanha / ganhosArr.length : 0,
      taxaConversao: fechados > 0 ? ganhosArr.length / fechados : null,
      abertosCount: abertosArr.length,
      abertosValor,
      abertosPonderado,
      meta,
      atingimentoMeta: meta > 0 ? receitaGanha / meta : null,
    };
  });
}

export interface TotaisEquipe {
  ganhos: number;
  perdidos: number;
  receitaGanha: number;
  ticketMedio: number;
  taxaConversao: number | null;
  abertosCount: number;
  abertosValor: number;
}

export function totaisEquipe(metricas: MetricaVendedor[]): TotaisEquipe {
  const ganhos = metricas.reduce((a, m) => a + m.ganhos, 0);
  const perdidos = metricas.reduce((a, m) => a + m.perdidos, 0);
  const receitaGanha = metricas.reduce((a, m) => a + m.receitaGanha, 0);
  const fechados = ganhos + perdidos;
  return {
    ganhos,
    perdidos,
    receitaGanha,
    ticketMedio: ganhos > 0 ? receitaGanha / ganhos : 0,
    taxaConversao: fechados > 0 ? ganhos / fechados : null,
    abertosCount: metricas.reduce((a, m) => a + m.abertosCount, 0),
    abertosValor: metricas.reduce((a, m) => a + m.abertosValor, 0),
  };
}

export interface EtapaFunil {
  etapa: EtapaPipeline;
  /** negócios que alcançaram esta etapa (ou além) em algum momento. */
  alcancaram: number;
  /** conversão desta etapa para a próxima (0..1). null na última. */
  conversaoParaProxima: number | null;
}

/**
 * Funil de conversão baseado no histórico de etapas: para cada etapa ordenada
 * (exceto "Perdido"), conta quantos negócios já a alcançaram, e a conversão
 * etapa→etapa. `historico` são os pares (negocio_id, etapa_id) percorridos;
 * a etapa atual de cada negócio também conta.
 */
export function funilConversao(
  etapas: EtapaPipeline[],
  negocios: NegocioComRelacoes[],
  historico: { negocio_id: string; etapa_id: string | null }[],
): EtapaFunil[] {
  const ordemPorEtapa = new Map<string, number>();
  for (const e of etapas) ordemPorEtapa.set(e.id, e.ordem);

  // Etapas do funil = todas menos a de perda (probabilidade 0 e última ordem).
  const etapasFunil = etapas
    .filter((e) => !(e.probabilidade === 0 && e.ordem === Math.max(...etapas.map((x) => x.ordem))))
    .sort((a, b) => a.ordem - b.ordem);
  const ordemPerdido = etapas.find((e) => e.probabilidade === 0 && e.ordem === Math.max(...etapas.map((x) => x.ordem)))?.ordem;

  // Maior ordem (dentro do funil) que cada negócio alcançou.
  const maxOrdem = new Map<string, number>();
  const registrar = (negocioId: string, etapaId: string | null | undefined) => {
    if (!etapaId) return;
    const ord = ordemPorEtapa.get(etapaId);
    if (ord === undefined || ord === ordemPerdido) return;
    const atual = maxOrdem.get(negocioId) ?? 0;
    if (ord > atual) maxOrdem.set(negocioId, ord);
  };

  const idsValidos = new Set(negocios.map((n) => n.id));
  for (const h of historico) {
    if (idsValidos.has(h.negocio_id)) registrar(h.negocio_id, h.etapa_id);
  }
  for (const n of negocios) registrar(n.id, n.etapa_id);

  const alcancaramPorOrdem = new Map<number, number>();
  for (const etapa of etapasFunil) {
    let c = 0;
    for (const [, ord] of maxOrdem) if (ord >= etapa.ordem) c++;
    alcancaramPorOrdem.set(etapa.ordem, c);
  }

  return etapasFunil.map((etapa, i) => {
    const alcancaram = alcancaramPorOrdem.get(etapa.ordem) || 0;
    const proxima = etapasFunil[i + 1];
    const alcancaramProx = proxima ? alcancaramPorOrdem.get(proxima.ordem) || 0 : null;
    return {
      etapa,
      alcancaram,
      conversaoParaProxima: proxima ? (alcancaram > 0 ? (alcancaramProx as number) / alcancaram : 0) : null,
    };
  });
}

export function formatarPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "%";
}
