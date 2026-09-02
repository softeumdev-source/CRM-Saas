import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

/**
 * As superficies do estilo Papel. A regra que as separa: o cartao NAO tem
 * contorno — ele se destaca por flutuar sobre um fundo mais fechado. Por isso
 * cartao dentro de Recuo funciona e cartao direto sobre a pagina some.
 */

/** O que flutua: card do kanban, painel, item da lista. */
export function Cartao({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-xl bg-cartao p-4 shadow-cartao", className)} {...props}>
      {children}
    </div>
  );
}

/** Superficie rebaixada que da contraste ao cartao: coluna do kanban, fila. */
export function Recuo({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-2xl bg-recuo", className)} {...props}>
      {children}
    </div>
  );
}

/** Rotulo em caixa alta. Substitui o text-[10px] fora de escala repetido no app. */
export function Rotulo({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={clsx("text-rotulo uppercase text-tinta-fraca", className)}>{children}</span>
  );
}

/** Banner de erro: a mesma receita estava repetida inline em 6 lugares. */
export function Alerta({
  tom = "erro",
  className,
  children,
}: {
  tom?: "erro" | "aviso" | "info";
  className?: string;
  children: React.ReactNode;
}) {
  const TOM = {
    erro: "bg-rose-50 text-rose-700",
    aviso: "bg-amber-50 text-amber-800",
    info: "bg-indigo-50 text-indigo-700",
  } as const;

  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={clsx("rounded-lg px-3 py-2 text-corpo-lg font-medium", TOM[tom], className)}
    >
      {children}
    </div>
  );
}

/** Estado vazio: hoje cada tela improvisa o seu. */
export function Vazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone?: LucideIcon;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {Icone && <Icone className="h-7 w-7 text-tinta-fraca" aria-hidden />}
      <div className="flex flex-col gap-1">
        <span className="text-titulo text-tinta">{titulo}</span>
        {descricao && (
          <span className="max-w-[46ch] text-corpo-lg text-tinta-suave">{descricao}</span>
        )}
      </div>
      {acao}
    </div>
  );
}
