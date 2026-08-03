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

export type NegocioComRelacoes = Negocio & {
  contato: Contato | null;
  responsavel: Usuario | null;
  etapa: EtapaPipeline | null;
  atividades_pendentes?: { id: string; data_agendada: string | null; concluida: boolean | null }[] | null;
};

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
