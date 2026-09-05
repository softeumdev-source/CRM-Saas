"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * As abas do app. Existiam escritas a mao em quatro telas, e em nenhuma delas
 * eram abas de verdade: eram `<button>` dentro de um `<div>`, sem
 * `role="tablist"`, sem `aria-selected`, sem navegacao por seta. Para quem usa
 * leitor de tela era uma fileira de botoes sem relacao com o conteudo abaixo;
 * para quem usa teclado, oito Tabs para atravessar o admin.
 *
 * Ativacao automatica (a seta ja troca de aba) e o padrao WAI-ARIA para abas
 * cujo conteudo ja esta carregado — que e o caso aqui.
 */

export interface Aba<C extends string> {
  chave: C;
  rotulo: string;
  /** Opcional. Ajuda quando sao muitas abas — o admin tem oito. */
  icone?: React.ComponentType<{ className?: string }>;
  /** Numero ao lado do rotulo. `0` aparece; `undefined` nao. */
  contagem?: number;
  /** Ponto de atencao, para "tem coisa aqui" sem numero. */
  alerta?: boolean;
}

export function Abas<C extends string>({
  abas,
  valor,
  aoTrocar,
  idBase,
  className = "",
}: {
  abas: readonly Aba<C>[];
  valor: C;
  aoTrocar: (chave: C) => void;
  /** Liga cada aba ao seu painel. Use o mesmo valor no `PainelDaAba`. */
  idBase: string;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const aoTeclar = (e: React.KeyboardEvent) => {
    const i = abas.findIndex((a) => a.chave === valor);
    if (i < 0) return;
    let alvo = -1;
    if (e.key === "ArrowRight") alvo = (i + 1) % abas.length;
    else if (e.key === "ArrowLeft") alvo = (i - 1 + abas.length) % abas.length;
    else if (e.key === "Home") alvo = 0;
    else if (e.key === "End") alvo = abas.length - 1;
    if (alvo < 0) return;
    e.preventDefault();
    const chave = abas[alvo].chave;
    aoTrocar(chave);
    refs.current[chave]?.focus();
  };

  return (
    <div
      role="tablist"
      onKeyDown={aoTeclar}
      className={[
        "flex items-center gap-1 p-1 rounded-xl bg-recuo w-fit max-w-full overflow-x-auto",
        className,
      ].join(" ")}
    >
      {abas.map((a) => {
        const ativa = a.chave === valor;
        return (
          <button
            key={a.chave}
            ref={(el) => {
              refs.current[a.chave] = el;
            }}
            role="tab"
            type="button"
            id={`${idBase}-aba-${a.chave}`}
            aria-selected={ativa}
            aria-controls={`${idBase}-painel-${a.chave}`}
            // Roving tabindex: um Tab entra no grupo, as setas andam dentro.
            tabIndex={ativa ? 0 : -1}
            onClick={() => aoTrocar(a.chave)}
            className={[
              "foco inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5",
              "text-rotulo transition-[background-color,color] duration-150 ease-out",
              ativa
                ? "bg-superficie text-tinta font-semibold shadow-cartao"
                : "text-tinta-suave font-medium hover:text-tinta",
            ].join(" ")}
          >
            {a.icone ? <a.icone className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            {a.rotulo}
            {a.contagem !== undefined ? (
              <span className={ativa ? "text-tinta-fraca tabular" : "text-tinta-fraca tabular"}>
                {a.contagem}
              </span>
            ) : null}
            {a.alerta ? (
              <span
                className="h-1.5 w-1.5 rounded-full bg-risco"
                // O ponto e redundante com o texto do painel; anunciar "bullet"
                // so atrapalha. Quem precisa da informacao a recebe la dentro.
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** O painel de uma aba. Sem isto, `aria-controls` aponta para o nada. */
export function PainelDaAba({
  idBase,
  chave,
  ativa,
  children,
}: {
  idBase: string;
  chave: string;
  ativa: boolean;
  children: ReactNode;
}) {
  if (!ativa) return null;
  return (
    <div
      role="tabpanel"
      id={`${idBase}-painel-${chave}`}
      aria-labelledby={`${idBase}-aba-${chave}`}
      // O painel recebe foco ao ser alcancado por link direto; -1 permite isso
      // sem coloca-lo na ordem de Tab.
      tabIndex={-1}
      // L2: 160ms para o olho entender que o conteudo trocou, sem esperar.
      // A `key` reinicia a animacao a cada troca; sem ela o CSS nao redispara.
      key={chave}
      className="entra-aba foco outline-none"
    >
      {children}
    </div>
  );
}

/**
 * Estado da aba que sobrevive ao F5 e ao link compartilhado.
 *
 * Grava com `history.replaceState`, NAO com o router do Next, por dois motivos:
 * trocar de aba nao e navegar (nao deve empilhar historico nem ir ao servidor),
 * e `useSearchParams` obriga a envolver a arvore num `<Suspense>` — sob pena de
 * o build QUEBRAR se a rota algum dia for estatica. O doc desta versao avisa
 * que em desenvolvimento a falta do Suspense passa despercebida e so aparece no
 * build de producao. Aqui nao ha essa armadilha.
 *
 * O valor inicial vem do servidor (que ja leu a query), entao nao ha divergencia
 * de hidratacao.
 */
export function useAbaNaUrl<C extends string>(
  inicial: C,
  { parametro = "tab" }: { parametro?: string } = {},
): [C, (chave: C) => void] {
  const [aba, setAba] = useState<C>(inicial);

  const trocar = useCallback(
    (chave: C) => {
      setAba(chave);
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      url.searchParams.set(parametro, chave);
      window.history.replaceState(window.history.state, "", url);
    },
    [parametro],
  );

  return [aba, trocar];
}

/** Gera um `idBase` estavel quando a tela nao tem um id natural para usar. */
export function useIdDeAbas(prefixo: string): string {
  const id = useId();
  return `${prefixo}${id}`;
}
