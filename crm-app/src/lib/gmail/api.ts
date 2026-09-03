import { accessTokenDe } from "@/lib/google/calendar";
import type { MensagemGmail } from "@/lib/gmail/mime";

/**
 * As chamadas do Gmail que a sincronização usa, agrupadas numa caixa.
 *
 * É um objeto e não quatro funções soltas por causa do token: `accessTokenDe`
 * troca o refresh token do Vault por um access token a CADA chamada, e uma
 * rodada faz uma chamada de histórico mais duas por mensagem. Pedir o token uma
 * vez por caixa troca N idas ao Google por uma.
 *
 * O token continua não sendo persistido em lugar nenhum — vive no fechamento,
 * pelo tempo da rodada.
 */

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * O cursor ficou velho demais. A Google descarta histórico antigo, e sem tratar
 * este caso a caixa pararia de sincronizar PARA SEMPRE com o job aparecendo
 * verde — o modo de falha mais caro que existe aqui.
 */
export class CursorExpirado extends Error {
  constructor() {
    super("O cursor de histórico do Gmail expirou.");
    this.name = "CursorExpirado";
  }
}

async function pedir<T>(token: string, caminho: string): Promise<T> {
  const r = await fetch(`${BASE}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
    // Route handler não é cacheado por padrão nesta versão, mas o `fetch` do
    // Next pode cachear a chamada EXTERNA: sem isto a sincronização poderia
    // receber a mesma resposta e ficar vendo o mesmo lote para sempre.
    cache: "no-store",
  });

  if (r.status === 404) throw new CursorExpirado();
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new Error(`Gmail ${r.status}: ${corpo.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

/** Um degrau do histórico. O `id` é o que permite retomar do meio. */
export type RegistroHistorico = { id: string; ids: string[] };

export type PaginaHistorico = {
  registros: RegistroHistorico[];
  proximaPagina: string | null;
  /**
   * O `historyId` ATUAL DA CAIXA — não o fim desta página.
   *
   * A distinção é a diferença entre sincronizar e perder e-mail em silêncio:
   * gravar este valor como cursor depois de ler só a primeira página descarta
   * tudo o que estava nas páginas seguintes. Só vira cursor quando
   * `proximaPagina` for nula.
   */
  historyIdDaCaixa: string;
};

/** Só os cabeçalhos que a decisão usa. Corpo não vem aqui, de propósito. */
const CABECALHOS = [
  "From",
  "To",
  "Cc",
  "Delivered-To",
  "Subject",
  "Message-ID",
  "In-Reply-To",
  "References",
  "Date",
  "Auto-Submitted",
  "Precedence",
  "List-Unsubscribe",
  "List-Id",
  "X-Autoreply",
  "X-Autorespond",
];

export type Caixa = {
  /** O `historyId` de agora. É o que a PRIMEIRA sincronização grava, e só isso. */
  cursorAtual(): Promise<string>;
  /** Uma página do histórico a partir do cursor. */
  pagina(cursor: string, pageToken?: string | null): Promise<PaginaHistorico>;
  /** Metadados: quem escreveu, para quem, quando. Sem corpo. */
  metadados(id: string): Promise<MensagemGmail>;
  /**
   * A mensagem inteira, com corpo. Chamada **só** para quem já casou com um
   * negócio: e-mail que não casa nunca tem o corpo lido nem gravado, e é essa
   * propriedade que faz o sync ser aceitável — o CRM não vira espelho da caixa
   * pessoal de ninguém.
   */
  completa(id: string): Promise<MensagemGmail>;
};

export async function abrirCaixa(usuarioId: string): Promise<Caixa> {
  const token = await accessTokenDe(usuarioId);

  return {
    async cursorAtual() {
      const perfil = await pedir<{ historyId?: string }>(token, "/profile");
      if (!perfil.historyId) throw new Error("O Gmail não devolveu historyId no perfil.");
      return perfil.historyId;
    },

    async pagina(cursor, pageToken) {
      // `historyTypes=messageAdded` limita ao que interessa: sem isso vêm
      // também mudanças de rótulo, que não são mensagem nova.
      let caminho =
        `/history?startHistoryId=${encodeURIComponent(cursor)}` +
        `&historyTypes=messageAdded&maxResults=100`;
      if (pageToken) caminho += `&pageToken=${encodeURIComponent(pageToken)}`;

      const r = await pedir<{
        historyId?: string;
        nextPageToken?: string;
        history?: { id?: string; messagesAdded?: { message?: { id?: string } }[] }[];
      }>(token, caminho);

      const registros: RegistroHistorico[] = [];
      for (const h of r.history || []) {
        if (!h.id) continue;
        const ids = new Set<string>();
        for (const add of h.messagesAdded || []) {
          if (add.message?.id) ids.add(add.message.id);
        }
        registros.push({ id: h.id, ids: [...ids] });
      }

      return {
        registros,
        proximaPagina: r.nextPageToken || null,
        historyIdDaCaixa: r.historyId || cursor,
      };
    },

    metadados(id) {
      const q = CABECALHOS.map((h) => `metadataHeaders=${encodeURIComponent(h)}`).join("&");
      return pedir<MensagemGmail>(token, `/messages/${encodeURIComponent(id)}?format=metadata&${q}`);
    },

    completa(id) {
      return pedir<MensagemGmail>(token, `/messages/${encodeURIComponent(id)}?format=full`);
    },
  };
}
