import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri } from "@/lib/google/config";
import { textoDeBase64Url } from "@/lib/base64url";

const AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

/**
 * URL da tela de consentimento.
 *
 * `access_type=offline` + `prompt=consent` são o que garante um refresh token.
 * Sem `prompt=consent`, a Google devolve refresh token só na PRIMEIRA
 * autorização de cada conta — quem reconectasse depois receberia apenas um
 * access token de uma hora e a integração morreria silenciosamente 60 minutos
 * depois.
 */
export function urlDeConsentimento(escopos: string[], state: string): string {
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: escopos.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTORIZACAO}?${p.toString()}`;
}

export type TokensGoogle = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
};

async function pedirToken(corpo: Record<string, string>): Promise<TokensGoogle> {
  const resp = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo).toString(),
  });
  const dados = await resp.json();
  if (!resp.ok) {
    throw new Error(dados.error_description || dados.error || "Falha ao falar com a Google.");
  }
  return dados as TokensGoogle;
}

export function trocarCodigoPorTokens(codigo: string): Promise<TokensGoogle> {
  return pedirToken({
    code: codigo,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
}

export function renovarAccessToken(refreshToken: string): Promise<TokensGoogle> {
  return pedirToken({
    refresh_token: refreshToken,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
}

/**
 * O e-mail da conta conectada sai do `id_token`. Só o payload é lido, e apenas
 * para exibição — a confiança na identidade vem do canal (o token acabou de
 * chegar da Google por HTTPS), não desta leitura, então não há verificação de
 * assinatura aqui e este valor nunca é usado para autorizar nada.
 */
export function emailDoIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const partes = idToken.split(".");
  if (partes.length < 2) return null;
  try {
    const json = textoDeBase64Url(partes[1]);
    const payload = JSON.parse(json) as { email?: string };
    return payload.email || null;
  } catch {
    return null;
  }
}
