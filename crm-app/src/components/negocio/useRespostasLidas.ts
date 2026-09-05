"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Ler a conversa marca as respostas como lidas — e apaga o sinal do card no
 * board, em todas as abas abertas, porque o UPDATE em `negocios` viaja pelo
 * realtime que o board já assina.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O DEFEITO QUE VIVEU AQUI, E POR QUE ELE ERA INVISÍVEL
 *
 * Este UPDATE NUNCA SAIU. Nem uma vez, em nenhum deploy. Medido: um negócio
 * com duas respostas ficou com `respostas_lidas_em` NULO e `atualizado_em`
 * congelado, enquanto a pessoa abria o card e lia o e-mail três vezes.
 *
 * A causa é uma linha:
 *
 *     void createClient().from("negocios").update({...}).eq("id", id);
 *
 * O builder do PostgREST é um THENABLE PREGUIÇOSO. Em
 * `@supabase/postgrest-js/src/PostgrestBuilder.ts`, o `fetch` mora dentro de
 * `executeWithRetry`, que é definida E chamada dentro do método `then()`
 * (linha 267; `let res = executeWithRetry()` na 388). Sem `await` e sem
 * `.then()`, ninguém invoca `then()` — e a requisição HTTP simplesmente não
 * acontece. O `void` diz "não me interessa o resultado", e o supabase-js
 * entende "então não faça nada".
 *
 * Nada disso dá erro. Não há exceção, não há linha no console, o `tsc` passa,
 * o lint passa. O código parece certo e não faz nada. Foi o que me fez
 * procurar em RLS, em timing de deploy e em cache de tela — três lugares onde
 * o defeito não estava — antes de olhar aqui.
 *
 * Por isso agora é `await` de verdade, com o erro na cara: um write silencioso
 * que falha em silêncio é a forma mais cara de bug que existe.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ABRIR O NEGÓCIO conta como ler. O critério anterior — só a aba de e-mail
 * apagava o sinal — era estrito demais e deixava o aviso aceso depois de a
 * pessoa fazer a única coisa que podia fazer.
 *
 * A trava que sobrou é a certa: a aba do NAVEGADOR precisa estar visível. Uma
 * aba em segundo plano não está sendo lida por ninguém, e o `visibilitychange`
 * fecha a conta quando ela volta.
 *
 * O UPDATE vai direto do cliente, sem RPC: `negocios_update` tem o USING
 * idêntico ao `negocios_select` e, sem WITH CHECK próprio, o Postgres
 * reaproveita o USING. Quem enxerga o card pode atualizá-lo.
 */
export function useRespostasLidas(negocioId: string, naoLidas: number | null | undefined): void {
  useEffect(() => {
    if (!naoLidas) return;

    let vivo = true;

    /** Devolve `true` quando a marcação foi TENTADA (aba visível). */
    const marcar = async (): Promise<boolean> => {
      // Ninguém está olhando: a resposta continua por ler e o sinal continua
      // aceso. O ouvinte abaixo tenta de novo quando a aba voltar.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;

      // `await`, e não `void`: sem ele o supabase-js não manda nada. Ver o
      // bloco no topo deste arquivo.
      const { error } = await createClient()
        .from("negocios")
        .update({ respostas_nao_lidas: 0, respostas_lidas_em: new Date().toISOString() })
        .eq("id", negocioId);

      // Não há tela onde mostrar isto — é faxina de fundo. Mas o console é
      // melhor do que o silêncio de antes: se voltar a falhar, dá para ver.
      if (error && vivo) {
        console.error("Não foi possível marcar as respostas como lidas:", error.message);
      }
      return true;
    };

    const aoVoltar = () => {
      void marcar().then((feito) => {
        if (feito) document.removeEventListener("visibilitychange", aoVoltar);
      });
    };

    void marcar().then((feito) => {
      if (!feito && vivo) document.addEventListener("visibilitychange", aoVoltar);
    });

    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [negocioId, naoLidas]);
}
