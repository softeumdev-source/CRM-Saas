/**
 * Extração do que interessa de uma mensagem do Gmail.
 *
 * Puro de propósito: recebe o JSON da API e devolve objeto. É a peça que decide
 * o que entra no banco, e precisa ser exercitável sem rede, sem conta Google e
 * sem navegador.
 */

export type ParteGmail = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: ParteGmail[];
};

export type MensagemGmail = {
  id: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: ParteGmail;
};

/** Cabeçalho por nome, sem diferenciar maiúscula (o RFC não diferencia). */
export function cabecalho(m: MensagemGmail, nome: string): string {
  const alvo = nome.toLowerCase();
  const h = (m.payload?.headers || []).find((x) => x.name.toLowerCase() === alvo);
  return h?.value?.trim() || "";
}

/** `"Ana Ribeiro" <ana@x.com>` → `ana@x.com`. */
export function endereco(bruto: string): string {
  const entreAngulos = bruto.match(/<([^>]+)>/);
  const e = (entreAngulos ? entreAngulos[1] : bruto).trim().toLowerCase();
  return e.includes("@") ? e : "";
}

/** Todos os endereços de um cabeçalho de lista (`To`, `Cc`). */
export function enderecos(bruto: string): string[] {
  return bruto
    .split(",")
    .map((p) => endereco(p))
    .filter(Boolean);
}

/**
 * Resposta de máquina, e não o lead respondendo.
 *
 * Isto NÃO é firula: `processar_cadencias` encerra a inscrição quando existe
 * uma entrada humana. Sem esta detecção, um único aviso de ausência do
 * escritório mataria a cadência — e o estado final (`respondeu`) pareceria
 * correto para quem olhasse o painel.
 */
export function ehAutomatica(m: MensagemGmail): boolean {
  const auto = cabecalho(m, "Auto-Submitted").toLowerCase();
  if (auto && auto !== "no") return true;
  if (cabecalho(m, "X-Autoreply") || cabecalho(m, "X-Autorespond")) return true;
  if (cabecalho(m, "List-Unsubscribe")) return true;
  if (cabecalho(m, "List-Id")) return true;

  const prec = cabecalho(m, "Precedence").toLowerCase();
  if (["bulk", "auto_reply", "junk", "list"].includes(prec)) return true;

  const de = endereco(cabecalho(m, "From"));
  return /^(mailer-daemon|postmaster|no-?reply|nao-?responda|donotreply)@/.test(de);
}

function deBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf-8");
}

/** Percorre a árvore de partes e devolve a primeira do tipo pedido. */
function acharParte(parte: ParteGmail | undefined, mime: string): ParteGmail | undefined {
  if (!parte) return undefined;
  // Anexo não é corpo: `filename` preenchido significa arquivo.
  if (parte.mimeType === mime && !parte.filename && parte.body?.data) return parte;
  for (const p of parte.parts || []) {
    const achou = acharParte(p, mime);
    if (achou) return achou;
  }
  return undefined;
}

/**
 * HTML para texto, NO SERVIDOR.
 *
 * A decisão do projeto é que HTML de terceiro nunca chega ao DOM. Isto não é
 * sanitizar HTML — é evitar o problema: um bug aqui produz texto feio, não XSS.
 * Escrever um sanitizador com regex é o erro clássico, e não há sanitizador no
 * `node_modules`.
 */
export function htmlParaTexto(html: string): string {
  return html
    // Conteúdo de script/style tem que sair COM a tag; remover só as tags
    // deixaria o código-fonte visível como texto.
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/**
 * O corpo, sempre como TEXTO.
 *
 * Prefere a parte `text/plain` — resposta humana quase sempre tem uma. Só cai
 * na redução quando o e-mail é somente HTML.
 */
export function corpoEmTexto(m: MensagemGmail): string {
  const plano = acharParte(m.payload, "text/plain");
  if (plano?.body?.data) return deBase64Url(plano.body.data).trim();

  const html = acharParte(m.payload, "text/html");
  if (html?.body?.data) return htmlParaTexto(deBase64Url(html.body.data));

  // Mensagem de uma parte só: o corpo está na raiz.
  if (m.payload?.body?.data) {
    const cru = deBase64Url(m.payload.body.data);
    return m.payload.mimeType === "text/html" ? htmlParaTexto(cru) : cru.trim();
  }
  return "";
}

/**
 * A chave que impede gravar a mesma mensagem duas vezes.
 *
 * Usa o `Message-ID` do RFC, não o id do Gmail: o id do Gmail é POR CAIXA,
 * então uma mensagem com dois vendedores em cópia entraria duas vezes. O id do
 * Gmail fica como reserva para o caso raro de e-mail sem Message-ID.
 */
export function chaveDeIdempotencia(m: MensagemGmail, usuarioId: string): string {
  const mid = cabecalho(m, "Message-ID");
  return mid ? `email:${mid}` : `gmail:${usuarioId}:${m.id}`;
}

export type EntradaDeEmail = {
  externoId: string;
  threadId: string;
  remetente: string;
  destinatarios: string[];
  assunto: string;
  corpo: string;
  recebidaEm: string;
  automatica: boolean;
  /** `saida` quando a própria caixa mandou — a pasta Enviados. */
  direcao: "entrada" | "saida";
};

export function lerMensagem(
  m: MensagemGmail,
  usuarioId: string,
  emailDaCaixa: string,
): EntradaDeEmail {
  const de = endereco(cabecalho(m, "From"));
  const daPropriaCaixa = de === emailDaCaixa.trim().toLowerCase();

  return {
    externoId: chaveDeIdempotencia(m, usuarioId),
    threadId: m.threadId || "",
    remetente: de,
    destinatarios: [
      ...enderecos(cabecalho(m, "To")),
      ...enderecos(cabecalho(m, "Cc")),
      ...enderecos(cabecalho(m, "Delivered-To")),
    ],
    assunto: cabecalho(m, "Subject"),
    corpo: corpoEmTexto(m),
    // `internalDate` é o carimbo do PROVEDOR, em ms. Nunca `now()`: uma
    // reentrega atrasada não pode reabrir a janela de 24h sobre e-mail velho.
    recebidaEm: new Date(Number(m.internalDate || Date.now())).toISOString(),
    automatica: ehAutomatica(m),
    direcao: daPropriaCaixa ? "saida" : "entrada",
  };
}
