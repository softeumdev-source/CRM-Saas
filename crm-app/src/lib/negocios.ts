import { createClient } from "@/lib/supabase/client";
import { destinoDaEntrega } from "@/lib/pipelines";
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

  // Etapa marcada como `entrega` nao e uma coluna onde o card para: e a
  // passagem para o outro funil. O SDR agenda a reuniao e o negocio ja segue
  // para o vendedor, na etapa de mesmo nome, sem dono — o proximo vendedor
  // livre assume. E o "quando for agendada, manda para o vendedor".
  //
  // A decisao vem de `funcao`, nunca do nome: os dois funis usam a MESMA lista
  // de nomes, entao decidir por nome entregaria tambem o card do vendedor ao
  // chegar em "Demonstracao Agendada" — ele iria para o funil do SDR.
  //
  // Vai pela RPC em vez de update + update: e uma escrita so, transacional, e
  // ela ja valida permissao. Fazer o update aqui e transferir depois deixaria
  // o negocio parado no funil do SDR se a segunda chamada falhasse.
  if (etapa.funcao === "entrega") {
    const destino = await destinoDaEntrega(supabase, etapa.pipeline_id, etapa.ordem);
    if (destino) {
      return transferirDeFunil({
        negocioId,
        etapaDestino: destino.etapa,
        // Sem dono de proposito: cai no pool do funil de destino e aparece no
        // board de todos os vendedores, que e realtime. Notificar cada um seria
        // ruido — e o mesmo criterio que `retomar_leads_em_nutricao` ja usa.
        responsavelId: null,
        titulo: `Entregue para ${destino.pipeline.nome}`,
        descricao:
          `Reunião agendada em "${etapa.nome}": o negócio passou para ${destino.pipeline.nome}, ` +
          `na etapa "${destino.etapa.nome}", sem dono, para o próximo vendedor livre assumir.`,
      });
    }
    // Sem funil de destino configurado a etapa e so mais uma coluna: segue o
    // caminho normal em vez de recusar o movimento.
  }

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

/**
 * Passagem de um negócio de um funil para outro: a entrega do SDR ao vendedor
 * e, no sentido inverso, a devolução de um no-show para a fila de
 * reagendamento.
 *
 * Vai por RPC, e não por `update`, por uma razão do banco e não de estilo: num
 * UPDATE o Postgres exige que a linha NOVA também passe na policy de SELECT.
 * Como a entrega troca o dono, a linha deixa de ser visível para quem entregou
 * e o próprio banco recusa — "new row violates row-level security policy".
 * Afrouxar o SELECT daria ao SDR o funil inteiro do vendedor, então quem
 * confere a autorização é a função: ela valida tenant, permissão sobre o
 * negócio e se o funil de destino é vizinho do seu.
 *
 * De quebra a mudança de etapa e o registro na cadência viram uma transação
 * só: aqui eram dois writes, e o segundo podia falhar sozinho.
 */
export async function transferirDeFunil({
  negocioId,
  etapaDestino,
  responsavelId,
  titulo,
  descricao,
}: {
  negocioId: string;
  etapaDestino: EtapaPipeline;
  /** `null` deixa no pool do funil de destino. */
  responsavelId: string | null;
  titulo: string;
  descricao: string;
}): Promise<ResultadoMover> {
  const { error } = await createClient().rpc("transferir_negocio_de_funil", {
    p_negocio_id: negocioId,
    p_etapa_destino_id: etapaDestino.id,
    // `undefined` omite o parametro, e o default da funcao e null — que e
    // exatamente "deixar no pool do funil de destino".
    p_responsavel_id: responsavelId ?? undefined,
    p_titulo: titulo,
    p_descricao: descricao,
  });

  if (error) return { ok: false, erro: error.message };
  return { ok: true, ganho: resultadoDaEtapa(etapaDestino) };
}
