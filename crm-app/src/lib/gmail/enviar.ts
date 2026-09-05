/**
 * Montagem e envio de e-mail pelo Gmail.
 *
 * Puro até a última linha da montagem: `montarMime` recebe objeto e devolve
 * string, sem rede, sem conta Google e sem navegador. É de propósito — é a
 * peça que decide os bytes que chegam na caixa do cliente, e um erro aqui não
 * aparece no build nem no lint, só no e-mail torto que alguém recebeu.
 *
 * O projeto não tinha uma linha de MIME antes disto. O envio era
 * `resend.emails.send({from,to,subject,html,replyTo})`, que não aceita
 * `headers` — ou seja, não havia como responder DENTRO de uma thread — nem
 * anexo.
 */

import { paraBase64Url } from "@/lib/base64url";
import { accessTokenDe } from "@/lib/google/calendar";

const ENVIO = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const MENSAGENS = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

/** Limite de linha do RFC 2045 para corpo codificado. */
const COLUNAS_BASE64 = 76;

/**
 * Onde um cabeçalho longo dobra.
 *
 * O RFC 5322 manda 78 contando o `\r\n`; 76 deixa a folga e é o mesmo número do
 * corpo em base64 acima, que não é coincidência: os dois limites vêm da mesma
 * era de terminal de 80 colunas.
 */
const COLUNAS_CABECALHO = 76;

export type AnexoParaEnviar = {
  nome: string;
  mime: string;
  conteudo: Buffer;
};

export type EmailParaEnviar = {
  /** Endereço da caixa. Sempre o mesmo; quem muda é o nome exibido. */
  de: string;
  /** Nome exibido: "William (Softeum)" ou "Softeum". */
  nomeDeExibicao?: string | null;
  para: string;
  /**
   * Quem vai em CÓPIA (`Cc`), e recebe de verdade.
   *
   * O Gmail lê os destinatários dos PRÓPRIOS cabeçalhos do `raw` que a gente
   * monta — não existe um campo de envelope separado na API. Então escrever o
   * `Cc:` aqui é literalmente o que faz a mensagem chegar nestes endereços.
   */
  copia?: string[] | null;
  assunto: string;
  html: string;
  /** Alternativa em texto puro. Sem ela, cliente sem HTML vê uma tela vazia. */
  texto?: string | null;
  /** `Message-ID` da mensagem que esta responde. */
  emRespostaA?: string | null;
  /** Cadeia de `Message-ID` da thread, do mais antigo ao mais novo. */
  referencias?: string[] | null;
  anexos?: AnexoParaEnviar[];
};

export type EmailEnviado = {
  /** Id da mensagem no Gmail. */
  id: string;
  /** Id da thread no Gmail — é o que agrupa a conversa no card. */
  threadId: string;
  /** O `Message-ID` que NÓS geramos, para a próxima resposta referenciar. */
  messageId: string;
};

/**
 * RFC 2047: cabeçalho não pode carregar byte fora de ASCII.
 *
 * Não é firula: "Proposta comercial — atualização" tem travessão e til, e um
 * `Subject:` cru com esses bytes chega ilegível em boa parte dos clientes. Só
 * codifica quando precisa, porque um assunto puramente ASCII fica mais legível
 * na fonte sem o embrulho.
 */
export function codificarCabecalho(valor: string): string {
  if (!/[^\u0000-\u007F]/.test(valor)) return valor;
  return `=?utf-8?B?${Buffer.from(valor, "utf-8").toString("base64")}?=`;
}

/**
 * `Nome <endereco@dominio>`, com o nome protegido de duas formas diferentes.
 *
 * FORA DE ASCII → RFC 2047, pelo `codificarCabecalho` acima. "José" vira
 * `=?utf-8?B?Sm9zw6k=?=`.
 *
 * DENTRO DE ASCII, MAS COM CARACTERE ESPECIAL → aspas. O RFC 5322 reserva
 * `( ) < > @ , ; : \ " . [ ]` na parte do nome, e um deles solto quebra o
 * cabeçalho — sem erro nenhum, porque quem reclama é o cliente de e-mail do
 * outro lado. `Softeum (comercial)` viraria um comentário e sumiria; `Machado,
 * William` viraria DOIS destinatários.
 *
 * Isso deixou de ser hipotético quando o nome do remetente virou um campo que
 * a pessoa digita em Admin → Integrações. "William Machado" não precisa de
 * nada disto; o próximo nome que alguém escrever pode precisar.
 */
