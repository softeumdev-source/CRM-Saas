import { createClient } from "@/lib/supabase/client";

/**
 * Registrar no CRM uma mensagem de WhatsApp trocada FORA dele.
 *
 * POR QUE ISTO EXISTE
 *
 * Mandar pelo WhatsApp Web é grátis; a API da Meta cobra ~R$ 0,32 por mensagem
 * fria. A escolha foi mandar na mão. O preço disso é que a conversa acontece
 * fora do sistema — e três coisas param de funcionar:
 *
 *   1. o card não acende o selo de "o cliente respondeu";
 *   2. a cadência não para, e o robô continua mandando e-mail para quem já
 *      está conversando com você;
 *   3. quem pegar o lead depois não vê nada do que foi dito.
 *
 * Este registro é o que fecha os três. Não é automático — é a pessoa dizendo
 * ao sistema o que aconteceu — e por isso a tela nunca marca sozinha: pergunta.
 *
 * A DIREÇÃO MUDA MAIS DO QUE O RÓTULO
 *
 * Registrar uma mensagem de ENTRADA dispara o gatilho
 * `trg_mensagens_sinalizar_resposta`: acende o selo azul no Kanban, sobe o lead
 * para o topo da coluna e faz `processar_cadencias` encerrar a inscrição no
 * próximo ciclo. É o item 1 e o item 2 de uma vez.
 */

export type DirecaoManual = "saida" | "entrada";

export type ResultadoDoRegistro = { ok: true } | { ok: false; erro: string };

export async function registrarMensagemManual(params: {
  tenantId: string | null;
  negocioId: string;
  contatoId: string | null;
  destino: string;
  corpo: string;
  direcao: DirecaoManual;
}): Promise<ResultadoDoRegistro> {
  const corpo = params.corpo.trim();
  if (!corpo) return { ok: false, erro: "Escreva o texto antes de registrar." };

  const agora = new Date().toISOString();
  const entrada = params.direcao === "entrada";

  const { error } = await createClient()
    .from("mensagens")
    .insert({
      tenant_id: params.tenantId,
      negocio_id: params.negocioId,
      contato_id: params.contatoId,
      canal: "whatsapp",
      direcao: params.direcao,
      // SEMPRE explícito. O default da coluna é `aguardando_aprovacao`, e uma
      // mensagem já trocada que caísse na fila de aprovação seria REENVIADA ao
      // cliente por quem aprovasse — pela API, e cobrada.
      status: entrada ? "recebida" : "enviada",
      destino: params.destino,
      corpo,
      // Texto puro: isto veio de um campo de digitação, não do nosso editor.
      corpo_formato: "texto",
      gerado_por: "humano",
      automatica: false,
      recebida_em: entrada ? agora : null,
      enviada_em: entrada ? null : agora,
      // O carimbo é de AGORA, e não da hora em que a conversa aconteceu de
      // verdade. É uma imprecisão conhecida e aceita: pedir a hora exata a cada
      // registro faria ninguém registrar, e o que importa aqui é a ordem dos
      // fatos, não o minuto.
      agendada_para: null,
      // Não há id externo: a chave só precisa não colidir. Registro manual é
      // uma decisão consciente, e repetir o mesmo texto de propósito é
      // legítimo — foi o que a pessoa fez do outro lado.
      idempotency_key: `manual:${params.negocioId}:${crypto.randomUUID()}`,
    });

  if (error) return { ok: false, erro: `Não foi possível registrar: ${error.message}` };
  return { ok: true };
}
