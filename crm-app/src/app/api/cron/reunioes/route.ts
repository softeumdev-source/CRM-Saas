import { NextResponse } from "next/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { eventosDoPeriodo } from "@/lib/google/calendar";
import { AgendaIndisponivel } from "@/lib/google/agenda";
import { temGoogleConfigurado } from "@/lib/google/config";
import { mensagemDoErro } from "@/lib/erros";

/**
 * O sino avisa quando a reunião está chegando.
 *
 * A Agenda do CRM mostra a agenda do GOOGLE, e evento do Google não é linha do
 * nosso banco: ele não dispara gatilho, não tem `lembrete_data` e o
 * `processar_lembretes` nunca o veria. Por isso este cron existe — é o único
 * jeito de avisar de um compromisso que mora fora daqui.
 *
 * Ele varre a agenda de cada conta conectada e cria UMA notificação por reunião
 * que começa dentro da janela. O `chave` (`reuniao:<id do evento>`) mais o
 * índice único de `notificacoes` fazem o resto: rodando de 5 em 5 minutos, a
 * mesma reunião bateria três vezes antes de começar, e três sinos para o mesmo
 * compromisso é o jeito mais rápido de ensinar alguém a ignorar o sino.
 *
 * Uma conta quebrada não derruba a rodada. Token revogado, Google fora do ar,
 * conta desconectada: entra no resumo como falha e o laço segue para a próxima.
 * O contrário faria o primeiro problema calar o aviso de todo mundo.
 */
export const maxDuration = 60;

/**
 * Quanto antes o sino toca. Quinze minutos é o padrão do próprio Google
 * Agenda: dá para fechar o que está fazendo e abrir o link, sem avisar tão
 * cedo que a pessoa esquece de novo.
 */
const ANTECEDENCIA_MIN = 15;

/** Teto de contas por rodada, para a rota não estourar o `maxDuration`. */
const CONTAS_POR_RODADA = 20;

type Integracao = { usuario_id: string; email_google: string | null };

const HORA = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!temServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 503 });
  }
  if (!temGoogleConfigurado()) {
    return NextResponse.json({ avisadas: 0, motivo: "Google não configurado neste ambiente." });
  }

  const supabase = createAdminClient();

  // Só quem está com a conexão sadia. `ultimo_erro` preenchido significa que a
  // última conversa com a Google falhou — insistir só gastaria a rodada.
  const { data: contas, error } = await supabase
    .from("integracoes_google")
    .select("usuario_id, email_google")
    .is("ultimo_erro", null)
    .limit(CONTAS_POR_RODADA);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agora = new Date();
  const limite = new Date(agora.getTime() + ANTECEDENCIA_MIN * 60_000);
  const resultado = { contas: contas?.length ?? 0, avisadas: 0, falhas: [] as string[] };

  for (const conta of (contas as Integracao[]) || []) {
    try {
      const eventos = await eventosDoPeriodo(conta.usuario_id, agora, limite);

      for (const evento of eventos) {
        // Compromisso de dia inteiro não tem hora para avisar "daqui a 15 min".
        if (evento.diaInteiro) continue;

        const inicio = new Date(evento.inicio);
        // A janela do Google inclui o que JÁ COMEÇOU e ainda não acabou. Avisar
        // de uma reunião em andamento é ruído, não lembrete.
        if (inicio.getTime() < agora.getTime()) continue;

        const faltam = Math.max(1, Math.round((inicio.getTime() - agora.getTime()) / 60_000));

        const { error: erroInsert } = await supabase.from("notificacoes").insert({
          usuario_id: conta.usuario_id,
          tipo: "reuniao_proxima",
          titulo: `Reunião em ${faltam} min: ${evento.titulo}`,
          corpo: `Começa às ${HORA.format(inicio)}${
            evento.meetLink ? " · Google Meet" : evento.local ? ` · ${evento.local}` : ""
          }.`,
          // O link leva direto para a chamada quando existe; senão, para o
          // evento no Google Agenda. Um sino que não abre nada é meio sino.
          link: evento.meetLink || evento.link,
          chave: `reuniao:${evento.id}`,
        });

        // 23505 é a trava do índice único fazendo o trabalho dela: esta reunião
        // já foi avisada numa rodada anterior. Não é falha.
        if (erroInsert && erroInsert.code !== "23505") {
          resultado.falhas.push(`${conta.email_google}: ${erroInsert.message}`);
        } else if (!erroInsert) {
          resultado.avisadas += 1;
        }
      }
    } catch (e) {
      resultado.falhas.push(
        `${conta.email_google}: ${
          e instanceof AgendaIndisponivel ? e.message : mensagemDoErro(e, "falha ao ler a agenda")
        }`,
      );
    }
  }

  return NextResponse.json(resultado);
}
