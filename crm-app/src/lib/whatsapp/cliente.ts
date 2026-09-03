const VERSAO = "v21.0";

export function temWhatsappConfigurado(): boolean {
  return !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

export type ResultadoWhatsapp = {
  enviado: boolean;
  id?: string;
  erro?: string;
  /** Código da Meta. É o que o monitor usa em vez de casar texto de erro. */
  codigo?: string;
};

/**
 * Envia um template aprovado.
 *
 * Mensagem iniciada pela empresa fora de uma janela de conversa aberta exige um
 * template aprovado pela Meta. Este é o caminho para isso, e é o caminho da
 * cadência.
 *
 * Texto livre existe em `enviarTextoLivre`, logo abaixo, e **só** vale dentro
 * da janela de 24h. A separação em duas funções é para que usar a errada seja
 * uma decisão visível, e não um descuido: o ESLint recusa importar
 * `enviarTextoLivre` fora da rota de resposta.
 *
 * O número vai só com dígitos. A Meta recusa qualquer formatação, e é o tipo
 * de erro que aparece como "número inválido" sem dizer por quê.
 */
export async function enviarTemplate(params: {
  para: string;
  template: string;
  variaveis: string[];
  idioma?: string;
}): Promise<ResultadoWhatsapp> {
  const token = process.env.WHATSAPP_TOKEN;
  const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !numeroId) {
    return { enviado: false, erro: "WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configurados." };
  }

  const destino = (params.para || "").replace(/\D/g, "");
  if (destino.length < 10) {
    return { enviado: false, erro: `Número inválido: "${params.para}".`, codigo: "destino_invalido" };
  }

  const corpo = {
    messaging_product: "whatsapp",
    to: destino,
    type: "template",
    template: {
      name: params.template,
      language: { code: params.idioma || "pt_BR" },
      components: params.variaveis.length
        ? [
            {
              type: "body",
              parameters: params.variaveis.map((v) => ({ type: "text", text: v || "—" })),
            },
          ]
        : [],
    },
  };

  return mandar(token, numeroId, corpo);
}

/**
 * Texto livre — e a razão pela qual isto NÃO é uma função qualquer.
 *
 * A Meta só aceita texto livre dentro de 24 horas contadas a partir da última
 * mensagem que o CLIENTE mandou. Fora dela é violação de política, e o preço é
 * a nota de qualidade do número cair até o banimento.
 *
 * Esta função **não confere a janela**, e isso é deliberado: a conferência
 * precisa acontecer com a linha do negócio em mãos, no servidor, junto do
 * `pausado` e do teto por hora. Quem faz isso é
 * `src/app/api/whatsapp/responder/route.ts`, e o ESLint recusa importar daqui
 * em qualquer outro arquivo — no mesmo molde da trava que protege
 * `etapas_pipeline`. Sem essa trava, esta função seria usada "num aperto" e a
 * conta levaria a punição, que é exatamente o que o comentário antigo temia.
 */
export async function enviarTextoLivre(params: {
  para: string;
  texto: string;
}): Promise<ResultadoWhatsapp> {
  const token = process.env.WHATSAPP_TOKEN;
  const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !numeroId) {
    return { enviado: false, erro: "WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configurados." };
  }

  const destino = (params.para || "").replace(/\D/g, "");
  if (destino.length < 10) {
    return { enviado: false, erro: `Número inválido: "${params.para}".`, codigo: "destino_invalido" };
  }
  const texto = params.texto.trim();
  if (!texto) {
    return { enviado: false, erro: "Mensagem vazia.", codigo: "texto_vazio" };
  }

  return mandar(token, numeroId, {
    messaging_product: "whatsapp",
    to: destino,
    type: "text",
    // A Meta gera prévia de link por padrão. Desligar evita que um link no meio
    // da resposta vire um cartão gigante na conversa do cliente.
    text: { body: texto, preview_url: false },
  });
}

/**
 * O POST para a Graph API. Um só para os dois tipos de envio — eram idênticos
 * menos pelo corpo, e duas cópias divergiriam no tratamento de erro, que é
 * justamente o que o monitor de bloqueio lê.
 */
async function mandar(
  token: string,
  numeroId: string,
  corpo: Record<string, unknown>,
): Promise<ResultadoWhatsapp> {
  try {
    const resp = await fetch(`https://graph.facebook.com/${VERSAO}/${numeroId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = await resp.json();
    if (!resp.ok) {
      return {
        enviado: false,
        erro: dados?.error?.message || `HTTP ${resp.status}`,
        codigo: String(dados?.error?.code ?? resp.status),
      };
    }
    return { enviado: true, id: dados?.messages?.[0]?.id };
  } catch (e) {
    return { enviado: false, erro: e instanceof Error ? e.message : String(e), codigo: "rede" };
  }
}

/**
 * Baixa a mídia de uma mensagem recebida.
 *
 * Duas idas, e a Meta exige as duas: `GET /{media-id}` devolve uma URL
 * temporária, e só ela dá os bytes — com o token de novo, porque a URL não é
 * pública. É por isso que guardar a URL não resolveria nada: ela expira, e o
 * que precisa durar é o `id`.
 */
export async function baixarMidia(mediaId: string): Promise<Buffer> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("WHATSAPP_TOKEN não configurado.");

  const meta = await fetch(`https://graph.facebook.com/${VERSAO}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!meta.ok) throw new Error(`Meta ${meta.status} ao pedir o link da mídia.`);
  const { url } = (await meta.json()) as { url?: string };
  if (!url) throw new Error("A Meta não devolveu URL para esta mídia.");

  const arquivo = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!arquivo.ok) throw new Error(`Meta ${arquivo.status} ao baixar a mídia.`);
  return Buffer.from(await arquivo.arrayBuffer());
}
