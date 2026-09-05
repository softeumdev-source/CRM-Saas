/**
 * As formas que o agendamento troca com quem o chama.
 *
 * Arquivo neutro pelo mesmo motivo de `admin/abas.ts` e de `google/agenda.ts`:
 * `AgendarReuniao.tsx` é `"use client"`, e a página da Agenda é server
 * component. Importar o tipo de lá funciona hoje — TypeScript apaga
 * `import type` — mas basta alguém tirar a palavra `type` para a build passar
 * e a rota cair com 500 em produção. Foi exatamente isso que derrubou o painel
 * de admin nesta sessão, e o sintoma era pior do que o bug: a violação
 * dependia de como o bundler dividia os chunks, então passava num build e
 * quebrava no seguinte, sem ninguém ter tocado no arquivo.
 *
 * Um arquivo sem diretiva não tem esse risco: os dois lados podem importar.
 */

export type NegocioAgendavel = {
  id: string;
  titulo: string;
  contato: { nome: string; empresa: string | null; email: string | null } | null;
};

export type ReuniaoAgendada = {
  atividade: { id: string; data_agendada: string | null; google_meet_link: string | null };
  evento: { id: string; meetLink: string | null; htmlLink: string } | null;
  /** Preenchido quando a reunião entrou no CRM mas o convite não saiu. */
  aviso: string | null;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O TEXTO DO CONVITE, MONTADO NUM LUGAR SÓ
 *
 * O que o cliente recebia até aqui: título "Reunião — João Silva" (o próprio
 * nome dele, na agenda dele) e descrição VAZIA — a rota transformava string em
 * branco em `undefined`, então o convite levava só o bloco do Meet que a Google
 * gera sozinha. Não dizia quem convidava, não mencionava a Softeum e não dizia
 * do que se tratava.
 *
 * No caso ruim era pior: contato sem nome caía em `negocio.titulo`, que é texto
 * livre digitado no cadastro — jargão interno de CRM indo para a caixa de
 * entrada do cliente.
 *
 * E cliente e servidor DISCORDAVAM: a dica do modal prometia um fallback que
 * preferia a empresa, e o servidor usava outro. Contato sem nome com empresa
 * preenchida: a tela dizia "Reunião — Acme" e saía o título do negócio.
 *
 * Por isso as funções moram aqui, neste arquivo neutro: a tela mostra e a rota
 * grava exatamente o MESMO texto, porque é literalmente a mesma função.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * De quem é a reunião, do lado do cliente.
 *
 * A EMPRESA vem antes do nome — é ela que identifica a conversa na agenda de
 * quem recebe, onde o próprio nome da pessoa não informa nada. E `negocio.titulo`
 * NUNCA entra: ele é nosso, não dele.
 */
export function alvoDoConvite(n: {
  contato: { nome: string; empresa: string | null } | null;
}): string {
  return (n.contato?.empresa || "").trim() || (n.contato?.nome || "").trim() || "sua empresa";
}

/** "45 min", "1 h", "1 h 30 min". Usada no seletor e no corpo do convite. */
export function duracaoLegivel(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${horas} h${resto ? ` ${resto} min` : ""}`;
}

/** `Reunião Softeum e Acme`. Diz quem convida, e para falar com quem. */
export function tituloSugerido(n: { contato: { nome: string; empresa: string | null } | null }): string {
  return `Reunião Softeum e ${alvoDoConvite(n)}`;
}

/**
 * A pauta que vai no corpo do convite.
 *
 * SEM "segue o link abaixo": o link do Meet só existe depois da resposta da
 * Google, e prometer um link que ainda não foi criado é a forma mais fácil de
 * o convite mentir.
 *
 * Assina com o nome da CAIXA comercial — a mesma pessoa que assina o e-mail —,
 * e não com quem por acaso clicou em agendar. Quem opera a prospecção hoje é a
 * conta "Admin Softeum", e um convite assinado assim seria exatamente o defeito
 * que a assinatura do e-mail acabou de fechar.
 */
export function descricaoSugerida(
  n: { contato: { nome: string; empresa: string | null } | null },
  minutos: number,
  vendedor: string,
): string {
  const primeiroNome = (n.contato?.nome || "").trim().split(" ")[0];
  return [
    primeiroNome ? `Olá, ${primeiroNome},` : "Olá,",
    "",
    `Reservei ${duracaoLegivel(minutos)} para conversarmos sobre a automatização dos pedidos da ${alvoDoConvite(n)}.`,
    "",
    "Pauta:",
    "• como os pedidos chegam hoje, e em quais formatos;",
    "• como a leitura automática os entrega no sistema que vocês já usam;",
    "• o que seria preciso para rodar um piloto.",
    "",
    "Se o horário não funcionar, responda a este convite sugerindo outro — remarco sem problema.",
    "",
    "Até lá,",
    vendedor,
    "Softeum",
  ].join("\n");
}

/**
 * Uma reunião que já existe, aberta para correção.
 *
 * A DURAÇÃO não vem aqui de propósito: ela não mora em `atividades` e não vai
 * passar a morar — a fonte é o Google (ver `duracaoDoEvento`). Por isso o
 * formulário abre com "manter a duração atual" em vez de fingir um número, e só
 * manda `minutos` quando a pessoa escolhe outro.
 */
export type ReuniaoParaEditar = {
  atividadeId: string;
  titulo: string;
  descricao: string;
  /** ISO da hora atual da reunião. */
  quando: string;
  /** Tem convite no Google — é o que decide se o cliente será avisado. */
  temConvite: boolean;
};
