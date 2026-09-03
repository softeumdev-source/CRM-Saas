/**
 * Selo e Alerta — as duas formas de mostrar estado no app.
 *
 * Havia TRES mapas de cor concorrentes codificando a mesma escala semantica:
 * `COR_STATUS` em MensagensTab (7 status), `PRIORIDADE_COR` em LeadCard, e os
 * do admin. Cada um escolhia seu proprio par de slate/emerald/amber/rose, com
 * opacidades diferentes no escuro. Aqui a escala e uma so, e o nome dela e o
 * SIGNIFICADO — `tom="risco"` — nao a cor: quando o vermelho do app mudar, o
 * codigo que diz "risco" continua certo.
 */

import type { ReactNode } from "react";

export type Tom = "neutro" | "acento" | "ok" | "alerta" | "risco" | "info";

const SELO: Record<Tom, string> = {
  neutro: "bg-recuo text-tinta-suave",
  acento: "bg-acento-fraco text-acento",
  ok: "bg-ok-fraco text-ok",
  alerta: "bg-alerta-fraco text-alerta",
  risco: "bg-risco-fraco text-risco",
  info: "bg-info-fraco text-info",
};

export function Selo({
  tom = "neutro",
  icone: Icone,
  className = "",
  children,
}: {
  tom?: Tom;
  icone?: React.ComponentType<{ className?: string }>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-lg px-2 py-0.5",
        "text-rotulo font-medium whitespace-nowrap",
        SELO[tom],
        className,
      ].join(" ")}
    >
      {Icone ? <Icone className="h-3 w-3 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}

/**
 * Ponto colorido de 6px, para quando o card so tem espaco para um sinal e nao
 * para uma palavra. Sempre acompanhado de `title` ou de texto ao lado: cor
 * sozinha nao e informacao acessivel.
 */
export function Ponto({ tom = "neutro", className = "" }: { tom?: Tom; className?: string }) {
  const COR: Record<Tom, string> = {
    neutro: "bg-tinta-fraca",
    acento: "bg-acento",
    ok: "bg-ok",
    alerta: "bg-alerta",
    risco: "bg-risco",
    info: "bg-info",
  };
  return (
    <span
      aria-hidden
      className={["inline-block h-1.5 w-1.5 rounded-full shrink-0", COR[tom], className].join(" ")}
    />
  );
}

/**
 * Caixa de aviso. Era escrita a mao em dezenas de lugares como
 * `bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs`,
 * com opacidades divergentes no escuro.
 *
 * `role="alert"` so quando o aviso APARECE em resposta a uma acao (um erro de
 * salvamento). Aviso que ja estava na tela ao carregar nao deve interromper o
 * leitor de tela — por isso e opcao, e nao o padrao.
 */
export function Alerta({
  tom = "alerta",
  icone: Icone,
  titulo,
  urgente = false,
  className = "",
  children,
}: {
  tom?: Tom;
  icone?: React.ComponentType<{ className?: string }>;
  titulo?: string;
  urgente?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const CAIXA: Record<Tom, string> = {
    neutro: "bg-recuo text-tinta-suave",
    acento: "bg-acento-fraco text-acento",
    ok: "bg-ok-fraco text-ok",
    alerta: "bg-alerta-fraco text-alerta",
    risco: "bg-risco-fraco text-risco",
    info: "bg-info-fraco text-info",
  };
  return (
    <div
      role={urgente ? "alert" : undefined}
      className={["flex items-start gap-2 rounded-xl px-3 py-2.5", CAIXA[tom], className].join(" ")}
    >
      {Icone ? <Icone className="h-4 w-4 shrink-0 mt-px" aria-hidden /> : null}
      <div className="min-w-0 text-rotulo">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        {children ? <div className={titulo ? "mt-0.5" : ""}>{children}</div> : null}
      </div>
    </div>
  );
}
