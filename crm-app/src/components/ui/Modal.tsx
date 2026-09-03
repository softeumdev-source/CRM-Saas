"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Os tres modais do app fechavam so pelo X: sem Escape, sem foco preso, sem
 * portal, sem aria-modal e sem travar a rolagem do fundo. Quem navega por
 * teclado ficava com o foco solto atras do overlay.
 *
 * `isolation: isolate` no overlay: o modal cria o proprio contexto de
 * empilhamento, entao os z-index de dentro nao disputam com o resto da pagina.
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
        className="absolute inset-0 bg-[rgb(12_15_20/0.55)] backdrop-blur-xs"
        onClick={aoFechar}
        aria-hidden
      />

      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={[
          "relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl",
          // O modal e a unica coisa que FLUTUA de verdade, entao e ele que leva
          // a sombra forte — cartao normal fica no fio (craft R10).
          "bg-superficie border border-fio shadow-flutuante",
          largura === "lg" ? "max-w-2xl" : "max-w-lg",
        ].join(" ")}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-fio px-5 py-4">
          <h3 className="text-corpo-lg font-semibold text-tinta">{titulo}</h3>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="foco rounded-lg p-1.5 text-tinta-fraca transition-[background-color,color] duration-150 ease-out hover:bg-recuo hover:text-tinta"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {rodape && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-fio px-5 py-3">
            {rodape}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
