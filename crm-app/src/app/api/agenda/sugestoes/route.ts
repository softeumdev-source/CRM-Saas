import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { eventosDoPeriodo } from "@/lib/google/calendar";
import { AgendaIndisponivel } from "@/lib/google/agenda";
import { temGoogleConfigurado } from "@/lib/google/config";
import {
  PREFERENCIAS_PADRAO,
  sugerirHorarios,
  textoDeSugestao,
  type Ocupado,
  type Preferencias,
  type Sugestao,
} from "@/lib/agenda/horarios";

/**
 * Três horários livres na MINHA agenda, e o texto pronto para mandar ao cliente.
 *
 * DUAS DECISÕES DEFINEM ESTA ROTA.
 *
 * 1. SEM AGENDA CONECTADA, NÃO SUGERE. Seria fácil devolver "9h, 9h e 9h" com
 *    base só no expediente e avisar em letra miúda que não deu para conferir.
 *    Mas o pedido inteiro é "sem dar conflito": um horário sugerido sem olhar a
 *    agenda é pior do que nenhum, porque some com o único aviso que existia e
 *    marca reunião em cima de outra. Aqui isso é 409, com o motivo.
 *
 * 2. A AGENDA LIDA É SEMPRE A DE QUEM CHAMOU. Não existe parâmetro apontando
 *    para outra pessoa — o token é `accessTokenDe(user.id)`, como na rota de
 *    eventos. A agenda não está no nosso banco, e nenhuma RLS protegeria disso.
 *
 * O cálculo em si mora em `lib/agenda/horarios.ts`, puro e sem imports. Aqui
 * fica só a rede: ler a preferência, ler o Google, devolver.
 */

/** O mesmo horizonte da busca no módulo puro, com folga para o fim de semana. */
const DIAS_DE_BUSCA = 25;

export type RespostaDeSugestoes =
  | { ok: true; sugestoes: Sugestao[]; texto: string; fuso: string }
  | { ok: false; motivo: string; precisaConectar: boolean };

/**
 * A linha do banco vira as preferências do módulo puro.
 *
 * Sem linha, o padrão — a tabela nasce populada, mas um tenant criado depois
 * não pode ficar sem sugestão nenhuma por causa de uma linha que faltou.
 */
function lerPreferencias(linha: Tables<"preferencias_agenda"> | null): Preferencias {
  if (!linha) return PREFERENCIAS_PADRAO;
  return {
    fuso: linha.fuso,
    diasSemana: linha.dias_semana,
    // `time` volta como "09:00:00"; `minutosDe` lê hora e minuto e ignora o resto.
    horaInicio: linha.hora_inicio,
    horaFim: linha.hora_fim,
    almocoInicio: linha.almoco_inicio,
    almocoFim: linha.almoco_fim,
    duracaoMinutos: linha.duracao_minutos,
    antecedenciaHoras: linha.antecedencia_horas,
    intervaloMinutos: linha.intervalo_minutos,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (!temGoogleConfigurado()) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "O Google não está configurado neste ambiente.",
        precisaConectar: false,
      } satisfies RespostaDeSugestoes,
      { status: 409 },
    );
  }

  // A RLS já limita ao tenant de quem chamou; `maybeSingle` porque a tabela tem
  // uma linha por tenant e a ausência dela não é erro — cai no padrão.
  const { data: linha } = await supabase.from("preferencias_agenda").select("*").maybeSingle();
  const prefs = lerPreferencias(linha);

  const quantidade = Math.min(
    Math.max(Number(new URL(request.url).searchParams.get("quantidade")) || 3, 1),
    5,
  );

  const agora = new Date();
  const ate = new Date(agora.getTime() + DIAS_DE_BUSCA * 86_400_000);

  let ocupados: Ocupado[];
  try {
    const eventos = await eventosDoPeriodo(user.id, agora, ate);
    ocupados = eventos.map((e) => ({
      inicio: e.inicio,
      fim: e.fim,
      diaInteiro: e.diaInteiro,
      // Convite que EU recusei não me ocupa. Sem isto, uma reunião a que a
      // pessoa não vai apagaria horários bons da lista.
      recusado: e.minhaResposta === "recusado",
    }));
  } catch (e) {
    const indisponivel = e instanceof AgendaIndisponivel;
    return NextResponse.json(
      {
        ok: false,
        motivo: e instanceof Error ? e.message : "Não foi possível ler a agenda.",
        precisaConectar: indisponivel ? e.precisaReconectar : false,
      } satisfies RespostaDeSugestoes,
      { status: 409 },
    );
  }

  const sugestoes = sugerirHorarios(ocupados, prefs, agora, quantidade);

  if (sugestoes.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        motivo:
          "Não achei nenhum horário livre dentro do seu expediente nas próximas três semanas. " +
          "Confira o horário de atendimento em Admin → Integrações.",
        precisaConectar: false,
      } satisfies RespostaDeSugestoes,
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    sugestoes,
    texto: textoDeSugestao(sugestoes, prefs),
    fuso: prefs.fuso,
  } satisfies RespostaDeSugestoes);
}
