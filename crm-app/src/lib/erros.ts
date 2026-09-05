/**
 * A mensagem de um erro pego num `catch`, sem `any`.
 *
 * `catch (e: any)` e `e?.message` escondiam um detalhe que custa caro: metade
 * dos erros deste projeto NÃO são `Error`. O Supabase devolve
 * `{ message, code, details }`, o `fetch` devolve `TypeError`, e uma rota pode
 * rejeitar com uma string. Trocar `any` por `e instanceof Error ? e.message`
 * seria pior do que o `any`: o objeto do Supabase deixaria de ser `Error`, a
 * mensagem sumiria, e o usuário leria "[object Object]" no lugar do motivo.
 *
 * Por isso a ordem é esta: `Error` primeiro, depois qualquer coisa com
 * `message` de texto, e só então o `padrao` — ou a representação do próprio
 * valor, que é o que `String(e)` já fazia.
 */
export function mensagemDoErro(erro: unknown, padrao?: string): string {
  if (erro instanceof Error && erro.message) return erro.message;
  const talvez = (erro as { message?: unknown } | null | undefined)?.message;
  if (typeof talvez === "string" && talvez) return talvez;
  return padrao ?? String(erro);
}
