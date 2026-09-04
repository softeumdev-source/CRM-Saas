/**
 * As abas do admin — SEM `"use client"`, e é esse o ponto.
 *
 * Isto morava dentro de `AdminClient.tsx`, que é um componente de cliente. A
 * página do admin (server component) importava `ehAbaAdmin` de lá para validar
 * o `?tab=` antes de renderizar. Chamar do servidor uma função que vive num
 * módulo de cliente é proibido, e o Next derrubava a rota com 500:
 *
 *   Attempted to call ehAbaAdmin() from the server but ehAbaAdmin is on the
 *   client. It's not possible to invoke a client function from the server.
 *
 * O que tornava isso traiçoeiro: a violação depende de como o bundler divide os
 * chunks, então a MESMA linha de código passava num build e derrubava a página
 * no seguinte, sem ninguém ter tocado nela. Um build a mais e o painel "parou
 * de funcionar" sozinho.
 *
 * Aqui, sem a diretiva, o módulo é neutro: servidor e cliente importam a mesma
 * verdade sobre quais abas existem.
 *
 * Os ÍCONES ficam de fora de propósito — só interessam a quem desenha, e
 * trazê-los para cá arrastaria a biblioteca de ícones para o grafo do servidor.
 */

export const ABAS_ADMIN = [
  "desempenho",
  "vendedores",
  "funil",
  "planos",
  "leads",
  "descontos",
  "cadencias",
  "integracoes",
] as const;

export type AbaAdmin = (typeof ABAS_ADMIN)[number];

export function ehAbaAdmin(v: string | undefined): v is AbaAdmin {
  return !!v && (ABAS_ADMIN as readonly string[]).includes(v);
}
