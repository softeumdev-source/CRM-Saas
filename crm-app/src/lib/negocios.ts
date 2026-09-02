import { createClient } from "@/lib/supabase/client";
import { resultadoDaEtapa } from "@/lib/types";
import type { EtapaPipeline } from "@/lib/types";

/**
 * Mover um negócio de etapa existia em DOIS lugares — o board e a tela do
 * negócio — e as cópias já tinham divergido: uma tinha fallback de
 * probabilidade `?? 10` e a outra não, uma marcava `ultima_atividade_em` na
 * mão e a outra não. Aqui existe um caminho só.
 *
 * O que o banco faz sozinho e por isso NÃO está aqui:
 * - `fechado_em` (gatilho trg_negocios_fechado_em, quando `ganho` muda)
 * - `ultima_atividade_em` (gatilho trg_atividades_tocar_negocio, no insert)
 * - histórico de etapa (gatilho trg_neh_update)
 *
 * Vive em lib e não num componente, mas usa o cliente de browser: só pode ser
 * chamada de dentro de um módulo "use client".
 */
export type ResultadoMover = { ok: true; ganho: boolean | null } | { ok: false; erro: string };

export async function moverEtapa({
  negocioId,
  etapa,
  nomeEtapaAnterior,
  probabilidadeAtual,
  usuarioId,
}: {
  negocioId: string;
  etapa: EtapaPipeline;
  nomeEtapaAnterior: string | null | undefined;
  /** Só entra se a etapa de destino não tiver probabilidade própria. */
  probabilidadeAtual: number | null | undefined;
  usuarioId: string;
}): Promise<ResultadoMover> {
  const supabase = createClient();
  const ganho = resultadoDaEtapa(etapa);

  const { error } = await supabase
    .from("negocios")
    .update({
      etapa_id: etapa.id,
      probabilidade: etapa.probabilidade ?? probabilidadeAtual ?? 10,
      ganho,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", negocioId);

  if (error) return { ok: false, erro: error.message };

  // A atividade é o que mantém o histórico coerente e o que dispara o gatilho
  // de `ultima_atividade_em`. Se ela falhar o negócio já se moveu, então não
  // desfaz nada — só não bloqueia a interface.
  await supabase.from("atividades").insert({
    negocio_id: negocioId,
    usuario_id: usuarioId,
    tipo: "mudanca_etapa",
    titulo: `Etapa alterada para: ${etapa.nome}`,
    descricao: `Movido de "${nomeEtapaAnterior ?? "—"}" para "${etapa.nome}".`,
  });

  return { ok: true, ganho };
}

/**
 * Fecha o negócio como ganho ou perdido.
 *
 * Diferente de mover para a etapa de fechamento pelo board: aqui a
 * probabilidade é cravada em 100/0 e o motivo da perda é registrado.
 */
export async function fecharNegocio({
  negocioId,
  etapaAlvo,
  ganho,
  motivo,
  usuarioId,
}: {
  negocioId: string;
  etapaAlvo: EtapaPipeline;
  ganho: boolean;
  motivo: string | null;
  usuarioId: string;
}): Promise<ResultadoMover> {
  const supabase = createClient();

  const { error } = await supabase
    .from("negocios")
    .update({
      etapa_id: etapaAlvo.id,
      ganho,
      motivo_perda: motivo,
      probabilidade: ganho ? 100 : 0,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", negocioId);

  if (error) return { ok: false, erro: error.message };

  await supabase.from("atividades").insert({
    negocio_id: negocioId,
    usuario_id: usuarioId,
    tipo: "mudanca_etapa",
    titulo: ganho ? "Negócio marcado como GANHO" : "Negócio marcado como PERDIDO",
    descricao: motivo ? `Motivo da perda: ${motivo}` : null,
  });

  return { ok: true, ganho };
}
