import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { emailDoIdToken, trocarCodigoPorTokens } from "@/lib/google/oauth";
import { COOKIE_STATE, lerStateDoCookie, stateConfere } from "@/lib/google/estado";

function voltar(destino: string, erro?: string) {
  const url = new URL(destino);
  if (erro) url.searchParams.set("google_erro", erro);
  else url.searchParams.set("google", "conectado");
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const destino = `${base.replace(/\/+$/, "")}/admin?aba=integracoes`;

  const erroGoogle = url.searchParams.get("error");
  if (erroGoogle) return voltar(destino, erroGoogle);

  const codigo = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateEsperado = lerStateDoCookie(request.headers.get("cookie"));

  if (!codigo || !stateConfere(state, stateEsperado)) {
    return voltar(destino, "state_invalido");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return voltar(destino, "sem_sessao");
  if (!temServiceRole()) return voltar(destino, "sem_service_role");

  let tokens;
  try {
    tokens = await trocarCodigoPorTokens(codigo);
  } catch (e) {
    return voltar(destino, e instanceof Error ? e.message : "falha_na_troca");
  }

  // Sem refresh token a integração morre em uma hora. Acontece quando a conta
  // já autorizou antes e a Google decide não reemitir; melhor recusar agora,
  // com uma mensagem, do que gravar uma conexão que vai parar sozinha.
  if (!tokens.refresh_token) {
    return voltar(destino, "sem_refresh_token");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("google_guardar_refresh_token", {
    p_usuario_id: user.id,
    p_email: emailDoIdToken(tokens.id_token) || user.email || "conta Google",
    p_refresh_token: tokens.refresh_token,
    // Sem fallback para ESCOPOS_AGENDA: gravar um escopo que a Google NAO
    // confirmou e registrar uma permissao que talvez nao exista, e depois o
    // sync tentaria para sempre e tomaria 403 sem ninguem entender por que.
    // No fluxo de authorization_code `tokens.scope` vem sempre preenchido com
    // a uniao; lista vazia e mais honesto do que um chute.
    p_escopos: (tokens.scope || "").split(" ").filter(Boolean),
  });
  if (error) return voltar(destino, error.message);

  const resposta = voltar(destino);
  resposta.cookies.delete(COOKIE_STATE);
  return resposta;
}
