/**
 * O texto que a pessoa digitou virando o HTML que o cliente recebe.
 *
 * Puro de propósito: é a peça que decide se um `<script>` digitado no
 * compositor sai como TEXTO ou como marcação, e isso não pode depender de rede,
 * de sessão nem de navegador para ser testado.
 *
 * **Por que isto existe.** O compositor é o primeiro lugar do projeto em que
 * uma PESSOA escreve dentro de `mensagens.corpo`. Até agora `corpo_formato =
 * 'html'` só aparecia em conteúdo que nós mesmos geramos (template da cadência,
 * IA), e a aba de e-mail o entrega a `dangerouslySetInnerHTML`. Gravar o
 * rascunho como `html` faria um `<script>` de um colega rodar no card de todo
 * mundo do tenant — auto-XSS virando XSS armazenada. Então a linha gravada é
 * SEMPRE `texto`, e o HTML do e-mail é montado aqui, escapado, só na saída.
 */

/** As cinco entidades do HTML. `&` primeiro, senão ela reescapa as outras. */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Texto puro → HTML de e-mail.
 *
 * Linha em branco separa parágrafo; quebra simples vira `<br>`. É o que a
 * pessoa espera ao apertar Enter, e sem isso a mensagem inteira chega numa
 * paçoca de uma linha só nos clientes que colapsam espaço em branco.
 */
export function htmlDeTexto(texto: string): string {
  return texto
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((bloco) => `<p style="margin:0 0 12px;">${escaparHtml(bloco).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}
