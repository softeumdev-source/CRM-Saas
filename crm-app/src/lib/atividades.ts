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

/** Tamanho máximo do resumo gerado a partir do texto da anotação. */
const LIMITE_RESUMO = 120;

/**
 * Resumo curto da anotação, usado como `titulo` da atividade — o formulário
 * pede só o texto, mas a coluna é obrigatória e é ela que aparece como
 * cabeçalho na timeline e na agenda.
 */
export function resumirTexto(texto: string, padrao: string): string {
  const primeiraLinha = texto
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!primeiraLinha) return padrao;
  return primeiraLinha.length > LIMITE_RESUMO
    ? primeiraLinha.slice(0, LIMITE_RESUMO - 1).trimEnd() + "…"
    : primeiraLinha;
}

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

/**
 * O fuso do CRM, cravado de propósito.
 *
 * Sem ele havia uma incompatibilidade de hidratação de verdade, e ela foi
 * MEDIDA: a Vercel roda as funções em UTC e o navegador do vendedor está em
 * BRT, então o mesmo instante virava "01/09, 08:54" no HTML do servidor e
 * "01/09, 11:54" depois da hidratação. O React reclama, joga a árvore fora e
 * redesenha — e, no meio disso, a pessoa lê a hora errada por um instante.
 *
 * Vale para as CONTAS de dia também, não só para o texto: `mesmoDia` decidia
 * "é hoje?" pela virada do dia local, que às 22h de Brasília já é amanhã em
 * UTC. Como `temAtividadeHoje` alimenta a ordenação da coluna, servidor e
 * cliente podiam ordenar o board de formas diferentes.
 *
 * `America/Sao_Paulo` e não o fuso do navegador: este é o CRM de UMA empresa
 * brasileira, o convite do Google já é criado neste fuso (`google/calendar.ts`)
 * e a agenda comercial é a de Brasília. Deixar cada máquina decidir era o que
 * produzia duas verdades.
 */
const FUSO = "America/Sao_Paulo";

