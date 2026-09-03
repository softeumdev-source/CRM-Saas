/**
 * A janela de 24h do WhatsApp.
 *
 * A Meta só aceita texto livre dentro de 24 horas contadas a partir da ÚLTIMA
 * mensagem que o CLIENTE mandou. Fora dela, só template aprovado. Isso não é
 * preferência nossa: mandar texto livre fora da janela é violação de política,
 * e o preço é a nota de qualidade do número cair até o banimento.
 *
 * Por isso esta função é pura e vive fora do componente: ela decide o que a
 * interface pode oferecer, e precisa ser exercitável sem navegador, sem rede e
 * sem conta na Meta — que hoje nem existe (o canal está pausado).
 *
 * A conta vem de `negocios.ultima_resposta_whatsapp_em`, que é alimentada pelo
 * carimbo do PROVEDOR e não por `now()`: uma reentrega atrasada da Meta não
 * pode reabrir a janela sobre uma mensagem velha.
 */

export const JANELA_MS = 24 * 60 * 60 * 1000;

export type Janela = {
  aberta: boolean;
  /** Quando fecha. `null` quando o cliente nunca respondeu. */
  expiraEm: Date | null;
  restanteMs: number;
  /** Menos de uma hora — a interface avisa antes de fechar. */
  acabando: boolean;
};

export function janelaDeResposta(
  ultimaRespostaEm: string | Date | null | undefined,
  agora: Date = new Date(),
): Janela {
  if (!ultimaRespostaEm) {
    return { aberta: false, expiraEm: null, restanteMs: 0, acabando: false };
  }

  const inicio = ultimaRespostaEm instanceof Date ? ultimaRespostaEm : new Date(ultimaRespostaEm);
  // Data inválida não pode virar "janela aberta" por acidente: `NaN` em
  // qualquer comparação é falso, e o resultado seria "fechada" — mas por
  // coincidência, não por decisão. Melhor decidir.
  if (Number.isNaN(inicio.getTime())) {
    return { aberta: false, expiraEm: null, restanteMs: 0, acabando: false };
  }

  const expiraEm = new Date(inicio.getTime() + JANELA_MS);
  const restanteMs = expiraEm.getTime() - agora.getTime();

  return {
    aberta: restanteMs > 0,
    expiraEm,
    restanteMs: Math.max(0, restanteMs),
    acabando: restanteMs > 0 && restanteMs <= 60 * 60 * 1000,
  };
}

/** "6h12" / "48min" / "3min" — o que cabe num chip ao lado do compositor. */
export function descreverRestante(restanteMs: number): string {
  if (restanteMs <= 0) return "fechada";
  const minutos = Math.floor(restanteMs / 60000);
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}
