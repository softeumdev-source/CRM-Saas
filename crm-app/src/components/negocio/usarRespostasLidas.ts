"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Ler a conversa marca as respostas como lidas — e apaga o sinal do card no
 * board, em todas as abas abertas, porque o UPDATE em `negocios` viaja pelo
 * realtime que o board já assina.
 *
 * Vive num hook próprio porque tem mais de um chamador: a aba de e-mail hoje, e
 * qualquer tela que venha a MOSTRAR a resposta amanhã. Abrir a Cadência não
 * conta: lá a resposta não aparece, e apagar o sinal ali o perderia sem
 * ninguém ter lido nada.
 *
 * Vai direto do cliente, sem RPC: `negocios_update` tem o USING idêntico ao
 * `negocios_select` e, sem WITH CHECK próprio, o Postgres reaproveita o USING.
 * Ou seja, quem enxerga o card pode atualizá-lo — a mesma permissão que
 * `moverEtapa` já usa.
 *
 * DUAS CORREÇÕES SOBRE A PRIMEIRA VERSÃO, as duas medidas na produção, onde
 * `respostas_lidas_em` estava NULO num negócio com duas respostas lidas:
 *
 * 1. A dependência era só `[negocioId]`, então o efeito rodava uma vez com o
 *    valor capturado na montagem. Resposta que chegasse DEPOIS — pelo realtime,
 *    com a aba de e-mail aberta e a mensagem na tela — nunca era marcada. O
 *    contador subia e ficava. Agora `naoLidas` entra nas dependências.
 *
 * 2. A defesa contra "zerar antes de ser visto" não é mais congelar o efeito, e
 *    sim exigir que a aba esteja VISÍVEL. Uma aba de navegador em segundo plano
 *    não está sendo lida por ninguém; quando ela volta ao primeiro plano, o
 *    `visibilitychange` fecha a conta. É a mesma proteção, sem o buraco.
 */
export function usarRespostasLidas(negocioId: string, naoLidas: number | null | undefined): void {
  useEffect(() => {
    if (!naoLidas) return;

    const marcar = () => {
      // Ninguém está olhando: a resposta continua por ler, e o sinal continua
      // aceso. O ouvinte abaixo tenta de novo quando a aba voltar.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
      void createClient()
        .from("negocios")
        .update({ respostas_nao_lidas: 0, respostas_lidas_em: new Date().toISOString() })
        .eq("id", negocioId);
      return true;
    };

    if (marcar()) return;

    const aoVoltar = () => {
      if (marcar()) document.removeEventListener("visibilitychange", aoVoltar);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [negocioId, naoLidas]);
}
