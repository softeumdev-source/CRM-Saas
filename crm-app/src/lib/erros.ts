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

/**
 * O erro do Supabase (e o do Postgres) escrito para quem esta FORA da sessao.
 *
 * Login, redefinir senha e aceitar convite sao as tres telas que uma pessoa ve
 * ANTES de existir para o sistema, e eram as tres que jogavam a frase crua na
 * cara dela: "Auth session missing!" quando o link de redefinicao ja tinha
 * vencido, "For security purposes, you can only request this after 51
 * seconds." quando alguem pedia o link duas vezes seguidas, e "convite invalido
 * ou expirado" no convite — em minuscula e sem acento, porque no banco aquilo e
 * um `raise exception` e nao um texto de tela.
 *
 * UM tradutor comum aqui, e nao um `function traduzir` local em cada pagina
 * como o do `HorarioDeAtendimento`: la os casos sao as restricoes de UMA
 * tabela, que so aquela tela dispara. Aqui as tres telas compartilham o mesmo
 * vocabulario (senha fraca, limite de envio, rede caida) e tres copias
 * divergiriam na primeira correcao.
 *
 * Frase desconhecida volta INTEIRA, igual ao `traduzir` do admin. Trocar o que
 * nao reconhecemos por um "ocorreu um erro" tiraria de quem atende a unica
 * pista que existe, e a pessoa continuaria sem saber o que fazer.
 */
export function traduzirErroDeAcesso(mensagem: string): string {
  const m = mensagem.toLowerCase();

  // O `fetch` do navegador rejeita assim, e o auth-js repassa a frase inteira.
  if (/failed to fetch|networkerror|load failed|network error/.test(m)) {
    return "Não foi possível falar com o servidor. Confira sua conexão e tente de novo.";
  }
  // Sem sessao o `updateUser` devolve exatamente "Auth session missing!", que e
  // o que acontece quando o link de redefinicao venceu ou ja foi usado.
  if (/auth session missing|session not found/.test(m)) {
    return "Este link de redefinição não vale mais: ele venceu ou já foi usado. Peça outro em “Esqueci minha senha”.";
  }
  // "For security purposes, you can only request this after 51 seconds."
  if (/for security purposes|rate limit|too many requests/.test(m)) {
    return "Você pediu isso vezes demais em pouco tempo. Espere um minuto e tente de novo.";
  }
  if (m.includes("new password should be different")) {
    return "A nova senha precisa ser diferente da anterior.";
  }
  if (m.includes("password") && /weak|should be at least|should contain/.test(m)) {
    return "Esta senha é fraca demais. Use uma senha mais longa, misturando letras, números e símbolos.";
  }
  if (m.includes("unable to validate email address")) {
    return "Este e-mail não parece válido. Confira o endereço.";
  }
  if (m.includes("error sending")) {
    return "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.";
  }
  // As duas excecoes do `aceitar_convite`: minuscula e sem acento porque no
  // banco elas sao `raise exception`, e nao texto de tela.
  if (m.includes("convite invalido ou expirado")) {
    return "Este convite não vale mais: ele já foi usado ou passou do prazo. Peça um novo convite ao administrador.";
  }
  if (m.includes("a senha deve ter ao menos")) {
    return "A senha deve ter ao menos 8 caracteres.";
  }
  return mensagem;
}
