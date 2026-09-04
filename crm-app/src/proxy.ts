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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};
