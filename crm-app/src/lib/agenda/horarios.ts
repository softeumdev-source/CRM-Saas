/**
 * Onde cabe uma reunião na sua agenda.
 *
 * PURO DE PROPÓSITO, e sem UM import: recebe os compromissos, devolve os
 * horários. Sem rede, sem Google, sem navegador. É a única forma de exercitar
 * de verdade uma lógica cujo erro típico não gera exceção nenhuma — só sugere
 * o horário errado para um cliente.
 *
 * O FUSO É O PROBLEMA CENTRAL, E NÃO UM DETALHE
 *
 * As funções da Vercel rodam em UTC e o comercial trabalha em São Paulo. Fazer
 * a conta com `getHours()` produziria "das 9h às 18h" em UTC — ou seja, das 6h
 * às 15h no Brasil. Todo o cálculo aqui é feito no RELÓGIO DE PAREDE do fuso
 * configurado, via `Intl`, e só vira instante no fim.
 *
 * `instanteDe` faz duas passadas de propósito: o deslocamento do palpite não é
 * necessariamente o do instante certo quando a data cai numa virada de fuso.
 * O Brasil não tem mais horário de verão, mas escrever isso como se nunca
 * fosse voltar é plantar um defeito com data para explodir.
 *
 * LIVRE NÃO É O MESMO QUE DISPONÍVEL
 *
 * Domingo às 3h da manhã está livre na agenda e não serve. É por isso que as
 * preferências existem: o calendário sabe o que está OCUPADO, e só uma decisão
 * humana sabe o que é ATENDIMENTO.
 */

export type Ocupado = {
  /** ISO. Sem fuso quando `diaInteiro` — é data, não instante. */
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  /**
   * Recusei o convite. Quem recusou NÃO está ocupado, e tratar igual jogaria
   * fora horários bons por causa de uma reunião a que a pessoa não vai.
   */
  recusado?: boolean;
};

export type Preferencias = {
  fuso: string;
  /** ISO: 1 = segunda … 7 = domingo. */
  diasSemana: number[];
  /** `"09:00"`. */
  horaInicio: string;
  horaFim: string;
  /** Nulo quando não há pausa. */
  almocoInicio: string | null;
  almocoFim: string | null;
  duracaoMinutos: number;
  /** Nada é sugerido antes de agora + isto. Ninguém marca para daqui a 10 min. */
  antecedenciaHoras: number;
  /** Folga antes e depois de cada compromisso, para dar tempo de respirar. */
  intervaloMinutos: number;
};

export const PREFERENCIAS_PADRAO: Preferencias = {
  fuso: "America/Sao_Paulo",
  diasSemana: [1, 2, 3, 4, 5],
  horaInicio: "09:00",
  horaFim: "18:00",
  almocoInicio: "12:00",
  almocoFim: "13:00",
  // 30 min: os e-mails da cadência prometem "20 minutos", e a folga cabe dentro.
  duracaoMinutos: 30,
  antecedenciaHoras: 3,
  intervaloMinutos: 15,
};

export type Sugestao = { inicio: string; fim: string };

const MIN = 60_000;

/**
 * Os candidatos caem de 30 em 30 minutos a partir do início do expediente.
 * "Terça às 10h" é um horário; "terça às 9h47" é um número de série.
 */
const PASSO_MINUTOS = 30;

/** Até onde procurar. Três semanas já dizem "esta agenda está lotada". */
const HORIZONTE_DIAS = 21;

type Relogio = { ano: number; mes: number; dia: number; hora: number; minuto: number };

