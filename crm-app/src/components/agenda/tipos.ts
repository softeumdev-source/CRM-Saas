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
