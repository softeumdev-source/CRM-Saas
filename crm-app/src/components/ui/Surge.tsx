/**
 * A entrada em cascata do movimento L2 (`DESIGN.md` §7).
 *
 * ONDE ENTRA: superfície que a pessoa espera carregar — as linhas da Lista, os
 * envelopes de Assinaturas, os cards do admin, as mensagens da quarentena. A
 * cascata diz "chegou", e é a diferença entre a página aparecer e a página
 * simplesmente estar lá.
 *
 * ONDE NÃO ENTRA, de propósito:
 *
 * - **Conversa** (`MensagensTab`, o histórico da `CadenciaTab`). Uma thread em
 *   que cada mensagem entra voando é um aplicativo de chat fingindo que algo
 *   acabou de acontecer. Ali o conteúdo é passado, não chegada.
 * - **Grade da agenda**. Compromisso que "surge" na grade atrapalha quem está
 *   procurando um horário livre — o olho persegue o movimento em vez de
 *   varrer a coluna.
 *
 * O ATRASO TEM TETO. Com 40ms por item e uma lista de 40 linhas, a última
 * esperaria 1,6s — e isso a pessoa lê como lentidão, não como movimento. O teto
 * de 8 põe o limite em 320ms, que é o tempo de um piscar.
 */
export function Surge({
  indice = 0,
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { indice?: number }) {
  return (
    <div
      className={`surge ${className}`}
      style={{ "--atraso": `${Math.min(indice, 8) * 40}ms` } as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

/** O mesmo, para quando o elemento precisa ser `<tr>` e não pode virar `<div>`. */
export function atrasoDaCascata(indice: number): React.CSSProperties {
  return { "--atraso": `${Math.min(indice, 8) * 40}ms` } as React.CSSProperties;
}
