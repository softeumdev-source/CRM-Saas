/**
 * Os escopos, e só os escopos.
 *
 * Vive separado de `config.ts` por um motivo concreto: `config.ts` lê
 * `GOOGLE_CLIENT_SECRET`, e a tela de integrações — que é componente de
 * cliente — precisa saber se uma conexão TEM o escopo do Gmail para decidir o
 * que oferecer. Importar `config.ts` de lá arrastaria o módulo do segredo para
 * o grafo do navegador. Cravar a string do escopo no componente seria a outra
 * saída, e criaria duas verdades que iriam divergir.
 *
 * Nada aqui toca `process.env`. É seguro nos dois lados.
 */

/**
 * Agenda primeiro, Gmail depois — é a ordem decidida no plano.
 * `calendar.events` já entrega o convite de reunião, que é o que a cadência
 * precisa.
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
 * O inbox do card lê a caixa do vendedor. `gmail.readonly` é o PISO real, não
 * uma escolha folgada:
 *
 * - `gmail.metadata`, que seria mais restrito, PROÍBE `format=full` e PROÍBE o
 *   parâmetro `q` no `messages.list` — e sem corpo não há inbox.
 * - `gmail.modify` daria escrita, que não usamos.
 *
 * Os dois são escopos "restricted" da Google e exigiriam avaliação de segurança
 * num app externo. Aqui é irrelevante: o consentimento é Interno do Workspace
 * próprio, e é isso que torna esta decisão viável.
 */
export const ESCOPO_GMAIL = "https://www.googleapis.com/auth/gmail.readonly";

/**
 * Escopo INCREMENTAL: quem já conectou só a Agenda não precisa reconectar do
 * zero. `urlDeConsentimento` manda `include_granted_scopes=true`, então a
 * Google devolve um refresh token com a UNIÃO dos escopos, e
 * `google_guardar_refresh_token` faz `on conflict (usuario_id) do update` —
 * atualiza no lugar, sem órfão e sem segunda conexão.
 */
export const ESCOPOS_COM_GMAIL = [...ESCOPOS_AGENDA, ESCOPO_GMAIL];

export function temGmail(escopos: string[] | null | undefined): boolean {
  return (escopos || []).includes(ESCOPO_GMAIL);
}
