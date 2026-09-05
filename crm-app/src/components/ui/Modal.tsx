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

/** Os controles em que se DIGITA ou se escolhe — o alvo do foco de abertura. */
const CAMPO =
  'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), ' +
  'select:not([disabled]), textarea:not([disabled])';

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

  /**
   * O handler mora numa ref, e o efeito depende SO de `aberto`.
   *
   * Isto conserta um bug que tornava impossivel digitar em qualquer modal:
   *
   * `aoTeclar` depende de `aoFechar`, e os 14 chamadores passam `aoFechar` como
   * arrow inline (`aoFechar={() => setEncerrando(null)}`) — funcao NOVA a cada
   * render. Quando o componente que abre o modal tambem guarda o estado do
   * campo (o caso de "Perdi", em `NegocioDetailClient`), cada TECLA digitada
   * re-renderizava o pai, criava um `aoFechar` novo, invalidava as dependencias
   * e fazia este efeito rodar de novo — inclusive a linha que foca o primeiro
   * controle.
   *
   * Medido no navegador, digitando "Preço acima" no motivo da perda:
   *
   *   "P"→Fechar  "r"→Fechar  "e"→Fechar  "ç"→Fechar  "o"→Fechar  " "→FECHOU
   *
   * O foco pulava para o botao "X" na primeira tecla, as seguintes caiam no
   * vazio, o estado terminava como "Pç", e o ESPACO — que num botao focado vale
   * como clique — fechava o modal e jogava fora o que a pessoa tinha escrito.
   *
   * A ref e o mesmo padrao que `useSincronizacao` (`lib/supabase/realtime.ts`)
   * ja usa neste projeto pelo mesmo motivo: o handler pode mudar a cada render
   * sem que a assinatura precise ser refeita.
   */
  const aoTeclarRef = useRef(aoTeclar);
  useEffect(() => {
    aoTeclarRef.current = aoTeclar;
  });

  useEffect(() => {
    if (!aberto) return;

    focoAnterior.current = document.activeElement as HTMLElement | null;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const ouvinte = (e: KeyboardEvent) => aoTeclarRef.current(e);
    document.addEventListener("keydown", ouvinte);

    // Foco de abertura: o primeiro CAMPO, e nao o primeiro focavel.
    //
    // Em ordem de DOM o primeiro focavel e sempre o "X" do cabecalho, entao
    // abrir "Perdi" deixava o cursor no botao de fechar e exigia um Tab para
    // comecar a escrever o motivo — atrito exatamente no fluxo reclamado.
    // Num dialogo de formulario, o lugar do cursor e o formulario.
    //
    // Sem campo nenhum (os modais de confirmar), cai no primeiro focavel, que
    // e o comportamento de antes. Sem nada focavel, foca o painel, para o
    // leitor de tela anunciar o dialogo. (`??` nao serve aqui: focus() devolve
    // undefined, entao o lado direito rodaria sempre e roubaria o foco.)
    const primeiroCampo = painel.current?.querySelector<HTMLElement>(CAMPO);
    const primeiroFocavel = primeiroCampo || painel.current?.querySelector<HTMLElement>(FOCAVEL);
    if (primeiroFocavel) primeiroFocavel.focus();
    else painel.current?.focus();

    return () => {
      document.removeEventListener("keydown", ouvinte);
      document.body.style.overflow = rolagem;
      focoAnterior.current?.focus();
    };
  }, [aberto]);

  if (!aberto || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ isolation: "isolate" }}
    >
      <div
        className="absolute inset-0 bg-veu backdrop-blur-xs"
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
