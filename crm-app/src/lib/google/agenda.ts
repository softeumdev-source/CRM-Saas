/**
 * A agenda do Google, sem uma linha de rede e sem um segredo.
 *
 * Este arquivo existe pelo MESMO motivo que `escopos.ts`: `calendar.ts` importa
 * `createAdminClient` (chave de serviço) e `renovarAccessToken` (client
 * secret). A tela da Agenda é componente de cliente e precisa do TIPO do
 * evento — importá-lo de `calendar.ts` põe o módulo do segredo no grafo do
 * navegador, e basta alguém trocar um `import type` por um `import` para o
 * segredo ir junto.
 *
 * Nesta mesma sessão essa fronteira derrubou o painel de admin: uma função de
 * `"use client"` chamada do servidor virou 500, e a violação só aparecia
 * dependendo de como o bundler dividia os chunks — ou seja, passava num build e
 * quebrava no seguinte. Um arquivo neutro é a única forma de a fronteira não
 * depender de sorte.
 *
 * Nada aqui toca `process.env`, `fetch` ou Supabase. É seguro nos dois lados.
 */

export type RespostaDoConvidado = "aceito" | "recusado" | "talvez" | "sem_resposta";

export const RESPOSTA_DO_GOOGLE: Record<string, RespostaDoConvidado> = {
  accepted: "aceito",
  declined: "recusado",
  tentative: "talvez",
  needsAction: "sem_resposta",
};

/**
 * Um compromisso da agenda do Google, já normalizado para a tela.
 *
 * `diaInteiro` não é enfeite de exibição: ele muda o SIGNIFICADO de `inicio`.
 * Ver `instanteDe` — é o ponto exato onde um evento de dia inteiro aparece no
 * dia errado se ninguém prestar atenção.
 */
export type EventoDaAgenda = {
  id: string;
  titulo: string;
  /** ISO. Sem fuso quando `diaInteiro`, para ser lido como hora LOCAL. */
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  /** Link para o evento no Google Agenda. */
  link: string | null;
  meetLink: string | null;
  local: string | null;
  /** Quantos convidados além de mim. Zero em compromisso pessoal. */
  convidados: number;
  /** Como EU respondi ao convite. */
  minhaResposta: RespostaDoConvidado | null;
};

/**
 * Erro de leitura da agenda que a TELA precisa distinguir do resto.
 *
 * "A conta não está conectada" e "a Google está fora do ar" pedem coisas
 * diferentes da pessoa — reconectar contra tentar de novo —, e um erro genérico
 * faria as duas virarem a mesma mensagem inútil.
 */
export class AgendaIndisponivel extends Error {
  constructor(
    message: string,
    readonly precisaReconectar: boolean,
  ) {
    super(message);
    this.name = "AgendaIndisponivel";
  }
}

/**
 * Tipos que NÃO entram na agenda do CRM.
 *
 * `workingLocation` é o marcador de "hoje trabalho em casa" que o Workspace
 * cria todo dia, e `birthday` é aniversário de contato — os dois são eventos de
 * dia inteiro que ficariam no topo da lista empurrando a reunião de verdade
 * para baixo. Filtrar na Google, e não aqui, é o que evita gastar os 250
 * eventos da página com ruído.
 */
export const TIPOS_UTEIS = ["default", "focusTime", "outOfOffice", "fromGmail"];

/** A forma crua que a Google devolve em `items[]`, no que nos interessa. */
export type EventoBruto = {
  id?: string;
  summary?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; resource?: boolean; responseStatus?: string }[];
};

/**
 * `start.date` (dia inteiro) contra `start.dateTime` (hora marcada).
 *
 * Este é o bug clássico desta integração, e ele é MUDO: `new Date("2026-09-04")`
 * é lido pelo JavaScript como meia-noite em UTC — que no Brasil (-03) é 21h do
 * dia 3. Um evento de dia inteiro apareceria no dia ANTERIOR, sem erro nenhum
 * em lugar nenhum.
 *
 * A saída é devolver a data SEM fuso (`2026-09-04T00:00:00`), que a mesma
 * especificação manda ler como hora local. Aí o dia é o dia.
 */
export function instanteDe(
  quando: { date?: string; dateTime?: string } | undefined,
): { iso: string; diaInteiro: boolean } | null {
  if (quando?.dateTime) return { iso: quando.dateTime, diaInteiro: false };
  if (quando?.date) return { iso: `${quando.date}T00:00:00`, diaInteiro: true };
  return null;
}

/**
 * De `items[]` da Google para o que a tela desenha.
 *
 * Puro de propósito: é aqui que moram as três decisões que erram em silêncio —
 * o dia inteiro, o convite recusado e a contagem de convidados — e todas as
 * três são testáveis sem rede.
 */
export function normalizarEventos(itens: EventoBruto[]): EventoDaAgenda[] {
  const eventos: EventoDaAgenda[] = [];

  for (const e of itens) {
    const inicio = instanteDe(e.start);
    const fim = instanteDe(e.end);
    // Sem início não há onde pôr a linha. Acontece de verdade: ocorrência
    // cancelada de uma série volta sem `start`.
    if (!inicio || !fim || !e.id) continue;

    const convidados = e.attendees || [];
    const eu = convidados.find((c) => c.self);

    // Reunião que EU recusei não é compromisso meu. Mostrá-la faria o dia
    // parecer cheio de coisa que não vai acontecer.
    if (eu?.responseStatus === "declined") continue;

    eventos.push({
      id: e.id,
      titulo: e.summary || "(sem título)",
      inicio: inicio.iso,
      fim: fim.iso,
      diaInteiro: inicio.diaInteiro,
      link: e.htmlLink || null,
      meetLink: e.hangoutLink || null,
      local: e.location || null,
      // Sala e equipamento não são gente: contá-los faria "1 convidado" numa
      // reunião em que ninguém foi convidado.
      convidados: convidados.filter((c) => !c.self && !c.resource).length,
      minhaResposta: eu?.responseStatus
        ? RESPOSTA_DO_GOOGLE[eu.responseStatus] || "sem_resposta"
        : null,
    });
  }

  return eventos;
}
