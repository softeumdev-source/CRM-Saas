/**
 * Extração do que interessa de uma mensagem do Gmail.
 *
 * Puro de propósito: recebe o JSON da API e devolve objeto. É a peça que decide
 * o que entra no banco, e precisa ser exercitável sem rede, sem conta Google e
 * sem navegador.
 */

import { textoDeBase64Url } from "@/lib/base64url";

export type ParteGmail = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
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

/**
 * RFC 2047 na volta: `=?utf-8?B?…?=` vira texto legível.
 *
 * Isto NÃO é refinamento — é um defeito que já existia. Cabeçalho de e-mail só
 * pode carregar ASCII, então todo cliente sério codifica um assunto com acento.
 * Como `lerMensagem` guardava o `Subject` cru, qualquer e-mail em português com
 * acento no assunto — ou seja, quase todos — já entrava no card como
 * `=?utf-8?B?UmU6IFByb3Bvc3Rh…?=`. O teste de ida e volta do envio foi o que
 * escancarou isso.
 *
 * Dois detalhes do RFC que decidem o código:
 * - o espaço ENTRE duas palavras codificadas é separador, não conteúdo (§6.2),
 *   então some; o espaço dentro de uma palavra é dado e fica.
 * - `B` é base64 PADRÃO, não base64url — nada de trocar `-` e `_` aqui, e o
 *   `_` do `Q` significa espaço.
 */
const PALAVRA_CODIFICADA = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

function bytesParaTexto(bytes: Buffer, charset: string): string {
  const c = charset.toLowerCase();
  // `latin1` cobre iso-8859-1 e, na prática, o windows-1252 que aparece em
  // cliente antigo. Charset exótico cai em utf-8 e, na pior das hipóteses,
  // rende alguns caracteres errados — melhor do que devolver a palavra crua.
  if (c === "iso-8859-1" || c === "latin1" || c === "windows-1252") return bytes.toString("latin1");
  return bytes.toString("utf-8");
}

export function decodificarCabecalho(valor: string): string {
  if (!valor.includes("=?")) return valor;
  return valor
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(PALAVRA_CODIFICADA, (inteiro, charset: string, tipo: string, dados: string) => {
      try {
        if (tipo.toUpperCase() === "B") {
          return bytesParaTexto(Buffer.from(dados, "base64"), charset);
        }
        const bytes = Buffer.from(
          dados.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) =>
            String.fromCharCode(parseInt(h, 16)),
          ),
          "latin1",
        );
        return bytesParaTexto(bytes, charset);
      } catch {
        // Palavra malformada volta como veio: texto estranho é melhor do que
        // uma mensagem perdida.
        return inteiro;
      }
    });
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

export type AnexoDoGmail = {
  nome: string;
  mime: string | null;
  tamanho: number | null;
  /** Id para buscar os bytes em `messages/{id}/attachments/{attachmentId}`. */
  attachmentId: string;
};

/**
 * Os anexos da mensagem — exatamente as partes que `acharParte` descarta.
 *
 * A árvore é a mesma; muda o critério: ali interessa a parte SEM `filename` (o
 * corpo), aqui interessa a parte COM `filename` e com `attachmentId` (o
 * arquivo). Uma parte com `filename` mas só `body.data` inline é rara e
 * pequena, e fica de fora de propósito: quase sempre é imagem embutida na
 * assinatura de e-mail, não um anexo que alguém quis mandar.
 */
export function anexosDaMensagem(m: MensagemGmail): AnexoDoGmail[] {
  const achados: AnexoDoGmail[] = [];
  const andar = (parte: ParteGmail | undefined) => {
    if (!parte) return;
    if (parte.filename && parte.body?.attachmentId) {
      achados.push({
        nome: decodificarCabecalho(parte.filename),
        mime: parte.mimeType || null,
        tamanho: parte.body.size ?? null,
        attachmentId: parte.body.attachmentId,
      });
    }
    for (const p of parte.parts || []) andar(p);
  };
  andar(m.payload);
  return achados;
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
  if (plano?.body?.data) return textoDeBase64Url(plano.body.data).trim();

  const html = acharParte(m.payload, "text/html");
  if (html?.body?.data) return htmlParaTexto(textoDeBase64Url(html.body.data));

  // Mensagem de uma parte só: o corpo está na raiz.
  if (m.payload?.body?.data) {
    const cru = textoDeBase64Url(m.payload.body.data);
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
  /** `Message-ID` desta mensagem — a próxima resposta vai citá-lo. */
  messageId: string | null;
  /** `Message-ID` que esta mensagem responde. */
  emRespostaA: string | null;
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
    assunto: decodificarCabecalho(cabecalho(m, "Subject")),
    corpo: corpoEmTexto(m),
    // `internalDate` é o carimbo do PROVEDOR, em ms. Nunca `now()`: uma
    // reentrega atrasada não pode reabrir a janela de 24h sobre e-mail velho.
    recebidaEm: new Date(Number(m.internalDate || Date.now())).toISOString(),
    automatica: ehAutomatica(m),
    // Já vinham na resposta (estão em `CABECALHOS` desde sempre) e eram
    // jogados fora. São eles que costuram a conversa no cliente do outro lado,
    // onde o `threadId` do Gmail não significa nada.
    messageId: cabecalho(m, "Message-ID") || null,
    emRespostaA: cabecalho(m, "In-Reply-To") || null,
    direcao: daPropriaCaixa ? "saida" : "entrada",
  };
}
