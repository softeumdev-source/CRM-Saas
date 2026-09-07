/**
 * O 404 do sistema. Nao existia: um endereco errado — ou um negocio ja excluido,
 * que faz `notFound()` em `(dashboard)/negocios/[id]/page.tsx` — caia na pagina
 * embutida do Next, em ingles e sem nenhuma cor do app.
 *
 * Mora na raiz de `src/app`, entao renderiza dentro do layout raiz e NAO dentro
 * do layout do painel: aqui nao ha navbar. E por isso que o caminho de volta e
 * escrito na tela em vez de ficar subentendido no menu.
 *
 * Server Component: `not-found.tsx` nao recebe props (a doc do Next e explicita
 * nisso), entao nao ha como mostrar a URL pedida sem transformar a pagina em
 * client component so para isso — o que trocaria informacao real por uma
 * repeticao do que ja esta na barra de enderecos.
 */

import Link from "next/link";
import { SearchX } from "lucide-react";
import { Apoio } from "@/components/ui";

export default function NaoEncontrado() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto h-9 w-9 rounded-xl bg-recuo flex items-center justify-center">
          <SearchX className="h-4 w-4 text-tinta-fraca" aria-hidden />
        </span>

        {/* O unico `text-display` da tela, e ele e o assunto (DESIGN.md §3). */}
        <p className="mt-4 text-display font-semibold text-tinta tabular">404</p>

        <h1 className="mt-1 text-titulo font-semibold text-tinta">
          Esta página não existe
        </h1>
        <Apoio className="mt-1">
          O endereço pode ter mudado, ou o registro que estava aqui foi
          excluído. Nada foi perdido no caminho.
        </Apoio>

        <Link
          href="/"
          className="foco mt-5 inline-block rounded-lg text-rotulo font-medium text-acento hover:underline"
        >
          Ir para o painel
        </Link>
      </div>
    </div>
  );
}
