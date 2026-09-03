/**
 * Configuração do app Google. O consentimento é **Interno** (o Workspace é da
 * própria Softeum), o que dispensa a verificação da Google e permite escopos
 * sensíveis sem processo de revisão.
 */
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

export function temGoogleConfigurado(): boolean {
  return !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET;
}

/**
 * Agenda primeiro, Gmail depois — é a ordem decidida no plano. `calendar.events`
 * já entrega o convite de reunião, que é o que a cadência precisa; pedir
 * `gmail.send` junto aumentaria o susto da tela de consentimento sem entregar
 * nada a mais nesta fase.
 *
 * `openid email` é o que permite saber QUAL conta foi conectada — sem isso a
 * tela só poderia dizer "conectado", sem dizer a quem.
 */
export const ESCOPOS_AGENDA = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

/**
 * O redirect_uri precisa bater EXATAMENTE com o cadastrado no Google Cloud,
 * incluindo esquema e ausência de barra final. Derivar da origem do request
 * faria preview e produção divergirem e a Google recusaria com
 * `redirect_uri_mismatch` — então ele sai de uma variável só.
 */
export function redirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return `${base}/api/google/callback`;
}
