import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eventosDoPeriodo } from "@/lib/google/calendar";
import { AgendaIndisponivel, type EventoDaAgenda } from "@/lib/google/agenda";
import { temGoogleConfigurado } from "@/lib/google/config";

/**
 * A agenda do Google de quem está olhando, para a tela de Agenda do CRM.
 *
 * DUAS DECISÕES DEFINEM ESTA ROTA.
 *
 * 1. Não existe parâmetro que aponte para a agenda de OUTRA pessoa. O token é
 *    sempre `accessTokenDe(user.id)` — o do próprio requisitante. Uma rota que
 *    aceitasse `?usuarioId=` seria um jeito de qualquer vendedor ler a agenda
 *    pessoal do chefe, e nenhuma RLS nos protegeria disso: a agenda não está no
 *    nosso banco.
 *
 * 2. Falha aqui NÃO é erro da tela. A Agenda do CRM funciona sozinha desde
 *    sempre; o Google é um acréscimo. Então conta desconectada, token revogado
 *    ou Google fora do ar devolvem 200 com `conectado: false` e um motivo — a
 *    tela mostra a lista do CRM normalmente e um aviso discreto ao lado. O
 *    único 401 de verdade é não haver sessão.
 *
 * O escopo já é o que a conexão pede desde o começo (`calendar.events`), então
 * quem conectou a agenda alguma vez não precisa reconectar nada.
 */

/** Teto da janela. 90 dias já cobre qualquer planejamento comercial. */
const DIAS_MAXIMO = 90;
const DIAS_PADRAO = 30;

export type RespostaDaAgenda =
  | { conectado: true; eventos: EventoDaAgenda[] }
  | { conectado: false; motivo: string; precisaReconectar: boolean };

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (!temGoogleConfigurado()) {
    return NextResponse.json({
      conectado: false,
      motivo: "O Google não está configurado neste ambiente.",
      precisaReconectar: false,
    } satisfies RespostaDaAgenda);
  }

  const params = new URL(request.url).searchParams;
  const pedido = Number(params.get("dias"));
  const dias = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, DIAS_MAXIMO) : DIAS_PADRAO;

  // A janela começa na MEIA-NOITE de hoje, não em "agora": às 16h a pessoa
  // ainda quer ver a reunião das 10h para saber como o dia foi. Um `timeMin`
  // igual a agora apagaria a primeira metade do dia toda tarde.
  const de = new Date();
  de.setHours(0, 0, 0, 0);

  // `?de=AAAA-MM-DD` existe para a visão de SEMANA poder andar para trás e para
  // frente. Sem ele, a janela sempre começava hoje — e uma grade semanal que
  // começa numa quarta-feira não é uma semana, é uma fatia. O valor é lido como
  // hora LOCAL (`T00:00:00` sem fuso): `new Date("2026-09-06")` seria
  // interpretado como UTC e, no Brasil, cairia no dia 5.
  const inicioPedido = params.get("de");
  if (inicioPedido && /^\d{4}-\d{2}-\d{2}$/.test(inicioPedido)) {
    const escolhido = new Date(`${inicioPedido}T00:00:00`);
    if (!Number.isNaN(escolhido.getTime())) {
      de.setTime(escolhido.getTime());
    }
  }

  const ate = new Date(de.getTime() + dias * 86_400_000);

  try {
    const eventos = await eventosDoPeriodo(user.id, de, ate);
    return NextResponse.json({ conectado: true, eventos } satisfies RespostaDaAgenda);
  } catch (e) {
    if (e instanceof AgendaIndisponivel) {
      return NextResponse.json({
        conectado: false,
        motivo: e.message,
        precisaReconectar: e.precisaReconectar,
      } satisfies RespostaDaAgenda);
    }
    return NextResponse.json({
      conectado: false,
      motivo: e instanceof Error ? e.message : "Não foi possível ler a agenda.",
      precisaReconectar: false,
    } satisfies RespostaDaAgenda);
  }
}
