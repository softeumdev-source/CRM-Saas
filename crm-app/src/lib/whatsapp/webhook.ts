import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A leitura do que a Meta manda — pura, sem rede e sem banco.
 *
 * Separada da rota porque é onde estão as decisões que precisam ser
 * exercitáveis sem conta na Meta (que hoje não existe): a conferência da
 * assinatura e o que cada tipo de mensagem vira.
 */

/**
 * Confere o `X-Hub-Signature-256` sobre o corpo **BRUTO**.
 *
 * O corpo tem que chegar aqui como veio no fio: `request.json()` seguido de
 * re-serialização **não reproduz os mesmos bytes**, e o HMAC deixa de conferir.
 * Parece problema da Meta, e é re-serialização. Por isso a rota faz
 * `request.text()` antes de qualquer parse.
 *
 * O que difere, medido — não é a ordem das chaves de texto, que o `stringify`
 * preserva, e é justamente por isso que a armadilha é traiçoeira: com um
 * payload simples ela FUNCIONA, e quebra num real.
 *
 *   {"a": 1}          -> {"a":1}        espaço, e qualquer formatação
 *   {"2":"b","1":"a"} -> {"1":"a",...}  chave que parece inteiro é reordenada
 *   "caf\u00e9"       -> "café"         escape unicode vira o caractere
 *   {"n":1.0}         -> {"n":1}        formatação de número
 *   {"n":1e3}         -> {"n":1000}
 *
 * `timingSafeEqual` ESTOURA quando os buffers têm tamanhos diferentes, então o
 * comprimento é conferido antes. Comparar com `===` funcionaria, mas vazaria
 * pelo tempo quantos bytes iniciais o atacante acertou.
 */
export function assinaturaConfere(cru: string, cabecalho: string | null, segredo: string): boolean {
  if (!cabecalho || !segredo) return false;

  const recebida = cabecalho.startsWith("sha256=") ? cabecalho.slice(7) : cabecalho;
  const esperada = createHmac("sha256", segredo).update(cru, "utf8").digest("hex");

  const a = Buffer.from(recebida, "hex");
  const b = Buffer.from(esperada, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export type MensagemMeta = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  /**
   * Mídia. Cada tipo traz `id` (para `GET /{media-id}`) e `mime_type`; imagem e
   * vídeo trazem `caption`, e documento traz `filename`.
   *
   * Nada disto existia no tipo, e por isso era descartado antes de qualquer
   * decisão — inclusive a LEGENDA, que é texto que o cliente digitou e que se
   * perdia inteira numa foto com comentário.
   */
  image?: { id?: string; mime_type?: string; caption?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  sticker?: { id?: string; mime_type?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  errors?: { title?: string }[];
};

export type MidiaMeta = { id: string; mime: string | null; nome: string };

/**
 * O arquivo anexado à mensagem, quando há um.
 *
 * O `id` é o que torna o download possível — e é ele que era jogado fora. O
 * link da Meta expira, então guardar a URL não adiantaria; guardar o id, sim.
 */
export function midiaDaMensagem(m: MensagemMeta): MidiaMeta | null {
  const mapa: [string, { id?: string; mime_type?: string; filename?: string } | undefined, string][] = [
    ["image", m.image, "imagem"],
    ["video", m.video, "video"],
    ["audio", m.audio, "audio"],
    ["sticker", m.sticker, "figurinha"],
    ["document", m.document, "documento"],
  ];
  for (const [tipo, obj, padrao] of mapa) {
    if (m.type === tipo && obj?.id) {
      return { id: obj.id, mime: obj.mime_type || null, nome: obj.filename || `${padrao}-${obj.id}` };
    }
  }
  return null;
}

export type ValorMeta = {
  metadata?: { phone_number_id?: string };
  messages?: MensagemMeta[];
  statuses?: unknown[];
};

/** Achata `entry[].changes[].value` — a Meta pode mandar vários de uma vez. */
export function valoresDoPayload(corpo: unknown): ValorMeta[] {
  const p = corpo as { entry?: { changes?: { value?: ValorMeta }[] }[] } | null;
  const fora: ValorMeta[] = [];
  for (const e of p?.entry || []) {
    for (const c of e.changes || []) {
      if (c.value) fora.push(c.value);
    }
  }
  return fora;
}

/**
 * O texto de uma mensagem, por tipo.
 *
 * Mídia vira MARCADOR, nunca a URL: baixar o arquivo exige o token e o link da
 * Meta expira, então guardar a URL seria guardar um link morto no card. O
 * marcador ao menos diz à pessoa que existe um anexo para procurar no celular.
 *
 * Devolve `null` quando não há nada que valha uma linha na conversa — a rota
 * ignora esses.
 */
export function corpoDaMensagem(m: MensagemMeta): string | null {
  switch (m.type) {
    case "text":
      return m.text?.body?.trim() || null;
    case "button":
      return m.button?.text?.trim() || null;
    case "interactive":
      return (
        m.interactive?.button_reply?.title?.trim() ||
        m.interactive?.list_reply?.title?.trim() ||
        null
      );
    // A legenda vem em `image.caption`/`video.caption`, NUNCA em `text.body` —
    // por isso uma foto com comentario perdia o comentario inteiro. O marcador
    // continua quando nao ha legenda, para a linha nao ficar vazia.
    case "image":
      return m.image?.caption?.trim() || "[imagem]";
    case "sticker":
      return "[figurinha]";
    case "audio":
      return "[áudio]";
    case "video":
      return m.video?.caption?.trim() || "[vídeo]";
    case "location":
      return "[localização]";
    case "contacts":
      return "[contato]";
    case "document":
      return (
        m.document?.caption?.trim() ||
        (m.document?.filename ? `[documento: ${m.document.filename}]` : "[documento]")
      );
    // `unsupported` é a Meta dizendo que ELA não conseguiu processar. Registrar
    // ajuda quem for entender por que a conversa tem um buraco.
    case "unsupported":
      return `[mensagem não suportada${m.errors?.[0]?.title ? `: ${m.errors[0].title}` : ""}]`;
    default:
      return `[${m.type}]`;
  }
}

/**
 * O carimbo da Meta, em ISO.
 *
 * `timestamp` vem como unix em SEGUNDOS, e como string. Usar `now()` no lugar
 * reabriria a janela de 24h sobre uma mensagem velha numa reentrega atrasada —
 * e a janela é justamente o que autoriza mandar texto livre. Um carimbo
 * ilegível vira `null` e quem chama decide, em vez de virar 1970.
 */
export function recebidaEm(timestamp: string | undefined): string | null {
  const seg = Number(timestamp);
  if (!Number.isFinite(seg) || seg <= 0) return null;
  return new Date(seg * 1000).toISOString();
}
