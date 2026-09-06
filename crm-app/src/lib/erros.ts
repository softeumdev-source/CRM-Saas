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

/**
 * A falha de REDE do `fetch`, que não tem mensagem para mostrar a ninguém.
 *
 * MEDIDO NO NAVEGADOR: com a rede caindo, o `fetch` rejeita com
 * `TypeError: Failed to fetch` — e o `mensagemDoErro` acima, que prefere a
 * mensagem do próprio erro, punha essa frase em inglês dentro de uma tela toda
 * em português. Foi o que apareceu na primeira rodada de teste dos botões de
 * convite.
 *
 * A frase do navegador também não diz nada de útil: ela não distingue rede
 * caída de servidor fora do ar, e não sugere o que fazer. Quem sabe o que
 * dizer é a tela, que conhece a ação — "o convite não foi enviado" é diferente
 * de "a proposta pode já ter sido enviada".
 *
 * O `PrazoEsgotado` de `lib/prazo.ts` NÃO cai aqui de propósito: a mensagem
 * dele já é nossa, já está em português e diz quanto tempo esperou.
 */
export function mensagemDeFalha(erro: unknown, padrao: string): string {
  const ehFalhaDeRede =
    erro instanceof TypeError ||
    (erro instanceof Error && /failed to fetch|networkerror|load failed/i.test(erro.message));
  return ehFalhaDeRede ? padrao : mensagemDoErro(erro, padrao);
}
