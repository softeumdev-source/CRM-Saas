"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";

/**
 * Os tres modais do app fechavam so pelo X: sem Escape, sem foco preso, sem
 * portal, sem aria-modal e sem travar a rolagem do fundo. Quem navega por
 * teclado ficava com o foco solto atras do overlay.
 *
 * Precisa de "use client": usa efeito, ref e portal.
 */

const FOCAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  aberto,
  aoFechar,
  titulo,
  largura = "md",
  children,
  rodape,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  largura?: "md" | "lg";
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  const aoTeclar = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        aoFechar();
        return;
      }
      if (e.key !== "Tab" || !painel.current) return;

      // Prende o foco: Tab no ultimo volta ao primeiro e vice-versa.
      const alvos = painel.current.querySelectorAll<HTMLElement>(FOCAVEL);
      if (alvos.length === 0) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];

      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    },
    [aoFechar],
  );

  useEffect(() => {
    if (!aberto) return;

    focoAnterior.current = document.activeElement as HTMLElement | null;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", aoTeclar);

    // Foca o primeiro controle; se nao houver nenhum, o proprio painel, para o
    // leitor de tela anunciar o dialogo. (?? nao serve aqui: focus() devolve
    // undefined, entao o lado direito rodaria sempre e roubaria o foco.)
    const primeiroFocavel = painel.current?.querySelector<HTMLElement>(FOCAVEL);
    if (primeiroFocavel) primeiroFocavel.focus();
    else painel.current?.focus();

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = rolagem;
      focoAnterior.current?.focus();
    };
  }, [aberto, aoTeclar]);

  if (!aberto || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ isolation: "isolate" }}
    >
      <div
        className="absolute inset-0 bg-stone-900/40"
        onClick={aoFechar}
        aria-hidden
      />

      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={clsx(
          "relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl",
          "bg-cartao shadow-flutuante",
          largura === "lg" ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-4">
          <h2 className="text-titulo text-tinta">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-tinta-fraca transition-colors duration-150 ease-out hover:bg-recuo hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {rodape && (
          <div className="flex shrink-0 items-center justify-end gap-2 bg-recuo px-5 py-3">
            {rodape}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
