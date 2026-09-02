import type { Tables } from "@/lib/supabase/types";

export type Usuario = Tables<"usuarios">;
export type Tenant = Tables<"tenants">;
export type Contato = Tables<"contatos">;
export type EtapaPipeline = Tables<"etapas_pipeline">;
export type Negocio = Tables<"negocios">;
export type Atividade = Tables<"atividades">;
export type Notificacao = Tables<"notificacoes">;
export type Plano = Tables<"planos">;
export type Proposta = Tables<"propostas">;
export type Envelope = Tables<"envelopes">;
export type Signatario = Tables<"signatarios">;
export type Convite = Tables<"convites">;
export type RegraDistribuicao = Tables<"regras_distribuicao">;
export type NegocioEtapaHistorico = Tables<"negocio_etapa_historico">;

export type NegocioComRelacoes = Negocio & {
  contato: Contato | null;
  responsavel: Usuario | null;
  etapa: EtapaPipeline | null;
  atividades_pendentes?:
    | { id: string; titulo: string | null; tipo: string | null; data_agendada: string | null; concluida: boolean | null }[]
    | null;
};

/** Colunas de `atividades` que o card do pipeline precisa. */
export const SELECT_ATIVIDADES_CARD = "atividades_pendentes:atividades(id, titulo, tipo, data_agendada, concluida)";

/** Select padrão de um negócio com tudo que o pipeline mostra. */
export const SELECT_NEGOCIO_COMPLETO = `*, contato:contatos(*), responsavel:usuarios(*), etapa:etapas_pipeline(*), ${SELECT_ATIVIDADES_CARD}`;

/** Select da agenda: a atividade com o negócio e o contato para ligar/mandar mensagem. */
export const SELECT_AGENDA =
  "*, negocio:negocios(id, titulo, responsavel_id, contato:contatos(nome, empresa, telefone, whatsapp), responsavel:usuarios(id, nome))";

/**
 * Abas da tela de negócio. Fica aqui, e não no componente, porque a page
 * (server) valida a query string — importar valor de módulo "use client" no
 * servidor foi o que derrubou os cards em produção.
 *
 * `geral` virou `contato` (a aba é um formulário de contato, não um resumo) e
 * `ia` virou `mensagens` (não havia IA nenhuma dentro dela). Os dois nomes
 * antigos continuam sendo aceitos: há notificações salvas com `?tab=` no banco.
 */
export type Aba = "cadencia" | "contato" | "proposta" | "mensagens";

const ABAS_ANTIGAS: Record<string, Aba> = { geral: "contato", ia: "mensagens" };

export function normalizarAba(valor: string | undefined): Aba | undefined {
  if (!valor) return undefined;
  if (valor === "cadencia" || valor === "contato" || valor === "proposta" || valor === "mensagens") {
    return valor;
  }
  return ABAS_ANTIGAS[valor];
}

/**
 * Ganho/perda derivados do nome da etapa — o funil padrão usa
 * "Fechado (Ganho)" e "Perdido". `null` = negócio ainda em aberto.
 * É o que alimenta `fechado_em` e, por consequência, as métricas de conversão.
 */
export function resultadoDaEtapa(etapa: { nome?: string | null } | null | undefined): boolean | null {
  const nome = (etapa?.nome || "").toLowerCase();
  if (nome.includes("ganho")) return true;
  if (nome.includes("perdid")) return false;
  return null;
}

export const PRIORIDADES = ["alta", "media", "baixa"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const AVISOS_PREVIOS_DIAS = [30, 60, 90, 120, 150, 180] as const;

export const TIPOS_ATIVIDADE = [
  "ligacao",
  "email",
  "demo",
  "proposta",
  "nota",
  "whatsapp",
  "reuniao",
  "mudanca_etapa",
] as const;
export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number];

export function formatarMoeda(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function iniciais(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
