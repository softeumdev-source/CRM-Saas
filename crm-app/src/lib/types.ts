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

/** Abas da tela de negócio. Fica aqui, e não no componente, porque a page (server) valida a query string. */
export type Aba = "geral" | "cadencia" | "proposta" | "ia";

export function ehAbaValida(valor: string | undefined): valor is Aba {
  return valor === "geral" || valor === "cadencia" || valor === "proposta" || valor === "ia";
}

/**
 * Ganho/perda da etapa. `null` = etapa em aberto. É o que alimenta
 * `fechado_em` e, por consequência, as métricas de conversão.
 *
 * Lê a coluna `etapas_pipeline.resultado`. Antes era adivinhado pelo NOME
 * ("contém ganho" / "contém perdid") — uma coluna de SDR chamada
 * "Perdido/Descartado" fecharia negócios sozinha.
 *
 * O fallback pelo nome continua aqui só para etapas criadas antes da coluna
 * existir e que ainda não tenham sido classificadas.
 */
export function resultadoDaEtapa(
  etapa: { nome?: string | null; resultado?: string | null } | null | undefined,
): boolean | null {
  if (etapa?.resultado === "ganho") return true;
  if (etapa?.resultado === "perdido") return false;
  if (etapa?.resultado === null || etapa?.resultado === undefined) {
    const nome = (etapa?.nome || "").toLowerCase();
    if (nome.includes("ganho")) return true;
    if (nome.includes("perdid")) return false;
  }
  return null;
}

/** A etapa que encerra o negócio como perda — não mais "a de maior ordem". */
export function ehEtapaDePerda(etapa: { resultado?: string | null } | null | undefined): boolean {
  return etapa?.resultado === "perdido";
}

/**
 * Papeis de usuario.
 *
 * O CHECK do banco (usuarios_role_check e convites_role_check) hoje aceita so
 * 'admin' e 'vendedor'. Estas listas existem para o papel deixar de estar
 * cravado como literal espalhado pelo codigo — o `sdr` entra aqui, numa linha,
 * em vez de ser cacado em seis arquivos.
 */
export const PAPEIS = ["admin", "vendedor"] as const;
export type Papel = (typeof PAPEIS)[number];

export const ROTULO_PAPEL: Record<string, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
};

/**
 * Quem forma o time medido no painel: aparece nas metas, no funil por pessoa e
 * nos seletores de responsavel. O admin fica de fora de proposito — ele gere,
 * nao e medido —, mas continua podendo ser dono de negocio.
 */
export const PAPEIS_TIME: readonly string[] = ["vendedor"];

export function ehDoTime(usuario: { role?: string | null } | null | undefined): boolean {
  return !!usuario?.role && PAPEIS_TIME.includes(usuario.role);
}

export function ehPapelValido(valor: unknown): valor is Papel {
  return typeof valor === "string" && (PAPEIS as readonly string[]).includes(valor);
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
