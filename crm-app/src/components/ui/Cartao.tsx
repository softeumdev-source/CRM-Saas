/**
 * A superficie do app. Existia escrita a mao em toda tela, como
 * `bg-white dark:bg-slate-900 rounded-3xl border border-slate-200
 * dark:border-slate-800 shadow-xs p-5`, com CINCO paddings diferentes
 * (p-4/p-5/p-6/p-8/p-10) e tres raios.
 *
 * Elevacao aqui e uma linguagem so (craft R10): fio para estrutura, sombra
 * apenas para o que flutua. Por isso `Cartao` nao empilha fio + sombra forte +
 * mudanca de fundo; quem flutua e o `Modal`, e ele usa `shadow-flutuante`.
 *
 * Sem "use client": nao ha estado. Herda a fronteira de quem importa.
 */

import type { ReactNode } from "react";

type Preenchimento = "sm" | "md" | "lg" | "nenhum";

const PREENCHIMENTO: Record<Preenchimento, string> = {
  nenhum: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export function Cartao({
  preenchimento = "lg",
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { preenchimento?: Preenchimento }) {
  return (
    <div
      className={[
        "bg-superficie border border-fio rounded-2xl shadow-cartao",
        PREENCHIMENTO[preenchimento],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Bloco recuado DENTRO de um cartao — o "campo dentro do formulario", a caixa
 * de resumo, a previa. Nao leva fio: dois fios aninhados a 4px de distancia
 * viram ruido. O degrau de cor ja separa.
 */
export function Recuo({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["bg-recuo rounded-xl p-3", className].join(" ")} {...props}>
      {children}
    </div>
  );
}

/**
 * O rotulo de secao. Havia TRES convencoes concorrentes disputando o mesmo
 * papel dentro de `src/components/admin` — `font-bold text-sm` (8x),
 * `font-extrabold text-base` (4x) e `text-lg font-extrabold` (3x).
 */
export function Rotulo({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={["text-corpo-lg font-semibold text-tinta", className].join(" ")}
      {...props}
    >
      {children}
    </h2>
  );
}

/** Linha de apoio sob um `Rotulo`. Existe para o titulo nao precisar explicar. */
export function Apoio({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={["text-rotulo text-tinta-suave", className].join(" ")} {...props}>
      {children}
    </p>
  );
}

/**
 * Estado vazio. Estava escrito ad-hoc em cada lista, quase sempre so como um
 * texto cinza — que nao diz o que fazer a seguir (craft R11: os caminhos
 * infelizes sao onde o acabamento aparece).
 */
export function Vazio({
  icone: Icone,
  titulo,
  children,
  acao,
}: {
  icone?: React.ComponentType<{ className?: string }>;
  titulo: string;
  /** Uma frase dizendo o que fazer — nao "nenhum resultado". */
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-2">
      {Icone ? <Icone className="h-6 w-6 text-tinta-fraca" aria-hidden /> : null}
      <p className="text-corpo font-medium text-tinta">{titulo}</p>
      {children ? (
        <p className="text-rotulo text-tinta-suave max-w-[46ch]">{children}</p>
      ) : null}
      {acao ? <div className="mt-2">{acao}</div> : null}
    </div>
  );
}
