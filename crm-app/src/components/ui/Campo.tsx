import { useId } from "react";

/**
 * 24 dos 30 inputs do projeto nao tinham anel de foco, e nenhum rotulo estava
 * ligado ao campo por htmlFor/id — clicar no rotulo nao focava nada e o leitor
 * de tela nao associava os dois. Aqui as duas coisas sao automaticas.
 *
 * O visual e o mesmo dos campos que ja existiam: fundo slate-50, filete
 * slate-200, raio 12px.
 */
const CONTROLE =
  "w-full px-3 py-2 text-sm rounded-xl " +
  "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 " +
  "text-slate-900 dark:text-slate-100 placeholder:text-slate-400 " +
  "transition-[border-color] duration-150 ease-out " +
  "hover:border-slate-300 dark:hover:border-slate-600 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Campo({
  rotulo,
  dica,
  erro,
  obrigatorio,
  className = "",
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
    <div className={`flex flex-col gap-1 ${className}`}>
      <label
        htmlFor={id}
        className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500"
      >
        {rotulo}
        {obrigatorio && <span className="text-rose-500"> *</span>}
      </label>

      {children({ id, "aria-describedby": idAuxiliar })}

      {(erro || dica) && (
        <span
          id={idAuxiliar}
          className={`text-[11px] ${erro ? "font-semibold text-rose-600" : "text-slate-400"}`}
        >
          {erro || dica}
        </span>
      )}
    </div>
  );
}

export function Entrada({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROLE} ${className}`} {...props} />;
}

export function AreaTexto({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${CONTROLE} resize-y ${className}`} {...props} />;
}

// A setinha nativa e reposta a mao porque appearance-none a remove — sem isso
// o select fica indistinguivel de um input de texto.
const SETA =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2394a3b8' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")";

export function Selecao({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${CONTROLE} cursor-pointer appearance-none pr-9 font-semibold ${className}`}
      style={{
        backgroundImage: SETA,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.65rem center",
        backgroundSize: "1rem",
      }}
      {...props}
    >
      {children}
    </select>
  );
}
