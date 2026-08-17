import type { Atividade, NegocioComRelacoes, TipoAtividade } from "@/lib/types";

export const ROTULOS_ATIVIDADE: Record<string, string> = {
  ligacao: "Ligação",
  email: "E-mail",
  demo: "Demonstração",
  proposta: "Proposta",
  nota: "Nota interna",
  whatsapp: "WhatsApp",
  reuniao: "Reunião",
  mudanca_etapa: "Mudança de etapa",
};

/** Sugestões de título por tipo — um clique já preenche o campo obrigatório. */
export const TITULOS_SUGERIDOS: Record<string, string[]> = {
  ligacao: ["Ligação de prospecção", "Follow-up por telefone", "Ligação não atendida", "Alinhamento comercial"],
  whatsapp: ["Primeiro contato no WhatsApp", "Follow-up no WhatsApp", "Envio de material", "Confirmação de reunião"],
  email: ["E-mail de apresentação", "Follow-up por e-mail", "Envio de proposta", "Retomada de contato"],
  demo: ["Demonstração da plataforma", "Demo técnica com o time de TI", "Reapresentação para decisores"],
  reuniao: ["Reunião de diagnóstico", "Reunião de negociação", "Reunião de fechamento", "Kickoff"],
  proposta: ["Proposta apresentada", "Ajuste de proposta", "Negociação de valores"],
  nota: ["Contexto do cliente", "Concorrente identificado", "Objeção registrada", "Decisor mapeado"],
};

export type PresetAgendamento = { rotulo: string; dias: number; hora: number };

/** Atalhos de agendamento — evitam digitar data e hora na mão. */
export const PRESETS_AGENDAMENTO: PresetAgendamento[] = [
  { rotulo: "Hoje 17h", dias: 0, hora: 17 },
  { rotulo: "Amanhã 9h", dias: 1, hora: 9 },
  { rotulo: "Em 2 dias", dias: 2, hora: 9 },
  { rotulo: "Em 1 semana", dias: 7, hora: 9 },
  { rotulo: "Em 15 dias", dias: 15, hora: 9 },
  { rotulo: "Em 30 dias", dias: 30, hora: 9 },
];

const UM_DIA_MS = 86_400_000;

/** Valor para `<input type="datetime-local">` no fuso do navegador. */
export function paraInputDataHora(data: Date): string {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function dataDoPreset(preset: PresetAgendamento, agora = new Date()): Date {
  const d = new Date(agora);
  d.setDate(d.getDate() + preset.dias);
  d.setHours(preset.hora, 0, 0, 0);
  return d;
}

export function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Houve contato registrado hoje? É o que pinta a bolinha do card de verde. */
export function temAtividadeHoje(
  negocio: Pick<NegocioComRelacoes, "ultima_atividade_em">,
  agora = new Date(),
): boolean {
  if (!negocio.ultima_atividade_em) return false;
  return mesmoDia(new Date(negocio.ultima_atividade_em), agora);
}

/** Dias inteiros desde o último contato. `null` quando nunca houve contato. */
export function diasSemContato(
  negocio: Pick<NegocioComRelacoes, "ultima_atividade_em">,
  agora = new Date(),
): number | null {
  if (!negocio.ultima_atividade_em) return null;
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const ultima = new Date(negocio.ultima_atividade_em);
  const inicioUltima = new Date(ultima.getFullYear(), ultima.getMonth(), ultima.getDate()).getTime();
  return Math.max(0, Math.round((inicioHoje - inicioUltima) / UM_DIA_MS));
}

export type AtividadeAgendada = {
  id: string;
  titulo?: string | null;
  tipo?: string | null;
  data_agendada: string | null;
  concluida: boolean | null;
};

/** Próxima ação pendente (a mais próxima no tempo, incluindo as atrasadas). */
export function proximaAtividade<T extends AtividadeAgendada>(atividades: T[] | null | undefined): T | undefined {
  return (atividades || [])
    .filter((a) => !a.concluida && a.data_agendada)
    .sort((a, b) => new Date(a.data_agendada!).getTime() - new Date(b.data_agendada!).getTime())[0];
}

export function estaAtrasada(iso: string | null | undefined, agora = new Date()): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < agora.getTime();
}

export function ehHoje(iso: string | null | undefined, agora = new Date()): boolean {
  if (!iso) return false;
  return mesmoDia(new Date(iso), agora);
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "hoje", "ontem", "há 3 dias", "em 2 dias"… */
export function descreverPrazo(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return "sem data";
  const alvo = new Date(iso);
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const inicioAlvo = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate()).getTime();
  const dias = Math.round((inicioAlvo - inicioHoje) / UM_DIA_MS);
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias === -1) return "ontem";
  return dias > 0 ? `em ${dias} dias` : `há ${Math.abs(dias)} dias`;
}

/**
 * Urgência do card dentro da coluna. Quanto maior, mais para o topo:
 * o que já foi trabalhado hoje desce para o fim da coluna (grupo 1) e o que
 * está atrasado/esquecido sobe.
 */
export function urgenciaDoNegocio(
  negocio: NegocioComRelacoes,
  agora = new Date(),
): { trabalhadoHoje: boolean; peso: number } {
  const trabalhadoHoje = temAtividadeHoje(negocio, agora);
  if (trabalhadoHoje) {
    // Entre os já trabalhados, o mais recente fica por último.
    return { trabalhadoHoje, peso: -new Date(negocio.ultima_atividade_em!).getTime() };
  }

  const proxima = proximaAtividade(negocio.atividades_pendentes);
  if (proxima && estaAtrasada(proxima.data_agendada, agora)) {
    const atrasoDias = (agora.getTime() - new Date(proxima.data_agendada!).getTime()) / UM_DIA_MS;
    return { trabalhadoHoje, peso: 3_000_000 + atrasoDias };
  }

  const dias = diasSemContato(negocio, agora);
  if (dias === null) {
    const idade = negocio.criado_em ? (agora.getTime() - new Date(negocio.criado_em).getTime()) / UM_DIA_MS : 0;
    return { trabalhadoHoje, peso: 2_000_000 + idade };
  }

  if (proxima) {
    // Já tem próximo passo agendado no futuro: está sob controle.
    return { trabalhadoHoje, peso: dias };
  }

  return { trabalhadoHoje, peso: 1_000_000 + dias };
}

/**
 * Ordena os cards de uma coluna: quem precisa de atenção primeiro, quem já
 * recebeu atividade hoje vai para o fim da coluna (bolinha verde).
 */
export function ordenarPorCadencia(negocios: NegocioComRelacoes[], agora = new Date()): NegocioComRelacoes[] {
  return negocios
    .map((n) => ({ n, u: urgenciaDoNegocio(n, agora) }))
    .sort((a, b) => {
      if (a.u.trabalhadoHoje !== b.u.trabalhadoHoje) return a.u.trabalhadoHoje ? 1 : -1;
      return b.u.peso - a.u.peso;
    })
    .map((x) => x.n);
}

export type AtividadeComUsuario = Atividade & { usuario: { id: string; nome: string } | null };

export function ehTipoValido(tipo: string): tipo is TipoAtividade {
  return tipo in ROTULOS_ATIVIDADE;
}
