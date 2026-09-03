/**
 * Os limites do que a IA pode dizer a um cliente.
 *
 * A regra foi decidida com o time: a IA qualifica, tira dúvida de FAQ e agenda.
 * Ela NÃO fala preço, não promete integração e não negocia desconto. Qualquer
 * um desses escala para humano — que, no fluxo do SDR, é exatamente a passagem
 * para o vendedor.
 *
 * A instrução vai no prompt, mas prompt não é garantia: um modelo pode
 * escorregar, e "o prompt mandava não falar preço" não devolve um e-mail já
 * enviado. Por isso o texto gerado é conferido DEPOIS, aqui, antes de virar
 * mensagem. Barato, e é a única parte determinística do caminho.
 */

export const REGRAS_DA_IA = `
Você escreve e-mails de prospecção B2B em português do Brasil para a Softeum,
que automatiza o recebimento e o processamento de pedidos (e-mail, PDF, Excel,
WhatsApp) com envio automático para o ERP do cliente.

O que você PODE fazer:
- apresentar a empresa e o problema que ela resolve;
- fazer perguntas de qualificação (volume de pedidos, canais, ERP usado);
- responder dúvidas gerais sobre o que a plataforma faz;
- propor uma conversa de 20 minutos e pedir um horário.

O que você NÃO PODE fazer, em nenhuma hipótese:
- citar preço, valor, mensalidade, custo ou mencionar números de reais;
- oferecer, sugerir ou negociar desconto, condição especial ou teste grátis;
- prometer prazo de implantação ou garantir integração com um ERP específico;
- afirmar que a plataforma faz algo que não está descrito acima.

Se o lead perguntar qualquer coisa dessa segunda lista, não responda o mérito:
diga que quem trata disso é o time comercial e ofereça a conversa.

Escreva curto (no máximo 150 palavras), em HTML simples com parágrafos <p>,
sem saudação genérica, tratando a pessoa pelo primeiro nome.
`.trim();

/** Termos que não podem aparecer no texto que vai para o cliente. */
const PROIBIDOS: { termo: RegExp; motivo: string }[] = [
  { termo: /\bR\$\s?\d/i, motivo: "citou um valor em reais" },
  { termo: /\bdescontos?\b/i, motivo: "falou de desconto" },
  { termo: /\bmensalidade\b/i, motivo: "falou de mensalidade" },
  { termo: /\bpre[çc]os?\b/i, motivo: "falou de preço" },
  // "grátis" com acento, sem acento, e a família "gratuito/gratuita" — a
  // primeira versão só pegava "teste gratuito", então "acesso gratuito"
  // passava batido.
  { termo: /\bgr[áa]tis\b|\bgratuit[oa]s?\b|\bfree\b/i, motivo: "ofereceu algo grátis" },
  { termo: /\bgarant(o|imos|ia|ido|ida)\b/i, motivo: "deu uma garantia" },
  { termo: /\bsem\s+custo\b|\bcortesia\b/i, motivo: "ofereceu algo sem custo" },
  { termo: /\bcondi[çc][ãa]o\s+especial\b/i, motivo: "ofereceu condição especial" },
];

export type Violacao = { motivo: string; trecho: string };

/**
 * Confere o texto gerado contra os limites. Devolve o que encontrou; cabe a
 * quem chamou decidir — mas nenhuma violação deve virar mensagem sem que um
 * humano veja o aviso.
 */
export function violacoesDaIa(texto: string): Violacao[] {
  const limpo = texto.replace(/<[^>]+>/g, " ");
  const achados: Violacao[] = [];
  for (const { termo, motivo } of PROIBIDOS) {
    const m = limpo.match(termo);
    if (m) {
      const i = Math.max(0, (m.index ?? 0) - 40);
      achados.push({ motivo, trecho: limpo.slice(i, (m.index ?? 0) + 60).trim() });
    }
  }
  return achados;
}
