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
 * Só template: mensagem iniciada pela empresa fora de uma janela de conversa
 * aberta exige um template aprovado pela Meta. Não existe caminho de texto
 * livre aqui de propósito — se existisse, seria usado num aperto e a conta
 * levaria a punição.
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
