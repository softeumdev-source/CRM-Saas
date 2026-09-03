"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Abrir a conversa marca as respostas como lidas — e apaga o sinal do card no
 * board, em todas as abas abertas, porque o UPDATE em `negocios` viaja pelo
 * realtime que o board já assina.
 *
 * Vive num hook próprio porque agora tem DOIS chamadores: a aba de e-mail e a
 * de WhatsApp. Antes ficava dentro do componente que renderizava a conversa; ao
 * separar as abas, esse componente virou o painel da cadência — e o sinal de
 * resposta passaria a ser apagado por abrir a Cadência, que não é ler a
 * resposta.
 *
 * Vai direto do cliente, sem RPC: `negocios_update` tem o USING idêntico ao
 * `negocios_select` e, sem WITH CHECK próprio, o Postgres reaproveita o USING.
 * Ou seja, quem enxerga o card pode atualizá-lo — a mesma permissão que
 * `moverEtapa` já usa.
 *
 * Depende só do id: não deve disparar de novo a cada resposta que chega
 * enquanto a aba está aberta, senão o contador zeraria antes de ser visto.
 */
export function usarRespostasLidas(negocioId: string, naoLidas: number | null | undefined): void {
  useEffect(() => {
    if (!naoLidas) return;
    void createClient()
      .from("negocios")
      .update({ respostas_nao_lidas: 0, respostas_lidas_em: new Date().toISOString() })
      .eq("id", negocioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId]);
}
