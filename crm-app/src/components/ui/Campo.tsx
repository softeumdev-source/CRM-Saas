import { useId } from "react";

/**
 * 24 dos 30 inputs do projeto nao tinham anel de foco, e nenhum rotulo estava
 * ligado ao campo por htmlFor/id — clicar no rotulo nao focava nada e o leitor
 * de tela nao associava os dois. Aqui as duas coisas sao automaticas.
 *
 * O `id` vem de `useId()`, e isso e o ponto: existia um `Campo` local em
 * PlanosTab com `id="planostab-1"` FIXO, renderizado quatro vezes no mesmo
 * formulario — quatro rotulos apontando para o mesmo campo.
 */
const CONTROLE =
  "w-full px-3 py-2 text-corpo rounded-xl foco " +
  "bg-recuo border border-fio text-tinta placeholder:text-tinta-fraca " +
  "transition-[border-color] duration-150 ease-out " +
  "hover:border-fio-forte " +
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
      <label htmlFor={id} className="text-rotulo font-medium text-tinta-suave">
        {rotulo}
        {obrigatorio && (
          <span className="text-risco" aria-hidden>
            {" *"}
          </span>
        )}
      </label>

      {children({ id, "aria-describedby": idAuxiliar })}

      {(erro || dica) && (
        <span
          id={idAuxiliar}
          className={`text-rotulo ${erro ? "font-medium text-risco" : "text-tinta-fraca"}`}
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
//
// A cor e um cinza fixo, e nao um token: mascarar o SVG com `currentColor`
// exigiria um pseudo-elemento (a mascara no proprio <select> apagaria o texto).
// Este tom fica entre `--cor-tinta-fraca` clara (#868f9c) e escura (#78818f),
// entao le bem nos dois temas.
const SETA =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238b95a3' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")";

export function Selecao({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${CONTROLE} cursor-pointer appearance-none pr-9 font-medium ${className}`}
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
