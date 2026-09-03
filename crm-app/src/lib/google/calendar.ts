import { renovarAccessToken } from "@/lib/google/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

const EVENTOS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

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
    start: { dateTime: params.inicio.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: fim.toISOString(), timeZone: "America/Sao_Paulo" },
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

export type RespostaDoConvidado = "aceito" | "recusado" | "talvez" | "sem_resposta";

const MAPA: Record<string, RespostaDoConvidado> = {
  accepted: "aceito",
  declined: "recusado",
  tentative: "talvez",
  needsAction: "sem_resposta",
};

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
  return MAPA[alvo.responseStatus] || "sem_resposta";
}