const ESPECIAIS_RFC5322 = /[()<>@,;:\\".[\]]/;

export function enderecoComNome(email: string, nome?: string | null): string {
  const n = (nome || "").trim();
  if (!n) return email;

  const codificado = codificarCabecalho(n);
  // Já codificado em RFC 2047 é um `atom` — aspas ali quebrariam a decodificação.
  const seguro =
    codificado === n && ESPECIAIS_RFC5322.test(n)
      ? `"${n.replace(/([\\"])/g, "\\$1")}"`
      : codificado;

  return `${seguro} <${email}>`;
}

/** base64 quebrado em 76 colunas, como o RFC 2045 exige. */
function base64EmLinhas(dados: Buffer): string {
  const b64 = dados.toString("base64");
  const linhas: string[] = [];
  for (let i = 0; i < b64.length; i += COLUNAS_BASE64) {
    linhas.push(b64.slice(i, i + COLUNAS_BASE64));
  }
  return linhas.join("\r\n");
}

/**
 * Um cabeçalho de lista de endereços, DOBRADO como o RFC 5322 manda.
 *
 * Vinte e oito endereços numa linha só passam de 800 caracteres, e o RFC 5322
 * limita a linha a 78. Na prática o Gmail engoliria a linha comprida — mas o
 * primeiro uso disto é um teste de entregabilidade, e cabeçalho fora do padrão
 * é exatamente o tipo de coisa que os filtros que estamos medindo cobram.
 *
 * A dobra é `CRLF` seguido de um ESPAÇO: quem lê remonta a linha colando as
 * continuações, e é por isso que a continuação nunca pode começar colada na
 * margem — ali começaria um cabeçalho novo.
 *
 * Endereço não se quebra no meio: um que sozinho passe do limite vai inteiro na
 * própria linha, torto e correto, em vez de virar dois endereços inválidos.
 */
function cabecalhoDeLista(nome: string, enderecos: string[]): string {
  const linhas: string[] = [];
  let atual = `${nome}:`;

  enderecos.forEach((endereco, i) => {
    const pedaco = i < enderecos.length - 1 ? `${endereco},` : endereco;
    if (atual.length + 1 + pedaco.length > COLUNAS_CABECALHO) {
      linhas.push(atual);
      atual = ` ${pedaco}`;
    } else {
      atual += ` ${pedaco}`;
    }
  });

  linhas.push(atual);
  return linhas.join("\r\n");
}

/**
 * Um `Message-ID` nosso.
 *
 * Precisa existir ANTES do envio, e ser gravado: é ele que a próxima resposta
 * do cliente vai citar em `In-Reply-To`, e é assim que a conversa se costura.
 * Deixar o Gmail gerar seria mais simples e nos deixaria sem saber qual foi.
 */
export function novoMessageId(dominio: string): string {
  return `<${crypto.randomUUID()}@${dominio}>`;
}

/** Fronteira única por nível. O `--` do começo é parte do formato. */
function novaFronteira(prefixo: string): string {
  return `${prefixo}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * A mensagem RFC 5322 inteira, pronta para virar `raw`.
 *
 * Estrutura, e o porquê de cada nível:
 * - sem anexo → `multipart/alternative` com texto e HTML. As duas versões da
 *   MESMA mensagem; o cliente escolhe.
 * - com anexo → `multipart/mixed` por fora, com o `alternative` como primeira
 *   parte e os arquivos depois. Pôr o anexo dentro do `alternative` faria o
 *   cliente tratá-lo como uma *versão alternativa do texto* e escondê-lo.
 */
export function montarMime(m: EmailParaEnviar, messageId: string): string {
  const anexos = m.anexos || [];
  const alternativa = novaFronteira("alt");
  const linhas: string[] = [];

  linhas.push(`From: ${enderecoComNome(m.de, m.nomeDeExibicao)}`);
  linhas.push(`To: ${m.para}`);
  // Vazio some do cabeçalho: um `Cc:` sem ninguém é lixo no MIME de toda
  // mensagem normal, que é a esmagadora maioria delas.
  const copia = (m.copia || []).map((e) => e.trim()).filter(Boolean);
  if (copia.length > 0) linhas.push(cabecalhoDeLista("Cc", copia));
  linhas.push(`Subject: ${codificarCabecalho(m.assunto)}`);
  linhas.push(`Message-ID: ${messageId}`);
  if (m.emRespostaA) linhas.push(`In-Reply-To: ${m.emRespostaA}`);
  if (m.referencias?.length) linhas.push(`References: ${m.referencias.join(" ")}`);
  linhas.push("MIME-Version: 1.0");

  const corpoAlternativo = [
    `--${alternativa}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64EmLinhas(Buffer.from(m.texto || textoDoHtml(m.html), "utf-8")),
    "",
    `--${alternativa}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64EmLinhas(Buffer.from(m.html, "utf-8")),
    "",
    `--${alternativa}--`,
  ];

  if (anexos.length === 0) {
    linhas.push(`Content-Type: multipart/alternative; boundary="${alternativa}"`);
    linhas.push("");
    linhas.push(...corpoAlternativo);
    return linhas.join("\r\n");
  }

  const mistura = novaFronteira("mix");
  linhas.push(`Content-Type: multipart/mixed; boundary="${mistura}"`);
  linhas.push("");
  linhas.push(`--${mistura}`);
  linhas.push(`Content-Type: multipart/alternative; boundary="${alternativa}"`);
  linhas.push("");
  linhas.push(...corpoAlternativo);
  linhas.push("");

  for (const a of anexos) {
    linhas.push(`--${mistura}`);
    linhas.push(`Content-Type: ${a.mime}; name="${codificarCabecalho(a.nome)}"`);
    linhas.push(`Content-Disposition: attachment; filename="${codificarCabecalho(a.nome)}"`);
    linhas.push("Content-Transfer-Encoding: base64");
    linhas.push("");
    linhas.push(base64EmLinhas(a.conteudo));
    linhas.push("");
  }
  linhas.push(`--${mistura}--`);

  return linhas.join("\r\n");
}

/**
 * Fallback de texto puro quando o chamador não manda um.
 *
 * Reaproveitaria `htmlParaTexto` de `mime.ts`, mas aquele é para HTML de
 * TERCEIRO, chegando da caixa. Este é para o nosso próprio HTML, que sai de
 * `emailBase`. São problemas diferentes e o daqui é o fácil.
 */
function textoDoHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Manda de verdade, pela conta conectada de `usuarioId`.
 *
 * `threadId` NÃO basta para o cliente do outro lado agrupar a conversa: quem
 * agrupa fora do Gmail são `In-Reply-To` e `References`. E o Gmail recusa um
 * `threadId` cujo assunto não bate com o da thread, por isso quem responde
 * manda o assunto original prefixado de `Re:`.
 */
export async function enviarPeloGmail(
  usuarioId: string,
  m: EmailParaEnviar,
  threadId?: string | null,
): Promise<EmailEnviado> {
  const token = await accessTokenDe(usuarioId);
  const dominio = m.de.split("@")[1] || "softeum.com.br";
  const messageId = novoMessageId(dominio);

  const resp = await fetch(ENVIO, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      raw: paraBase64Url(Buffer.from(montarMime(m, messageId), "utf-8")),
      ...(threadId ? { threadId } : {}),
    }),
    cache: "no-store",
  });

  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    throw new Error(`Gmail ${resp.status}: ${corpo.slice(0, 200)}`);
  }

  const dados = (await resp.json()) as { id?: string; threadId?: string };
  return {
    id: dados.id || "",
    threadId: dados.threadId || "",
    messageId: (await messageIdReal(token, dados.id)) || messageId,
  };
}

/**
 * O `Message-ID` que a mensagem REALMENTE ficou tendo.
 *
 * O Gmail DESCARTA o `Message-ID` que a gente escreve no MIME e põe um dele,
 * `<...@mail.gmail.com>`. Medido na produção: o e-mail saiu com
 * `<dc9fd0eb-…@softeum.com.br>` no nosso banco, e a resposta do cliente voltou
 * com `In-Reply-To: <CANouC3PP…@mail.gmail.com>` — ou seja, o id que a gente
 * guardava não existia em lugar nenhum do mundo.
 *
 * Isso não é cosmético. `montarThread` monta `In-Reply-To` e `References` a
 * partir desta coluna: com um id fantasma, o cliente do outro lado (Outlook,
 * Apple Mail, qualquer um que não seja o Gmail) não tem como pendurar a nossa
 * resposta na conversa, e ela aparece como assunto novo. Dentro do Gmail
 * passava despercebido porque lá quem agrupa é o `threadId`.
 *
 * Custa uma leitura de metadados por envio. O envio JÁ DEU CERTO quando esta
 * função roda — por isso ela nunca lança: falhar aqui devolve `null` e quem
 * chama fica com o id que gerou, que é exatamente o comportamento de antes.
 */
async function messageIdReal(token: string, id: string | undefined): Promise<string | null> {
  if (!id) return null;
  try {
    const r = await fetch(
      `${MENSAGENS}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Message-ID`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!r.ok) return null;
    const m = (await r.json()) as { payload?: { headers?: { name?: string; value?: string }[] } };
    const cab = (m.payload?.headers || []).find((h) => h.name?.toLowerCase() === "message-id");
    const valor = (cab?.value || "").trim();
    return valor || null;
  } catch {
    return null;
  }
}
