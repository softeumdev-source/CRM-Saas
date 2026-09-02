import { createClient } from "@/lib/supabase/client";
import { resultadoDaEtapa } from "@/lib/types";
import type { EtapaPipeline } from "@/lib/types";

/**
 * Mover um negocio de etapa existia em DOIS lugares — o board e a tela do
 * negocio — e as copias ja tinham divergido: uma tinha fallback de
 * probabilidade `?? 10` e a outra nao. Aqui existe um caminho so.
 *
 * O que o banco faz sozinho, e por isso NAO esta aqui:
 * - `fechado_em` (gatilho trg_negocios_fechado_em, quando `ganho` muda)
 * - `ultima_atividade_em` (gatilho trg_atividades_tocar_negocio, no insert)
 * - historico de etapa (gatilho trg_neh_update)
 *
 * Vive em lib mas usa o cliente de browser: so pode ser chamada de dentro de
 * um modulo "use client".
 */
export type ResultadoMover = { ok: true; ganho: boolean | null } | { ok: false; erro: string };

export async function moverEtapa({
  negocioId,
  etapa,
  nomeEtapaAnterior,
  probabilidadeAtual,
  usuarioId,
  sufixoDescricao = "",
}: {
  negocioId: string;
  etapa: EtapaPipeline;
  nomeEtapaAnterior: string | null | undefined;
  /** So entra se a etapa de destino nao tiver probabilidade propria. */
  probabilidadeAtual: number | null | undefined;
  usuarioId: string;
  /** Ex.: " no pipeline", para a atividade dizer de onde veio o movimento. */
  sufixoDescricao?: string;
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

  // A atividade e o que mantem o historico coerente e o que dispara o gatilho
  // de `ultima_atividade_em`. Se ela falhar o negocio ja se moveu, entao nao
  // desfaz nada — so nao bloqueia a interface.
  await supabase.from("atividades").insert({
    negocio_id: negocioId,
    usuario_id: usuarioId,
    tipo: "mudanca_etapa",
    titulo: `Etapa alterada para: ${etapa.nome}`,
    descricao: `Movido de "${nomeEtapaAnterior ?? "—"}" para "${etapa.nome}"${sufixoDescricao}.`,
  });

  return { ok: true, ganho };
}

/**
 * Fecha o negocio como ganho ou perdido. Diferente de arrastar para a etapa de
 * fechamento: aqui a probabilidade e cravada em 100/0 e o motivo e registrado.
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