function relogioEm(d: Date, fuso: string): Relogio & { segundo: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const p: Record<string, string> = {};
  for (const parte of partes) p[parte.type] = parte.value;

  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // Alguns runtimes devolvem "24" para meia-noite com `hour12:false`. Sem
    // este resto, um evento à meia-noite viraria hora 24 e o dia inteiro
    // andaria uma casa.
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** Quanto o relógio do fuso está à frente do UTC, NAQUELE instante. */
function deslocamentoMs(d: Date, fuso: string): number {
  const r = relogioEm(d, fuso);
  const comoSeFosseUtc = Date.UTC(r.ano, r.mes - 1, r.dia, r.hora, r.minuto, r.segundo);
  // Os milissegundos não aparecem em `formatToParts`; tirar dos dois lados
  // mantém a subtração exata.
  return comoSeFosseUtc - (d.getTime() - d.getMilliseconds());
}

/** O instante em que o relógio do fuso marca exatamente estas partes. */
function instanteDe(r: Relogio, fuso: string): Date {
  const alvo = Date.UTC(r.ano, r.mes - 1, r.dia, r.hora, r.minuto);
  const palpite = new Date(alvo - deslocamentoMs(new Date(alvo), fuso));
  return new Date(alvo - deslocamentoMs(palpite, fuso));
}

/** 1 = segunda … 7 = domingo, a partir da DATA (não do instante). */
function diaDaSemana(ano: number, mes: number, dia: number): number {
  const d = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return d === 0 ? 7 : d;
}

function chaveDoDia(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function proximaData(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const p = new Date(Date.UTC(a, m - 1, d + 1));
  return chaveDoDia(p.getUTCFullYear(), p.getUTCMonth() + 1, p.getUTCDate());
}

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

type Faixa = { de: number; ate: number };

/**
 * As faixas de atendimento de um dia, em minutos desde a meia-noite.
 *
 * O almoço parte o expediente em duas. Configuração incoerente (fim antes do
 * início, almoço fora do expediente) devolve o expediente inteiro em vez de
 * lista vazia: preferir sugerir algo a sumir sem explicar.
 */
function faixasDoDia(prefs: Preferencias): Faixa[] {
  const inicio = minutosDe(prefs.horaInicio);
  const fim = minutosDe(prefs.horaFim);
  if (fim <= inicio) return [];

  const aI = prefs.almocoInicio ? minutosDe(prefs.almocoInicio) : null;
  const aF = prefs.almocoFim ? minutosDe(prefs.almocoFim) : null;
  if (aI === null || aF === null || aF <= aI || aF <= inicio || aI >= fim) {
    return [{ de: inicio, ate: fim }];
  }

  const faixas: Faixa[] = [];
  if (aI > inicio) faixas.push({ de: inicio, ate: Math.min(aI, fim) });
  if (aF < fim) faixas.push({ de: Math.max(aF, inicio), ate: fim });
  return faixas;
}

type Ocupacao = { intervalos: Faixa[]; diasBloqueados: Set<string> };

function lerOcupados(ocupados: Ocupado[], prefs: Preferencias): Ocupacao {
  const intervalos: Faixa[] = [];
  const diasBloqueados = new Set<string>();
  const folga = Math.max(0, prefs.intervaloMinutos) * MIN;

  for (const o of ocupados) {
    if (o.recusado) continue;

    if (o.diaInteiro) {
      // Evento de dia inteiro é DATA, e o fim da Google é EXCLUSIVO. Só entram
      // aqui os tipos que a leitura já filtrou (`default`, `outOfOffice`,
      // `focusTime`, `fromGmail`) — aniversário não bloqueia o dia de ninguém.
      const de = o.inicio.slice(0, 10);
      const ate = o.fim.slice(0, 10);
      diasBloqueados.add(de);
      let cursor = de;
      for (let guarda = 0; cursor < ate && guarda < 366; guarda++) {
        diasBloqueados.add(cursor);
        cursor = proximaData(cursor);
      }
      continue;
    }

    const i = new Date(o.inicio).getTime();
    const f = new Date(o.fim).getTime();
    if (!Number.isFinite(i) || !Number.isFinite(f) || f <= i) continue;
    intervalos.push({ de: i - folga, ate: f + folga });
  }

  return { intervalos, diasBloqueados };
}

/**
 * Até `quantidade` horários livres, NO MÁXIMO UM POR DIA.
 *
 * Um por dia é decisão de produto, não limitação: três opções na mesma tarde
 * dizem "meu dia está vazio" e não ajudam quem tem o dia cheio. Três dias
 * diferentes dão chance de verdade.
 */
export function sugerirHorarios(
  ocupados: Ocupado[],
  prefs: Preferencias = PREFERENCIAS_PADRAO,
  agora: Date = new Date(),
  quantidade = 3,
): Sugestao[] {
  const faixas = faixasDoDia(prefs);
  if (faixas.length === 0 || prefs.duracaoMinutos <= 0 || prefs.diasSemana.length === 0) return [];

  const { intervalos, diasBloqueados } = lerOcupados(ocupados, prefs);
  const naoAntesDe = agora.getTime() + Math.max(0, prefs.antecedenciaHoras) * 60 * MIN;
  const duracao = prefs.duracaoMinutos * MIN;

  const achadas: Sugestao[] = [];
  const hoje = relogioEm(agora, prefs.fuso);
  let data = chaveDoDia(hoje.ano, hoje.mes, hoje.dia);

  for (let k = 0; k < HORIZONTE_DIAS && achadas.length < quantidade; k++) {
    const [ano, mes, dia] = data.split("-").map(Number);

    if (prefs.diasSemana.includes(diaDaSemana(ano, mes, dia)) && !diasBloqueados.has(data)) {
      for (const faixa of faixas) {
        let achou = false;
        for (let m = faixa.de; m + prefs.duracaoMinutos <= faixa.ate; m += PASSO_MINUTOS) {
          const i = instanteDe(
            { ano, mes, dia, hora: Math.floor(m / 60), minuto: m % 60 },
            prefs.fuso,
          ).getTime();
          const f = i + duracao;
          if (i < naoAntesDe) continue;
          if (intervalos.some((x) => i < x.ate && f > x.de)) continue;
          achadas.push({ inicio: new Date(i).toISOString(), fim: new Date(f).toISOString() });
          achou = true;
          break;
        }
        if (achou) break;
      }
    }

    data = proximaData(data);
  }

  return achadas;
}

const DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** `"terça-feira, 9 de setembro, às 10h"` — como uma pessoa escreveria. */
export function descreverHorario(iso: string, fuso: string): string {
  const r = relogioEm(new Date(iso), fuso);
  const nome = DIAS[new Date(Date.UTC(r.ano, r.mes - 1, r.dia)).getUTCDay()];
  const hora = r.minuto === 0 ? `${r.hora}h` : `${r.hora}h${String(r.minuto).padStart(2, "0")}`;
  return `${nome}, ${r.dia} de ${MESES[r.mes - 1]}, às ${hora}`;
}

/**
 * O texto pronto para colar na conversa.
 *
 * Termina SEMPRE convidando o cliente a propor outro horário. Três opções
 * fechadas viram um teste de sorte: se nenhuma serve, a conversa morre ali
 * porque ninguém disse que havia saída.
 */
export function textoDeSugestao(sugestoes: Sugestao[], prefs: Preferencias): string {
  if (sugestoes.length === 0) return "";

  const linhas = sugestoes.map((s) => `• ${descreverHorario(s.inicio, prefs.fuso)}`).join("\n");
  const abertura =
    sugestoes.length === 1 ? "Consigo neste horário:" : "Consigo em um destes horários:";

  return (
    `${abertura}\n\n${linhas}\n\n` +
    "Qual fica melhor para você? Se nenhum servir, me diga um dia e um horário que funcionem " +
    "do seu lado que eu encaixo aqui."
  );
}
