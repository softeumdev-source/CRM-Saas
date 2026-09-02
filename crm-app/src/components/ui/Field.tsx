import clsx from "clsx";
import { useId } from "react";

/**
 * 24 dos 30 inputs do projeto nao tinham anel de foco, e nenhum rotulo estava
 * ligado ao campo por htmlFor/id. Aqui as duas coisas sao automaticas: o Field
 * gera o id e passa para o rotulo e para o controle.
 *
 * Sem "use client": nao ha estado. useId funciona nos dois lados da fronteira,
 * e o arquivo herda a fronteira de quem importa.
 */

const CONTROLE =
  "w-full rounded-lg bg-cartao px-3 py-2 text-corpo-lg text-tinta " +
  "shadow-cartao placeholder:text-tinta-fraca " +
  "transition-[box-shadow,background-color] duration-150 ease-out " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Field({
  rotulo,
  dica,
  erro,
  obrigatorio,
  className,
  children,
}: {
  rotulo: string;
  dica?: string;
  erro?: string | null;
  obrigatorio?: boolean;
  className?: string;
  /** Recebe o id gerado para amarrar rotulo e controle. */
  children: (props: { id: string; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  const idAuxiliar = erro || dica ? `${id}-aux` : undefined;

  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-rotulo uppercase text-tinta-fraca">
        {rotulo}
        {obrigatorio && <span className="text-rose-600"> *</span>}
      </label>

      {children({ id, "aria-describedby": idAuxiliar })}

      {(erro || dica) && (
        <span
          id={idAuxiliar}
          className={clsx("text-corpo", erro ? "text-rose-600" : "text-tinta-fraca")}
        >
          {erro || dica}
        </span>
      )}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(CONTROLE, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(CONTROLE, "resize-y", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(CONTROLE, "cursor-pointer appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}