/** O dia civil em São Paulo, como "2026-09-04" — comparável por string. */
function diaEmSaoPaulo(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

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

/**
 * Mesmo dia CIVIL em São Paulo — não no fuso de quem está rodando o código.
 *
 * `getFullYear/getMonth/getDate` leem o fuso do processo. Às 22h de Brasília
 * (01:00 UTC do dia seguinte) o servidor dizia "amanhã" e o navegador "hoje",
 * para o mesmo instante. Comparar a data em formato ISO curto no fuso fixo
 * elimina o desencontro sem trazer biblioteca nenhuma.
 */
export function mesmoDia(a: Date, b: Date): boolean {
  return diaEmSaoPaulo(a) === diaEmSaoPaulo(b);
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
    timeZone: FUSO,
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
  // Pelo mesmo motivo de `mesmoDia`: a virada do dia é a de São Paulo. Antes,
  // "hoje" e "amanhã" trocavam de lugar entre servidor e navegador depois das
  // 21h — e o card do Kanban mostra exatamente esta frase.
  const inicioHoje = Date.parse(`${diaEmSaoPaulo(agora)}T00:00:00Z`);
  const inicioAlvo = Date.parse(`${diaEmSaoPaulo(alvo)}T00:00:00Z`);
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
 *
 * O CLIENTE QUE RESPONDEU MANDA EM TUDO, e isto era uma incoerência de verdade:
 * `LeadCard` já dizia, em comentário e em código, que uma resposta não lida "é a
 * coisa mais urgente que pode acontecer com um lead, e ganha do atraso e do
 * trabalhado hoje" — a borda do card fica azul e o aviso vai para cima de todo o
 * resto. Só que esta função, que decide a POSIÇÃO do card na coluna, nunca leu
 * `respostas_nao_lidas`.
 *
 * O efeito era o pior possível: como `trabalhadoHoje` empurra o card para o FIM
 * da coluna, um cliente que respondesse a um lead tocado no mesmo dia fazia o
 * card AFUNDAR. Ou seja, responder ao vendedor escondia o lead — exatamente ao
 * contrário do que a tela prometia.
 */
export function urgenciaDoNegocio(
  negocio: NegocioComRelacoes,
  agora = new Date(),
): { respondeu: boolean; trabalhadoHoje: boolean; peso: number } {
  // Primeiro degrau, acima de qualquer outro: alguém está esperando resposta.
  if ((negocio.respostas_nao_lidas ?? 0) > 0) {
    // Dentro do grupo, quem espera HÁ MAIS TEMPO vai na frente — a mesma regra
    // que o resto da função usa para atraso e dias sem contato. Uma resposta
    // parada há três dias é mais vergonhosa do que uma que chegou agora.
    const esperaHoras = negocio.ultima_resposta_em
      ? (agora.getTime() - new Date(negocio.ultima_resposta_em).getTime()) / 3_600_000
      : 0;
    return { respondeu: true, trabalhadoHoje: false, peso: esperaHoras };
  }

  const trabalhadoHoje = temAtividadeHoje(negocio, agora);
  if (trabalhadoHoje) {
    // Entre os já trabalhados, o mais recente fica por último.
    return { respondeu: false, trabalhadoHoje, peso: -new Date(negocio.ultima_atividade_em!).getTime() };
  }

  const proxima = proximaAtividade(negocio.atividades_pendentes);
  if (proxima && estaAtrasada(proxima.data_agendada, agora)) {
    const atrasoDias = (agora.getTime() - new Date(proxima.data_agendada!).getTime()) / UM_DIA_MS;
    return { respondeu: false, trabalhadoHoje, peso: 3_000_000 + atrasoDias };
  }

  const dias = diasSemContato(negocio, agora);
  if (dias === null) {
    const idade = negocio.criado_em ? (agora.getTime() - new Date(negocio.criado_em).getTime()) / UM_DIA_MS : 0;
    return { respondeu: false, trabalhadoHoje, peso: 2_000_000 + idade };
  }

  if (proxima) {
    // Já tem próximo passo agendado no futuro: está sob controle.
    return { respondeu: false, trabalhadoHoje, peso: dias };
  }

  return { respondeu: false, trabalhadoHoje, peso: 1_000_000 + dias };
}

/**
 * Ordena os cards de uma coluna, em três faixas:
 *
 * 1. quem RESPONDEU — sempre no topo, porque tem gente esperando;
 * 2. quem precisa de atenção — atrasado, esquecido, sem próximo passo;
 * 3. quem já recebeu atividade hoje — no fim (bolinha verde).
 *
 * `respondeu` é comparado ANTES de `trabalhadoHoje`, e é isso que conserta o
 * caso descrito em `urgenciaDoNegocio`: sem esta linha, responder a um lead
 * tocado hoje empurrava o card para o fim da coluna.
 */
export function ordenarPorCadencia(negocios: NegocioComRelacoes[], agora = new Date()): NegocioComRelacoes[] {
  return negocios
    .map((n) => ({ n, u: urgenciaDoNegocio(n, agora) }))
    .sort((a, b) => {
      if (a.u.respondeu !== b.u.respondeu) return a.u.respondeu ? -1 : 1;
      if (a.u.trabalhadoHoje !== b.u.trabalhadoHoje) return a.u.trabalhadoHoje ? 1 : -1;
      return b.u.peso - a.u.peso;
    })
    .map((x) => x.n);
}

export type AtividadeComUsuario = Atividade & { usuario: { id: string; nome: string } | null };

/**
 * Os tipos de atividade que valem como "reuniao com o cliente".
 *
 * Estava duplicado como `tipo === "reuniao" || tipo === "demo"` em dois pontos
 * do CadenciaTab, e agora um terceiro ponto precisa da mesma pergunta: a trava
 * que impede entregar um lead ao vendedor sem reuniao marcada. Tres copias de
 * um literal e como um funil ganha um tipo novo e dois lugares nao ficam
 * sabendo.
 */
export const TIPOS_REUNIAO: readonly string[] = ["reuniao", "demo"];

export function ehReuniao(tipo: string | null | undefined): boolean {
  return !!tipo && TIPOS_REUNIAO.includes(tipo);
}

export function ehTipoValido(tipo: string): tipo is TipoAtividade {
  return tipo in ROTULOS_ATIVIDADE;
}
