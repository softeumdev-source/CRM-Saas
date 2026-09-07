"use client";

/**
 * A tela de erro do painel. Nao existia nenhuma: qualquer excecao de servidor
 * dentro do dashboard caia na tela branca embutida do Next ("Application error:
 * a server-side exception has occurred") — em ingles, sem navbar, sem uma cor
 * do sistema e sem caminho de volta.
 *
 * Esta fica DENTRO de `(dashboard)/layout.tsx`, entao o shell continua montado:
 * a navbar segue na tela e a pessoa nao perde a navegacao por causa de uma
 * consulta que falhou. `error.tsx` NAO cobre o layout do proprio segmento — se
 * o layout do painel quebrar, quem atende e `src/app/global-error.tsx`.
 *
 * Regra 14: nada de esconder o que aconteceu em nome de limpeza. A mensagem e o
 * `digest` aparecem quando existem — em producao o Next troca a mensagem de um
 * erro de servidor por uma generica e so o `digest` liga o que a pessoa viu a
 * linha do log. Sem ele na tela, o suporte comeca no escuro.
 */

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Alerta, Apoio, Botao, Cartao } from "@/components/ui";

export default function ErroDoPainel({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  /**
   * `unstable_retry` chegou no Next 16.2 (esta versao e a 16.2.12) e e o que a
   * doc manda usar: ele REBUSCA o segmento no servidor. `reset` continua vindo
   * — o runtime passa os dois — mas so limpa o estado do boundary e re-renderiza
   * o que ja estava em memoria, o que num erro de consulta quebra de novo na
   * hora. Ambos ficam opcionais no tipo porque o nome com `unstable_` ainda pode
   * mudar; assim uma renomeacao vira um clique sem efeito, e nao um build
   * quebrado.
   */
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error("[painel] erro nao tratado:", error.message, error.digest);
  }, [error]);

  const tentarDeNovo =
    unstable_retry ?? reset ?? (() => window.location.reload());

  return (
    <div className="mx-auto w-full max-w-leitura px-4 sm:px-6 py-10">
      <Cartao>
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-risco-fraco flex items-center justify-center">
            <TriangleAlert className="h-4 w-4 text-risco" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-titulo font-semibold text-tinta">
              Esta tela não carregou
            </h1>
            <Apoio className="mt-1 max-w-[62ch]">
              A falha aconteceu ao montar a tela, no servidor. Tentar de novo
              refaz a consulta; se repetir, avise o time com o código abaixo.
            </Apoio>

            {error.message ? (
              <Alerta
                tom="risco"
                titulo="O que o sistema respondeu"
                urgente
                className="mt-4"
              >
                <p className="break-words">{error.message}</p>
              </Alerta>
            ) : null}

            {error.digest ? (
              <p className="mt-3 text-rotulo text-tinta-fraca">
                Código da falha:{" "}
                <span className="font-mono text-tinta-suave">{error.digest}</span>
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Botao variante="primario" icone={RotateCw} onClick={() => tentarDeNovo()}>
                Tentar de novo
              </Botao>
              {/*
                Acento no link porque link e ACAO (DESIGN.md §2). O `Botao` nao
                serve aqui: ele e `<button>`, e isto e navegacao — trocar a tag
                custaria um destino que nao abre em nova aba e nao aparece para
                o leitor de tela como link.
              */}
              <Link
                href="/"
                className="foco rounded-lg text-rotulo font-medium text-acento hover:underline"
              >
                Voltar ao painel
              </Link>
            </div>
          </div>
        </div>
      </Cartao>
    </div>
  );
}
