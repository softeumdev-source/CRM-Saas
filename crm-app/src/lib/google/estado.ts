import { timingSafeEqual } from "crypto";

export const COOKIE_STATE = "google_oauth_state";

/**
 * Lê o `state` do cabeçalho Cookie.
 *
 * Escrito como função separada de propósito: a rota de callback vive atrás do
 * middleware de sessão, então não dá para exercitá-la sem um usuário logado —
 * e esta é a parte que protege contra CSRF, justamente a que não pode ficar
 * sem teste. Aqui ela é pura e conferível.
 *
 * O corte é no PRIMEIRO "=" e não em todos: valores base64 terminam em "=" e um
 * `split("=")[1]` os truncaria, fazendo a comparação falhar sempre — uma falha
 * fechada, mas que quebraria a integração sem explicar por quê.
 */
export function lerStateDoCookie(cabecalho: string | null | undefined): string | null {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(";")) {
    const item = parte.trim();
    const corte = item.indexOf("=");
    if (corte <= 0) continue;
    if (item.slice(0, corte) === COOKIE_STATE) {
      return item.slice(corte + 1) || null;
    }
  }
  return null;
}

/**
 * Compara o `state` que voltou da Google com o que guardamos.
 *
 * Sem esta conferência, qualquer site conseguiria fazer o navegador de alguém
 * logado bater no callback com um `code` de OUTRA conta Google, e a integração
 * ficaria apontando para a conta do atacante.
 *
 * A comparação é de tempo constante. O ganho aqui é pequeno (o valor é
 * aleatório e vive dez minutos), mas comparar segredo com `===` é o tipo de
 * hábito que custa caro no dia em que o valor deixar de ser descartável.
 */
export function stateConfere(recebido: string | null | undefined, doCookie: string | null | undefined): boolean {
  if (!recebido || !doCookie) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(doCookie);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
