import { ChartNoAxesColumnDecreasing } from "lucide-react";
import { Cartao } from "@/components/ui";

/**
 * A moldura das telas de porta: login, redefinir senha e aceitar convite.
 *
 * As tres reconstruiam a mesma casca a mao e ja tinham divergido — uma com
 * marca, duas sem; raios e sombras diferentes; a de login com um gradiente
 * decorativo no simbolo. Aqui a porta e uma so, e a marca e a mesma do trilho.
 *
 * Sem "use client": e so estrutura. Herda a fronteira de quem importa.
 */
export function Portao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-superficie px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tinta">
            <ChartNoAxesColumnDecreasing className="h-5 w-5 text-superficie" aria-hidden />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="font-serif text-[26px] leading-none tracking-[-0.012em] text-tinta">
              {titulo}
            </h1>
            {descricao && <p className="text-corpo-lg text-tinta-suave">{descricao}</p>}
          </div>
        </div>

        <Cartao className="p-6 shadow-erguido">{children}</Cartao>
      </div>
    </div>
  );
}
