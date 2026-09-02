"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** Tabela observada por uma assinatura de tempo real. */
export type TabelaObservada = {
  tabela: string;
  /** Filtro do Realtime, ex.: `negocio_id=eq.<uuid>`. */
  filtro?: string;
};

/** Recarga periódica de segurança quando o websocket está saudável. */
const INTERVALO_COM_SOCKET_MS = 45_000;
/** Recarga periódica quando o websocket não subiu (rede/proxy bloqueando). */
const INTERVALO_SEM_SOCKET_MS = 8_000;
/** Janela para agrupar eventos em rajada em uma única recarga. */
const DEBOUNCE_MS = 250;

/**
 * Assina um canal Realtime.
 *
 * Importante: NÃO chamamos `realtime.setAuth(token)` aqui. O `SupabaseClient`
 * já injeta um callback de token (`accessToken`) no cliente de Realtime e o
 * renova sozinho a cada `TOKEN_REFRESHED`. Passar o token na mão marca o socket
 * como "token manual" e o supabase-js para de renovar o JWT nas reconexões —
 * depois que o token expira (≈1h) o canal reconecta com credencial vencida, o
 * RLS derruba os eventos e a tela simplesmente para de atualizar sozinha.
 *
 * Cada assinatura usa um tópico único: dois componentes (ou o duplo-mount do
 * React em desenvolvimento) nunca disputam o mesmo tópico no socket compartilhado.
 *
 * Retorna a função de limpeza — use direto no `return` do `useEffect`.
 */
export function assinarRealtime(
  nome: string,
  configurar: (canal: RealtimeChannel) => RealtimeChannel,
  aoMudarStatus?: (status: string) => void,
): () => void {
  const supabase = createClient();
  let canal: RealtimeChannel | null = null;
  let cancelado = false;

  const topico = `${nome}:${Math.random().toString(36).slice(2, 10)}`;

  (async () => {
    // Só garante que a sessão já foi hidratada antes de entrar no canal.
    await supabase.auth.getSession();
    if (cancelado) return;

    const novo = configurar(supabase.channel(topico));
    if (cancelado) {
      supabase.removeChannel(novo);
      return;
    }
    canal = novo;
    novo.subscribe((status) => {
      if (!cancelado) aoMudarStatus?.(status);
    });
  })();

  return () => {
    cancelado = true;
    if (canal) {
      supabase.removeChannel(canal);
      canal = null;
    }
  };
}

/**
 * Mantém os dados de uma tela sempre atualizados, combinando três gatilhos:
 *
 * 1. Realtime (websocket) — atualiza no instante em que o banco muda;
 * 2. Recarga periódica — rede/proxy podem bloquear o websocket; sem socket o
 *    intervalo fica curto, com socket vira só uma rede de segurança;
 * 3. Voltar para a aba (foco/visibilidade/reconexão de internet).
 *
 * Assim a tela atualiza sozinha mesmo quando o Realtime não está disponível.
 */
export function useSincronizacao(
  recarregar: () => void | Promise<void>,
  opcoes: {
    /** Nome base do canal (um por tela). */
    canal: string;
    tabelas: TabelaObservada[];
    /** Intervalo da recarga de segurança com o socket ativo. */
    intervaloMs?: number;
    ativo?: boolean;
    /** Busca os dados assim que monta (telas que não recebem dados do servidor). */
    carregarAoMontar?: boolean;
  },
): void {
  const { canal, tabelas, intervaloMs = INTERVALO_COM_SOCKET_MS, ativo = true, carregarAoMontar = false } = opcoes;

  // A função de recarga muda a cada render; guardamos em ref para não
  // remontar a assinatura do canal a cada render do componente.
  const recarregarRef = useRef(recarregar);
  useEffect(() => {
    recarregarRef.current = recarregar;
  });

  const chaveTabelas = JSON.stringify(tabelas);

  useEffect(() => {
    if (!ativo) return;

    const observadas: TabelaObservada[] = JSON.parse(chaveTabelas);
    let vivo = true;
    let socketOk = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let intervalo: ReturnType<typeof setInterval> | null = null;

    const rodar = () => {
      if (!vivo || document.hidden) return;
      void recarregarRef.current();
    };

    const agendar = (ms: number = DEBOUNCE_MS) => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(rodar, ms);
    };

    const reiniciarIntervalo = () => {
      if (intervalo) clearInterval(intervalo);
      intervalo = setInterval(rodar, socketOk ? intervaloMs : INTERVALO_SEM_SOCKET_MS);
    };

    const limparCanal = assinarRealtime(
      canal,
      (c) =>
        observadas.reduce(
          (acc, t) =>
            acc.on(
              "postgres_changes",
              t.filtro
                ? { event: "*", schema: "public", table: t.tabela, filter: t.filtro }
                : { event: "*", schema: "public", table: t.tabela },
              () => agendar(),
            ),
          c,
        ),
      (status) => {
        const ok = status === "SUBSCRIBED";
        if (ok !== socketOk) {
          socketOk = ok;
          reiniciarIntervalo();
        }
        // Ao (re)entrar no canal, busca o que mudou enquanto ele esteve fora.
        if (ok) agendar(0);
      },
    );

    const aoVoltar = () => {
      if (!document.hidden) agendar(0);
    };

    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    window.addEventListener("online", aoVoltar);
    reiniciarIntervalo();
    if (carregarAoMontar) agendar(0);

    return () => {
      vivo = false;
      if (debounce) clearTimeout(debounce);
      if (intervalo) clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      window.removeEventListener("online", aoVoltar);
      limparCanal();
    };
  }, [canal, chaveTabelas, intervaloMs, ativo, carregarAoMontar]);
}
