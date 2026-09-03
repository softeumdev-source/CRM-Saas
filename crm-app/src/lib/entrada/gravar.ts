import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Resolucao } from "@/lib/entrada/resolver";

type Cliente = SupabaseClient<Database>;

export type MensagemRecebida = {
  externoId: string;
  canal: "email" | "whatsapp";
  /** Endereço do OUTRO lado — quem escreveu (ou para quem escrevemos). */
  destino: string;
  assunto: string | null;
  corpo: string;
  recebidaEm: string;
  automatica: boolean;
  threadExterno: string | null;
  /** Só o e-mail tem: `Message-ID` desta mensagem e o que ela responde. */
  messageIdExterno?: string | null;
  inReplyTo?: string | null;
  direcao: "entrada" | "saida";
};

export type Desfecho = "gravada" | "duplicada" | "quarentena" | "ignorada";

/**
 * O desfecho mais o id da linha, quando ela foi criada.
 *
 * O id passou a ser necessário porque o anexo se pendura na mensagem: sem ele,
 * quem chama teria que buscar de volta pela `idempotency_key` que acabou de
 * gravar — uma ida ao banco a mais por mensagem, para descobrir algo que o
 * insert já sabia.
 */
export type ResultadoDaEntrada = { desfecho: Desfecho; mensagemId?: string };

/**
 * Onde uma mensagem recebida vai parar.
 *
 * Três destinos possíveis, e a diferença entre eles é deliberada:
 *
 * - casou com um negócio → `mensagens`, com o corpo;
 * - contato conhecido mas negócio indefinido → quarentena, SEM o corpo;
 * - remetente desconhecido → **nada**. Não grava, não guarda, não conta.
 *
 * O terceiro caso é o que impede o CRM de virar um espelho da caixa pessoal do
 * vendedor. E o segundo é sem corpo pelo mesmo motivo: metadata basta para
 * alguém decidir a qual negócio pertence.
 */
export async function gravarEntrada(
  supabase: Cliente,
  r: Resolucao,
  m: MensagemRecebida,
  // `usuarioId` é nulo quando quem recebeu não é uma PESSOA: o número de
  // WhatsApp é da empresa, e não há dono de caixa como há no Gmail.
  contexto: { tenantId: string; usuarioId: string | null },
): Promise<ResultadoDaEntrada> {
  if (r.tipo === "desconhecido") return { desfecho: "ignorada" };

  if (r.tipo === "negocio") {
    const { data: linha, error } = await supabase
      .from("mensagens")
      .insert({
        tenant_id: contexto.tenantId,
        negocio_id: r.negocioId,
        contato_id: r.contatoId,
        direcao: m.direcao,
        canal: m.canal,
        // SEMPRE explícito. O default da coluna é `aguardando_aprovacao`, e uma
        // mensagem JÁ ENVIADA que caísse na fila de aprovação seria reenviada ao
        // cliente por quem aprovasse. Vale para os dois sentidos.
        status: m.direcao === "entrada" ? "recebida" : "enviada",
        destino: m.destino,
        assunto: m.assunto,
        corpo: m.corpo || "(sem conteúdo)",
        // Corpo que vem de FORA é sempre texto: HTML de terceiro nunca chega ao
        // DOM. A redução já aconteceu no servidor, em `gmail/mime.ts`.
        corpo_formato: "texto",
        gerado_por: "humano",
        automatica: m.automatica,
        recebida_em: m.recebidaEm,
        enviada_em: m.direcao === "saida" ? m.recebidaEm : null,
        thread_externo: m.threadExterno,
        message_id_externo: m.messageIdExterno ?? null,
        in_reply_to: m.inReplyTo ?? null,
        idempotency_key: m.externoId,
          // Nada agendado: isto não é fila de envio, é registro do que aconteceu.
          agendada_para: null,
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unique_violation na `idempotency_key`. Não é falha: é a
      // reentrega do provedor batendo na trava, que é para o que ela existe.
      if (error.code === "23505") return { desfecho: "duplicada" };
      throw new Error(`Não foi possível gravar a mensagem: ${error.message}`);
    }
    return { desfecho: "gravada", mensagemId: linha?.id };
  }

  // Contato conhecido, negócio indefinido. Chutar um negócio aqui seria pior do
  // que não gravar: a cadência do card ERRADO pararia, e a do certo continuaria
  // disparando — falha silenciosa dos dois lados.
  const { error } = await supabase.from("mensagens_sem_negocio").insert({
    tenant_id: contexto.tenantId,
    usuario_id: contexto.usuarioId,
    canal: m.canal,
    remetente: m.destino,
    assunto: m.assunto,
    externo_id: m.externoId,
    thread_externo: m.threadExterno,
    recebida_em: m.recebidaEm,
    motivo: r.tipo === "ambiguo" ? "ambiguo" : "sem_negocio",
    candidatos: r.tipo === "ambiguo" ? r.candidatos : null,
  });

  if (error) {
    if (error.code === "23505") return { desfecho: "duplicada" };
    throw new Error(`Não foi possível colocar a mensagem em quarentena: ${error.message}`);
  }
  return { desfecho: "quarentena" };
}
