import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import {
  ESCOPOS_AGENDA,
  ESCOPOS_COM_GMAIL,
  redirectUri,
  temGoogleConfigurado,
} from "@/lib/google/config";
import { urlDeConsentimento } from "@/lib/google/oauth";
import { COOKIE_STATE } from "@/lib/google/estado";

/**
 * Manda a pessoa para a tela de consentimento da Google.
 *
 * O `state` não é enfeite: sem ele, qualquer site conseguiria fazer o navegador
 * de alguém logado bater no nosso callback com um `code` de OUTRA conta Google
 * e a integração ficaria apontando para a conta do atacante. O valor é
 * aleatório, guardado num cookie httpOnly e conferido na volta.
 */
export async function GET(request: NextRequest) {
  if (!temGoogleConfigurado()) {
    return NextResponse.json(
      { error: "Google não configurado. Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET." },
      { status: 503 },
    );
  }
  if (!redirectUri().startsWith("http")) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL não configurada — sem ela o redirect_uri não bate com o cadastrado na Google." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // `?escopo=gmail` pede Agenda + Gmail; qualquer outro valor pede so Agenda.
  // Assim a tela de consentimento nao cresce para quem so quer o convite de
  // reuniao, e quem quer o inbox pede o escopo a mais quando quiser.
  const escopos =
    request.nextUrl.searchParams.get("escopo") === "gmail" ? ESCOPOS_COM_GMAIL : ESCOPOS_AGENDA;

  const state = randomBytes(24).toString("hex");
  const resposta = NextResponse.redirect(urlDeConsentimento(escopos, state));
  resposta.cookies.set(COOKIE_STATE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return resposta;
}
