import { NextResponse } from "next/server";

/**
 * Redirecionar SEM jogar fora os cookies que o Supabase acabou de renovar.
 *
 * Este era o furo do middleware, e ele estava lá desde o primeiro commit do
 * projeto. O `setAll` do `@supabase/ssr` grava a sessão renovada num
 * `NextResponse`; devolver um `NextResponse.redirect(url)` cru descarta esse
 * objeto inteiro, e com ele o `Set-Cookie`.
 *
 * Por que isso DERRUBA a sessão em vez de só atrasá-la: quando o access token
 * vence, a renovação **rotaciona o refresh token** — o antigo é consumido e
 * invalidado no servidor. Se o cookie novo não chega ao navegador, ele fica
 * segurando um token que não vale mais. A sessão não expira: ela morre, e a
 * pessoa cai no login no meio do uso.
 *
 * O modo de falha é traiçoeiro porque some no caminho feliz: devolver o próprio
 * `response` carrega os cookies certos, então quem navega sem ser redirecionado
 * nunca vê o problema. Ele aparece só quando a renovação cai junto com um
 * redirect — e aí parece intermitente, que é o pior tipo de bug para achar.
 *
 * Vive fora de `proxy.ts` porque aquele arquivo o Next trata de forma especial
 * (espera `proxy` e `config`), e porque aqui a função pode ser importada por um
 * teste sem arrastar o middleware inteiro junto.
 */
export function redirectComSessao(destino: URL | string, comCookiesDe: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(destino);
  // `getAll()` devolve o cookie COM as opções (httpOnly, path, sameSite,
  // maxAge). Repassar só nome e valor produziria um cookie de sessão sem
  // `httpOnly` e sem `path` — que o navegador aceita, e que seria um segundo
  // problema em cima do primeiro.
  for (const cookie of comCookiesDe.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
