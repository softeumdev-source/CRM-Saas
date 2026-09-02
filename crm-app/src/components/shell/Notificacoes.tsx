"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Loader2, Trash2 } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import type { Notificacao } from "@/lib/types";
import { formatarDataHora } from "@/lib/atividades";

/**
 * O sino saiu do Navbar para ficar independente da forma da navegacao (barra
 * lateral no desktop, barra de topo no celular). A assinatura realtime dele e
 * a unica do app com filtro por linha e sem dado inicial do servidor — por
 * isso `carregarAoMontar` e o intervalo de 30s continuam iguais.
 *
 * `alinharPor` decide de que lado o painel abre: na lateral ele nasce a
 * direita do botao, no topo ele cai alinhado a direita da tela.
 */
export function Notificacoes({
  usuarioId,
  alinharPor = "direita",
}: {
  usuarioId: string;
  alinharPor?: "direita" | "lateral";
}) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const { data } = await createClient()
      .from("notificacoes")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(30);
    if (data) setNotificacoes(data);
  }, []);

  // O sino e o canal dos lembretes de agendamento: precisa chegar sozinho.
  useSincronizacao(carregar, {
    canal: "notificacoes",
    tabelas: [{ tabela: "notificacoes", filtro: `usuario_id=eq.${usuarioId}` }],
    intervaloMs: 30_000,
    carregarAoMontar: true,
  });

  // Fechar por clique fora e por Escape — o painel antigo so fechava
  // reclicando no sino, entao ficava aberto atras de outras telas.
  useEffect(() => {
    if (!aberto) return;
    const foraDaCaixa = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", foraDaCaixa);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", foraDaCaixa);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  const alternar = async () => {
    const abrindo = !aberto;
    setAberto(abrindo);
    if (!abrindo || naoLidas === 0) return;
    const ids = notificacoes.filter((n) => !n.lida).map((n) => n.id);
    await createClient().from("notificacoes").update({ lida: true }).in("id", ids);
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  const limpar = async () => {
    if (notificacoes.length === 0 || limpando) return;
    setLimpando(true);
    const anteriores = notificacoes;
    const ids = notificacoes.map((n) => n.id);
    setNotificacoes([]);
    const { error } = await createClient().from("notificacoes").delete().in("id", ids);
    if (error) setNotificacoes(anteriores);
    setLimpando(false);
  };

  return (
    <div ref={caixa} className="relative" style={{ isolation: "isolate" }}>
      <button
        type="button"
        onClick={alternar}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : "Notificações"}
        aria-expanded={aberto}
        className="relative rounded-lg p-2 text-stone-400 transition-colors duration-150 ease-out hover:bg-stone-800 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
            {naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          className={clsx(
            "absolute z-20 max-h-96 w-80 overflow-y-auto rounded-xl bg-cartao shadow-flutuante",
            // Na lateral o sino fica no topo do trilho, entao o painel nasce
            // ancorado pelo topo e cresce para baixo; se ancorasse por baixo
            // ele subiria para fora da tela.
            alinharPor === "lateral" ? "top-0 left-full ml-2" : "right-0 mt-2",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <span className="text-titulo text-tinta">Notificações</span>
            {notificacoes.length > 0 && (
              <button
                type="button"
                onClick={limpar}
                disabled={limpando}
                className="flex items-center gap-1 text-corpo font-medium text-tinta-fraca transition-colors duration-150 ease-out hover:text-rose-600 disabled:opacity-50"
              >
                {limpando ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-3 w-3" aria-hidden />
                )}
                Limpar
              </button>
            )}
          </div>

          {notificacoes.length === 0 ? (
            <p className="px-4 pb-4 text-corpo-lg text-tinta-fraca">Nenhuma notificação ainda.</p>
          ) : (
            notificacoes.map((n) => (
              <Link
                key={n.id}
                href={n.link || "#"}
                onClick={() => setAberto(false)}
                className="block px-4 py-3 transition-colors duration-150 ease-out hover:bg-recuo"
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={clsx(
                      "text-corpo-lg font-medium",
                      n.lida ? "text-tinta-suave" : "text-tinta",
                    )}
                  >
                    {n.titulo}
                  </p>
                  {!n.lida && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                  )}
                </div>
                {n.corpo && <p className="mt-0.5 text-corpo text-tinta-suave">{n.corpo}</p>}
                <p className="mt-1 text-corpo text-tinta-fraca">{formatarDataHora(n.criado_em)}</p>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
