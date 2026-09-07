"use client";

/**
 * A rede de seguranca de ultima instancia: entra quando o proprio layout raiz
 * quebra, e por isso SUBSTITUI o documento inteiro — precisa de `<html>` e
 * `<body>` proprios.
 *
 * Duas consequencias que a doc do Next deixa explicitas e que este arquivo
 * paga uma a uma:
 *
 * 1. Ele nao herda os estilos globais. Sem o `import "./globals.css"` abaixo
 *    nao existe token nenhum aqui — nem `bg-fundo`, nem `text-tinta` — e a
 *    pagina cai no branco puro do navegador.
 * 2. Ele nao herda a fonte. Sem carregar a Inter, `--font-inter` fica sem
 *    valor; como `--font-sans` comeca por `var(--font-inter)`, a declaracao
 *    inteira vira invalida e o texto sai em serifa. Por isso a fonte e
 *    carregada aqui do mesmo jeito que no layout raiz.
 *
 * Tambem nao aceita `metadata` (error boundary e Client Component), entao o
 * titulo da aba vem do `<title>` do React.
 *
 * O conteudo e curto de proposito: esta tela roda quando ja se sabe pouco sobre
 * o que quebrou. Ela nao consulta nada, nao usa efeito e nao depende do router.
 */

import { Inter } from "next/font/google";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Apoio, Botao, Cartao } from "@/components/ui";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export default function ErroGlobal({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  /** Ver a nota em `(dashboard)/error.tsx`: `unstable_retry` rebusca, `reset` so limpa. */
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  const tentarDeNovo =
    unstable_retry ?? reset ?? (() => window.location.reload());

  return (
    <html lang="pt-BR" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased bg-fundo text-tinta">
        <title>Erro — CRM Softeum</title>

        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <Cartao className="w-full max-w-md">
            <span className="h-9 w-9 rounded-xl bg-risco-fraco flex items-center justify-center">
              <TriangleAlert className="h-4 w-4 text-risco" aria-hidden />
            </span>

            <h1 className="mt-3 text-titulo font-semibold text-tinta">
              O CRM não conseguiu abrir
            </h1>
            <Apoio className="mt-1">
              A falha foi antes da tela existir, então não dá para dizer em qual
              parte do sistema ela aconteceu. Tentar de novo costuma resolver
              quando é uma queda momentânea de conexão com o banco.
            </Apoio>

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
                `<a>` cru, e nao `<Link>`, DE PROPOSITO: esta tela substitui o
                layout raiz, entao e a unica do app em que nao da para contar
                com o router do Next de pe. `<Link>` faria navegacao macia
                dentro da arvore que acabou de quebrar; o `href` recarrega o
                documento, que e o que recupera aqui. A regra do lint supoe um
                app inteiro funcionando — a excecao e o assunto deste arquivo.
              */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="foco rounded-lg text-rotulo font-medium text-acento hover:underline"
              >
                Ir para o início
              </a>
            </div>
          </Cartao>
        </div>
      </body>
    </html>
  );
}
