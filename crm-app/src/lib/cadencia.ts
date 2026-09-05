import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type Cadencia = Tables<"cadencias">;
export type CadenciaPasso = Tables<"cadencia_passos">;
export type Inscricao = Tables<"cadencia_inscricoes">;
export type Mensagem = Tables<"mensagens">;

export type CadenciaComPassos = Cadencia & { passos: CadenciaPasso[] };

export const ROTULO_STATUS_INSCRICAO: Record<string, string> = {
  ativa: "Em andamento",
  pausada: "Pausada",
  respondeu: "Parada — o lead respondeu",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

/**
 * O "plano de ação": a sequência inteira com as datas, calculada antes de
 * inscrever alguém.
 *
 * Existe porque inscrever um lead é aceitar que ele receba N mensagens ao longo
 * de dias — e um botão "inscrever" sem essa lista pede um compromisso que
 * ninguém consegue avaliar no momento de clicar.
 */
export function planoDaCadencia(
  passos: CadenciaPasso[],
  agora: Date = new Date(),
): { passo: CadenciaPasso; quando: Date }[] {
  let acumulado = agora.getTime();
  return [...passos]
    .sort((a, b) => a.ordem - b.ordem)
    .map((passo) => {
      acumulado += passo.atraso_horas * 3_600_000;
      return { passo, quando: new Date(acumulado) };
    });
}

export type Resultado = { ok: true } | { ok: false; erro: string };

export async function inscrever(
  negocioId: string,
  cadencia: CadenciaComPassos,
  usuarioId: string,
  tenantId: string | null,
): Promise<Resultado> {
  const primeiro = [...cadencia.passos].sort((a, b) => a.ordem - b.ordem)[0];
  if (!primeiro) return { ok: false, erro: "Esta cadência não tem nenhum passo configurado." };

  const { error } = await createClient().from("cadencia_inscricoes").insert({
    tenant_id: tenantId,
    negocio_id: negocioId,
    cadencia_id: cadencia.id,
    inscrito_por: usuarioId,
    // O primeiro toque conta a partir de agora; os seguintes, a partir do
    // anterior. Quem faz essa conta depois é `processar_cadencias()`.
    proximo_envio_em: new Date(Date.now() + primeiro.atraso_horas * 3_600_000).toISOString(),
  });
  if (error) {
    // O UNIQUE(negocio_id, cadencia_id) é o que impede a sequência em dobro.
    if (error.code === "23505") return { ok: false, erro: "Este lead já está nesta cadência." };
    return { ok: false, erro: error.message };
  }
  return { ok: true };
}

export async function mudarStatusDaInscricao(
  inscricaoId: string,
  status: "ativa" | "pausada" | "cancelada",
): Promise<Resultado> {
  const { error } = await createClient()
    .from("cadencia_inscricoes")
    .update({
      status,
      // Pausar e cancelar zeram o relógio; retomar reagenda para agora, senão
      // a inscrição voltaria "ativa" sem data e nunca mais seria processada.
      proximo_envio_em: status === "ativa" ? new Date().toISOString() : null,
    })
    .eq("id", inscricaoId);
  return error ? { ok: false, erro: error.message } : { ok: true };
}

/**
 * A aprovação humana. É o único caminho para uma mensagem sair quando a
 * cadência não é autônoma — o despachante só olha o que já está 'aprovada'.
 */
export async function aprovarMensagem(mensagemId: string, usuarioId: string): Promise<Resultado> {
  const { error } = await createClient()
    .from("mensagens")
    .update({ status: "aprovada", aprovada_por: usuarioId, aprovada_em: new Date().toISOString() })
    .eq("id", mensagemId)
    .eq("status", "aguardando_aprovacao");
  return error ? { ok: false, erro: error.message } : { ok: true };
}

export async function cancelarMensagem(mensagemId: string): Promise<Resultado> {
  const { error } = await createClient()
    .from("mensagens")
    .update({ status: "cancelada" })
    .eq("id", mensagemId)
    .in("status", ["aguardando_aprovacao", "aprovada"]);
  return error ? { ok: false, erro: error.message } : { ok: true };
}

/** Edição do texto antes de aprovar — revisar sem poder corrigir não é revisão. */
export async function salvarTextoDaMensagem(
  mensagemId: string,
  assunto: string | null,
  corpo: string,
): Promise<Resultado> {
  const { error } = await createClient()
    .from("mensagens")
    // `assunto` aceita null porque WhatsApp não tem assunto: gravar "" ali
    // deixaria uma string vazia onde o resto do sistema espera ausência.
    .update({ assunto, corpo, gerado_por: "humano" })
    .eq("id", mensagemId)
    .eq("status", "aguardando_aprovacao");
  return error ? { ok: false, erro: error.message } : { ok: true };
}

/**
 * A tarefa de WhatsApp foi feita: a pessoa abriu a conversa, mandou o texto, e
 * está dizendo isso ao sistema.
 *
 * O caminho é `aguardando_aprovacao` → `enviada`, PULANDO `aprovada`. Não é
 * economia de um passo: `aprovada` é o estado que o despachante pesca
 * (`reservar_mensagens`), e passar por ele — mesmo por um instante — daria uma
 * janela em que o cron poderia tentar mandar a mesma mensagem pela API da Meta.
 * O cliente receberia duas vezes, e a segunda seria cobrada.
 *
 * O `.eq("status", "aguardando_aprovacao")` no fim é o que torna o duplo clique
 * inofensivo: o segundo update não encontra linha e não faz nada.
 */
export async function registrarTarefaEnviada(mensagemId: string, usuarioId: string): Promise<Resultado> {
  const { error } = await createClient()
    .from("mensagens")
    .update({
      status: "enviada",
      enviada_em: new Date().toISOString(),
      // Quem clicou é quem mandou. `aprovada_por` é o campo que o histórico já
      // lê para "quem liberou isto", e aqui liberar e enviar são o mesmo ato.
      aprovada_por: usuarioId,
      aprovada_em: new Date().toISOString(),
    })
    .eq("id", mensagemId)
    .eq("status", "aguardando_aprovacao")
    .eq("envio_manual", true);
  return error ? { ok: false, erro: error.message } : { ok: true };
}
