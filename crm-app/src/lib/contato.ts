/**
 * Falar com o cliente a partir do card, em um clique.
 *
 * A parte que erra em silêncio é o número: `wa.me` exige só dígitos COM código
 * do país, e o CRM guarda o telefone como a pessoa digitou — "(11) 99999-8888",
 * "+55 11 99999-8888", "11999998888". Mandar qualquer um desses cru abre uma
 * conversa com um número inexistente, e o WhatsApp não reclama: mostra "número
 * inválido" como se o cliente não existisse.
 *
 * A regra do nono dígito não é reimplementada aqui de propósito. O banco já tem
 * `telefone_chave()` para casar número de entrada com contato, e duas
 * normalizações diferentes divergiriam. Esta função tem um trabalho mais
 * simples e diferente: montar um link discável.
 */

/** Só os dígitos. */
function digitos(valor: string): string {
  return valor.replace(/\D+/g, "");
}

/**
 * Número em formato E.164 sem o `+`, como o `wa.me` espera.
 *
 * Devolve `null` quando não dá para ter certeza — e devolver `null` é melhor do
 * que devolver um palpite: o botão some, em vez de abrir conversa com o número
 * de outra pessoa.
 */
export function numeroParaWhatsapp(valor: string | null | undefined): string | null {
  const n = digitos(valor || "");
  if (!n) return null;

  // Já tem código do país: 55 + DDD (2) + número (8 ou 9).
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) return n;

  // DDD + número, sem país. É o formato mais comum no cadastro.
  if (n.length === 10 || n.length === 11) return `55${n}`;

  // Número internacional já com DDI de outro país.
  if (n.length >= 11 && n.length <= 15 && !n.startsWith("55")) return n;

  // 8 ou 9 dígitos: falta o DDD. Adivinhar a cidade seria pior do que não abrir.
  return null;
}

export function linkDoWhatsapp(valor: string | null | undefined): string | null {
  const n = numeroParaWhatsapp(valor);
  return n ? `https://wa.me/${n}` : null;
}

/** `mailto:` só quando existe algo que pareça um endereço. */
export function linkDeEmail(valor: string | null | undefined): string | null {
  const e = (valor || "").trim();
  return e.includes("@") && !e.startsWith("@") && !e.endsWith("@") ? `mailto:${e}` : null;
}

/** `tel:` mantém o `+` quando o cadastro já trazia. */
export function linkDeTelefone(valor: string | null | undefined): string | null {
  const n = digitos(valor || "");
  if (n.length < 8) return null;
  return `tel:${(valor || "").trim().startsWith("+") ? "+" : ""}${n}`;
}
