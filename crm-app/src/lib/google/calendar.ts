import { renovarAccessToken } from "@/lib/google/oauth";
import {
  AgendaIndisponivel,
  RESPOSTA_DO_GOOGLE,
  TIPOS_UTEIS,
  normalizarEventos,
  traduzirErroDoGoogle,
  type EventoBruto,
  type EventoDaAgenda,
  type RespostaDoConvidado,
} from "@/lib/google/agenda";
import { createAdminClient } from "@/lib/supabase/admin";

const EVENTOS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** O fuso que vai em todo `dateTime` — criar e alterar precisam concordar. */
const FUSO = "America/Sao_Paulo";

/**
 * Pega um access token válido para o usuário.
 *
 * O access token não é guardado em lugar nenhum: vale uma hora e sai barato
 * pedir outro. Guardar um bearer token para economizar uma chamada é trocar
 * segurança por quase nada.
 *
 * Quando a renovação falha (o usuário revogou o acesso na conta Google, o mais
 * comum), o erro fica gravado na integração para a tela poder pedir uma
 * reconexão em vez de só falhar.
 */
export async function accessTokenDe(usuarioId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: refresh } = await admin.rpc("google_obter_refresh_token", { p_usuario_id: usuarioId });
  if (!refresh) throw new Error("Esta conta não está conectada ao Google.");

  try {
    const tokens = await renovarAccessToken(refresh as string);
    return tokens.access_token;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha ao renovar o acesso";
    await admin.rpc("google_registrar_erro", { p_usuario_id: usuarioId, p_erro: msg });
    throw new Error(`O acesso ao Google expirou ou foi revogado (${msg}). Reconecte a conta.`);
  }
}

export type Convidado = { email: string; nome?: string | null };

export type EventoCriado = {
  id: string;
  htmlLink: string;
  meetLink: string | null;
  inicio: string;
  fim: string;
};

/**
 * Cria o evento na agenda de quem chamou e convida o lead.
 *
 * `sendUpdates: "all"` é o que faz a Google mandar o convite por e-mail — sem
 * isso o evento aparece só na agenda do vendedor e o cliente nunca fica
 * sabendo, que é o pior dos dois mundos: parece agendado e não está.
 *
 * O Meet é pedido via `conferenceData` com um `requestId` derivado do negócio e
 * do horário: se a mesma criação for repetida (retry, clique duplo), a Google
 * devolve a mesma conferência em vez de criar outra.
 */
