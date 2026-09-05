/**
 * As regras da conversa, sem React.
 *
 * Vive separado porque é a parte que dá para provar sem navegador: agrupar
 * thread, achar a citação, ordenar por quando a coisa aconteceu. A tela em cima
 * disto vira desenho, e desenho eu confiro com screenshot.
 */

import type { Mensagem } from "@/lib/cadencia";

/**
 * Quando a mensagem ACONTECEU para o cliente — que não é quando a linha foi
 * criada. Uma mensagem pode ficar horas na fila de aprovação antes de sair,
 * então ordenar por `criado_em` colocaria uma resposta de ontem depois de um
 * envio aprovado hoje de manhã. A ordem e a data exibida saem da MESMA regra,
 * senão a conversa mostra um horário e ordena por outro.
 */
export function quandoAconteceu(m: Mensagem): number {
  return new Date(m.recebida_em || m.enviada_em || m.criado_em || 0).getTime();
}

export type Thread = {
  /** `thread_externo`, ou o id da mensagem quando ela não tem thread. */
  id: string;
  assunto: string;
  mensagens: Mensagem[];
  /** Da mais recente da thread — é por ela que a lista ordena. */
  ultimaEm: number;
  /** Última mensagem recebida ainda não lida pelo time. */
  temResposta: boolean;
};

/**
 * Agrupa as mensagens de e-mail em conversas.
 *
 * A chave é `thread_externo`, e quando ele é nulo a chave vira o id da própria
 * mensagem. Isso é deliberado: usar o assunto como chave alternativa juntaria
 * três e-mails distintos chamados "Contato pelo site" de três clientes
 * diferentes numa conversa só. Nulo não agrupa — fica cada um por si, que é
 * feio mas é verdade.
 *
 * Toda mensagem de saída passou a gravar `thread_externo` na Fase 3, então o
 * caso do nulo tende a zero com o tempo.
 */
export function agruparEmThreads(mensagens: Mensagem[]): Thread[] {
  const mapa = new Map<string, Mensagem[]>();
  for (const m of mensagens) {
    const chave = m.thread_externo || m.id;
    const atual = mapa.get(chave);
    if (atual) atual.push(m);
    else mapa.set(chave, [m]);
  }

  const threads: Thread[] = [];
  for (const [id, lista] of mapa) {
    lista.sort((a, b) => quandoAconteceu(a) - quandoAconteceu(b));
    // O assunto da thread é o da PRIMEIRA mensagem, sem o `Re:` que as
    // respostas acumulam. A original é que nomeia a conversa.
    const assunto = lista.find((m) => m.assunto?.trim())?.assunto?.trim() || "(sem assunto)";
    threads.push({
      id,
      assunto: assunto.replace(/^(re|res|enc|fwd|fw)\s*:\s*/i, "").trim() || assunto,
      mensagens: lista,
      ultimaEm: quandoAconteceu(lista[lista.length - 1]),
      temResposta: lista[lista.length - 1].direcao === "entrada",
    });
  }

  return threads.sort((a, b) => b.ultimaEm - a.ultimaEm);
}

/**
 * Separa o texto novo do histórico citado.
 *
 * Sem isto toda resposta numa thread longa carrega a conversa inteira colada
 * embaixo, e as mensagens ficam visualmente idênticas umas às outras — que é
 * exatamente o problema que a thread deveria resolver.
 *
 * Os marcadores cobrem o que os clientes de e-mail brasileiros e americanos
 * produzem. Um marcador desconhecido apenas não recolhe nada: o texto aparece
 * inteiro, que é o comportamento de hoje, e nunca some.
 */
const INICIOS_DE_CITACAO = [
  /^\s*>/,
  /^\s*Em\s.+escreveu\s*:\s*$/i,
  /^\s*On\s.+wrote\s*:\s*$/i,
  /^\s*-{2,}\s*(Mensagem original|Original Message|Forwarded message|Mensagem encaminhada)\s*-{2,}/i,
  /^\s*_{5,}\s*$/,
  /^\s*De\s*:\s*.+$/i,
  /^\s*From\s*:\s*.+$/i,
];

export function separarCitacao(texto: string): { corpo: string; citacao: string | null } {
  const linhas = texto.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    if (!INICIOS_DE_CITACAO.some((r) => r.test(linhas[i]))) continue;

    // Uma citação que começa na primeira linha não é citação: é uma mensagem
    // que É só a resposta em cima do histórico, e recolher tudo deixaria o
    // bloco vazio.
    const corpo = linhas.slice(0, i).join("\n").trimEnd();
    if (!corpo.trim()) return { corpo: texto, citacao: null };

    return { corpo, citacao: linhas.slice(i).join("\n").trimEnd() };
  }
  return { corpo: texto, citacao: null };
}

/** Primeira linha com texto, para o trecho da lista. */
export function trecho(texto: string, limite = 120): string {
  const { corpo } = separarCitacao(texto);
  const linha = corpo
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!linha) return "";
  return linha.length > limite ? `${linha.slice(0, limite - 1)}…` : linha;
}
