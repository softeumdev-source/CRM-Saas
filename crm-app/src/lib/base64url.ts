/**
 * base64url, nos dois sentidos.
 *
 * O decodificador existia duplicado — `gmail/mime.ts` para o corpo da mensagem
 * e `google/oauth.ts` para o payload do id_token —, com a mesma troca de
 * caracteres escrita à mão nos dois. O codificador não existia, porque nada
 * neste projeto nunca precisou MANDAR e-mail.
 *
 * Um detalhe que a versão antiga não tratava e agora trata: base64url legítimo
 * vem SEM o `=` do final, e `Buffer.from(..., "base64")` do Node aceita isso.
 * Mas quem gera pode ou não cortar, então repor o padding é o que faz o
 * decodificador aceitar as duas formas.
 */

export function paraBase64Url(dados: Buffer | string): string {
  const b = typeof dados === "string" ? Buffer.from(dados, "utf-8") : dados;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url (com ou sem padding) para bytes. */
export function bytesDeBase64Url(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const falta = b64.length % 4;
  return Buffer.from(falta ? b64 + "=".repeat(4 - falta) : b64, "base64");
}

/** base64url para texto UTF-8. */
export function textoDeBase64Url(s: string): string {
  return bytesDeBase64Url(s).toString("utf-8");
}
