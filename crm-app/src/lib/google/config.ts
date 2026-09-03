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
 * Os escopos moraram aqui, e saíram para `escopos.ts`: a tela de integrações é
 * componente de cliente e precisa deles, mas este arquivo lê
 * `GOOGLE_CLIENT_SECRET` — importá-lo de lá levaria o módulo do segredo para o
 * grafo do navegador. Reexportados para os chamadores de servidor não mudarem.
 */
export {
  ESCOPOS_AGENDA,
  ESCOPO_GMAIL,
  ESCOPOS_COM_GMAIL,
  temGmail,
} from "@/lib/google/escopos";

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