export async function criarEvento(params: {
  usuarioId: string;
  titulo: string;
  descricao?: string;
  inicio: Date;
  minutos: number;
  convidados: Convidado[];
  requestId: string;
}): Promise<EventoCriado> {
  const token = await accessTokenDe(params.usuarioId);
  const fim = new Date(params.inicio.getTime() + params.minutos * 60_000);

  const corpo = {
    summary: params.titulo,
    description: params.descricao,
    start: { dateTime: params.inicio.toISOString(), timeZone: FUSO },
    end: { dateTime: fim.toISOString(), timeZone: FUSO },
    attendees: params.convidados.map((c) => ({ email: c.email, displayName: c.nome || undefined })),
    conferenceData: {
      createRequest: {
        requestId: params.requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: { useDefault: true },
  };

  const resp = await fetch(`${EVENTOS}?conferenceDataVersion=1&sendUpdates=all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = await resp.json();
  if (!resp.ok) {
    throw new Error(dados?.error?.message || "Falha ao criar o evento na agenda.");
  }

  return {
    id: dados.id,
    htmlLink: dados.htmlLink,
    meetLink: dados.hangoutLink || null,
    inicio: dados.start?.dateTime || params.inicio.toISOString(),
    fim: dados.end?.dateTime || fim.toISOString(),
  };
}

/**
 * Muda um evento que JÁ EXISTE na agenda, e avisa o cliente.
 *
 * `PATCH` e não `PUT`, e a diferença não é estilo: `events.update` (o `PUT`)
 * exige o recurso INTEIRO e trata como remoção tudo que não for enviado — o
 * `conferenceData` incluído. Ou seja, remarcar com `PUT` apagaria o link do
 * Meet da reunião. O `PATCH` mexe só nos campos que vão no corpo.
 *
 * `sendUpdates=all` é o que faz a Google mandar o e-mail de "reunião alterada".
 * Sem ele o evento muda de hora na agenda de todo mundo em silêncio, que é uma
 * forma diferente do mesmo defeito que esta função existe para consertar.
 *
 * 404 e 410 não são erro aqui: significam que o evento já não existe do lado da
 * Google (alguém apagou por lá). Devolver `false` deixa quem chamou seguir com
 * a limpeza do nosso lado em vez de travar.
 */
export async function atualizarEvento(params: {
  usuarioId: string;
  eventoId: string;
  inicio?: Date;
  minutos?: number;
  titulo?: string;
  descricao?: string;
}): Promise<boolean> {
  const token = await accessTokenDe(params.usuarioId);

  const corpo: Record<string, unknown> = {};
  if (params.titulo) corpo.summary = params.titulo;
  if (params.descricao) corpo.description = params.descricao;
  if (params.inicio && params.minutos) {
    const fim = new Date(params.inicio.getTime() + params.minutos * 60_000);
    corpo.start = { dateTime: params.inicio.toISOString(), timeZone: FUSO };
    corpo.end = { dateTime: fim.toISOString(), timeZone: FUSO };
  }

  const resp = await fetch(`${EVENTOS}/${encodeURIComponent(params.eventoId)}?sendUpdates=all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });

  if (resp.status === 404 || resp.status === 410) return false;
  if (!resp.ok) {
    const dados = await resp.json().catch(() => null);
    throw new Error(dados?.error?.message || `A Google respondeu ${resp.status} ao alterar o evento.`);
  }
  return true;
}

/**
 * Cancela o evento na agenda de todo mundo, cliente incluído.
 *
 * Mesma regra do 404/410: evento que já sumiu é sucesso, não falha — o objetivo
 * é "não existir mais", e ele já não existe.
 */
export async function cancelarEvento(usuarioId: string, eventoId: string): Promise<boolean> {
  const token = await accessTokenDe(usuarioId);
  const resp = await fetch(`${EVENTOS}/${encodeURIComponent(eventoId)}?sendUpdates=all`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (resp.status === 404 || resp.status === 410) return false;
  if (!resp.ok) {
    const dados = await resp.json().catch(() => null);
    throw new Error(dados?.error?.message || `A Google respondeu ${resp.status} ao cancelar o evento.`);
  }
  return true;
}

/**
 * Quantos minutos o evento dura HOJE, na Google.
 *
 * Existe porque `atividades` não guarda duração — e não vai passar a guardar.
 * Uma coluna nossa nasceria vazia para toda reunião que já existe e viraria uma
 * segunda cópia da verdade, divergindo no dia em que alguém arrastasse a borda
 * do evento no Google Agenda. A duração É do Google; quando o reagendamento não
 * informa uma nova, esta função preserva a real em vez de encolher a reunião
 * para um padrão.
 *
 * Devolve `null` quando o evento sumiu ou não tem hora (dia inteiro) — e quem
 * chama decide o padrão, em vez de receber um número inventado aqui.
 */
export async function duracaoDoEvento(usuarioId: string, eventoId: string): Promise<number | null> {
  const token = await accessTokenDe(usuarioId);
  const resp = await fetch(`${EVENTOS}/${encodeURIComponent(eventoId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;

  const dados = await resp.json().catch(() => null);
  const inicio = dados?.start?.dateTime;
  const fim = dados?.end?.dateTime;
  if (!inicio || !fim) return null;

  const minutos = Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60_000);
  return Number.isFinite(minutos) && minutos > 0 ? minutos : null;
}

/**
 * Lê como o convidado respondeu ao convite.
 *
 * É o que dá base ao no-show: "recusou" e "nem respondeu" são sinais
 * diferentes de "aceitou e não veio", e tratá-los igual faria o SDR reagendar
 * com quem nunca confirmou.
 *
 * Note que isto NÃO prova comparecimento — a Google não sabe quem entrou na
 * sala. Quem responde "compareceu?" continua sendo o vendedor.
 */
export async function respostaDoConvidado(
  usuarioId: string,
  eventoId: string,
  emailConvidado: string,
): Promise<RespostaDoConvidado | null> {
  const token = await accessTokenDe(usuarioId);
  const resp = await fetch(`${EVENTOS}/${encodeURIComponent(eventoId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const dados = await resp.json();
  const alvo = (dados.attendees || []).find(
    (a: { email?: string }) => (a.email || "").toLowerCase() === emailConvidado.toLowerCase(),
  );
  if (!alvo) return null;
  return RESPOSTA_DO_GOOGLE[alvo.responseStatus] || "sem_resposta";
}

/**
 * Reexportado para quem já importava daqui. O tipo VIVE em `agenda.ts`, que não
 * puxa segredo nenhum — ver o cabeçalho de lá.
 */
export type { EventoDaAgenda, RespostaDoConvidado };
export { AgendaIndisponivel };

/**
 * Os eventos da agenda principal de UMA pessoa, num período.
 *
 * O escopo é o `calendar.events` que a conexão já pede desde o início —
 * conferido no discovery document da própria Google, que lista
 * `.../auth/calendar.events` entre os aceitos por `events.list`. Ou seja:
 * ninguém precisa reconectar nada para a agenda aparecer.
 *
 * `singleEvents=true` expande a série: sem ele, uma reunião semanal voltaria
 * como UMA linha com a regra de recorrência e a tela teria que interpretar
 * RRULE. Com ele a Google devolve as ocorrências do período já resolvidas.
 *
 * Toda a normalização mora em `agenda.ts` e é pura — aqui fica só a rede.
 */
export async function eventosDoPeriodo(
  usuarioId: string,
  de: Date,
  ate: Date,
  limite = 250,
): Promise<EventoDaAgenda[]> {
  let token: string;
  try {
    token = await accessTokenDe(usuarioId);
  } catch (e) {
    throw new AgendaIndisponivel(e instanceof Error ? e.message : "Agenda indisponível.", true);
  }

  const url = new URL(EVENTOS);
  url.searchParams.set("timeMin", de.toISOString());
  url.searchParams.set("timeMax", ate.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(limite));
  for (const tipo of TIPOS_UTEIS) url.searchParams.append("eventTypes", tipo);

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const dados = await resp.json().catch(() => null);
  if (!resp.ok) {
    // A frase vem em ingles da Google. Traduzir AQUI, e nao na tela: as duas
    // telas que mostram este motivo (a Agenda e o botao de sugerir horarios)
    // recebem a MESMA frase, e cada uma conhecer o vocabulario da Google por
    // sua conta era como as duas divergiriam na primeira correcao.
    const motivo = dados?.error?.message
      ? traduzirErroDoGoogle(String(dados.error.message))
      : `A Google respondeu ${resp.status}.`;
    // 401/403 é permissão, e reconectar resolve. Qualquer outro código é a
    // Google indisponível — mandar a pessoa reconectar ali seria mentira.
    throw new AgendaIndisponivel(motivo, resp.status === 401 || resp.status === 403);
  }

  return normalizarEventos((dados?.items || []) as EventoBruto[]);
}
