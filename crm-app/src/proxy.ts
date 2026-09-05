import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { redirectComSessao } from "@/lib/redirectComSessao";

// Caminhos que dispensam sessão. O do webhook está COMPLETO de propósito: o
// prefixo curto `/api/whatsapp` liberaria junto `/api/whatsapp/responder`, que
// ENVIA mensagem. Quem autentica o webhook é a assinatura da Meta, conferida
// dentro da própria rota.
const PUBLIC_PATHS = [
  "/login",
  "/aceitar-convite",
  "/assinar",
  "/api/assinar",
  "/api/pdf-publico",
  "/redefinir-senha",
  "/api/whatsapp/webhook",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Caminho EXATO ou subcaminho, não prefixo cru. Com `startsWith(p)` puro a
  // lista era mais larga do que aparenta: `/api/assinar` liberava também
  // `/api/assinar-qualquer-coisa`, e `/login` liberava `/login-o-que-for`.
  // Medido rodando, antes da correção: os dois passavam sem redirecionamento.
  // Nenhuma dessas rotas existe hoje, mas a entrada do webhook logo acima
  // abriria qualquer `/api/whatsapp/webhook*` que alguém criasse depois.
  //
  // Conferido contra as sete entradas: `/login` e `/redefinir-senha` casam
  // exato; as outras cinco são subcaminhos com barra (`/assinar/[token]`,
  // `/api/pdf-publico/[token]/[arquivo]`, ...). Todas continuam públicas.
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return redirectComSessao(url, response);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return redirectComSessao(url, response);
  }

  return response;
}

/**
 * Onde o proxy roda — e, principalmente, onde ele NÃO roda.
 *
 * ARQUIVO ESTÁTICO PRECISA SAIR DAQUI, e a razão é concreta: o `public/` do
 * Next NÃO é público de graça. O proxy é o passo 3 do pipeline e as rotas de
 * sistema de arquivos são o passo 5 — ou seja, ele roda ANTES de o arquivo ser
 * servido. Sem exclusão, `/logo-softeum.png` casa com o matcher, o cliente de
 * e-mail não manda cookie de sessão, e a resposta é um 307 para `/login`.
 *
 * Isso não é hipótese: é o que ia acontecer com a logo da assinatura. O proxy
 * de imagens do Gmail seguiria o redirect, receberia o HTML da tela de login
 * no lugar de `image/png`, e o cliente veria um quadrado vazio no rodapé.
 *
 * A exclusão é por EXTENSÃO, e não pelo nome do arquivo, porque o problema é
 * da classe inteira: a próxima imagem de Open Graph, o próximo ícone, o
 * próximo asset em e-mail cairiam na mesma armadilha. `.mjs` entra na lista
 * por causa de `public/pdf.worker.min.mjs` — hoje ele só é carregado por
 * usuário logado, então o defeito não aparece, mas não há motivo para deixá-lo
 * dependendo disso.
 *
 * As extensões vão em minúsculas E em maiúsculas porque a regex do matcher é
 * sensível à caixa e o Next não aceita a flag `i` num matcher de string.
 * `FOTO.JPG` escaparia da exclusão e voltaria a levar 307 — silenciosamente,
 * que é o pior jeito de falhar. Escrever as duas formas é feio e é a opção
 * honesta; a alternativa (`[pP][nN][gG]`) ninguém consegue ler.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:png|PNG|jpg|JPG|jpeg|JPEG|gif|GIF|svg|SVG|webp|WEBP|ico|ICO|mjs|MJS)$).*)",
  ],
};
