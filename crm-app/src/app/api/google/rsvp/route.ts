import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respostaDoConvidado } from "@/lib/google/calendar";
import { temGoogleConfigurado } from "@/lib/google/config";

/**
 * Como o cliente respondeu ao convite da reunião.
 *
 * Fecha dois caminhos mortos de uma vez: `respostaDoConvidado` existia sem
 * nenhum chamador, e `atividades.google_resposta` era escrita no agendamento e
 * lida por ninguém. Quem precisa disso é quem responde "o cliente compareceu?":
 * "recusou" e "nem respondeu" são sinais diferentes de "aceitou e não veio", e
 * tratar os três igual faz o SDR reagendar com quem nunca confirmou.
 *
 * Dois cuidados que definem o desenho:
 *
 * 1. A autorização é a LEITURA da atividade com a sessão de quem chamou — a
 *    RLS de `atividades` delega para `negocios`, então enxergar a atividade é
 *    exatamente ter direito a ela.
 * 2. O token do Google é o de quem ORGANIZOU (`atividades.usuario_id`), não o
 *    de quem está olhando. O vendedor que recebe o lead não é convidado do
 *    evento e receberia 404 da Google. Quando o organizador não tem conta
 *    conectada — o robô SDR IA, por exemplo — a leitura degrada em silêncio e
 *    a tela simplesmente não mostra a linha.
 */
export async function GET(request: Request) {
  const atividadeId = new URL(request.url).searchParams.get("atividadeId");
  if (!atividadeId) {
    return NextResponse.json({ error: "atividadeId é obrigatório." }, { status: 422 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: atividade } = await supabase
    .from("atividades")
    .select("id, usuario_id, google_evento_id, google_resposta, negocio:negocios(contato:contatos(email))")
    .eq("id", atividadeId)
    .maybeSingle();

  if (!atividade) return NextResponse.json({ error: "Atividade não encontrada." }, { status: 404 });

  // O que já está gravado é a resposta padrão: se a Google não responder, é
  // melhor devolver o último valor conhecido do que fingir que não há nada.
  const guardada = atividade.google_resposta ?? null;

  const email = (atividade.negocio as never as { contato?: { email?: string } } | null)?.contato?.email;
  if (!temGoogleConfigurado() || !atividade.google_evento_id || !atividade.usuario_id || !email) {
    return NextResponse.json({ resposta: guardada, aoVivo: false });
  }

  let resposta: string | null;
  try {
    resposta = await respostaDoConvidado(atividade.usuario_id, atividade.google_evento_id, email);
  } catch {
    // Conta desconectada, token revogado, Google fora do ar: nada disso é erro
    // DESTA tela. Ela mostra o que sabe e segue.
    return NextResponse.json({ resposta: guardada, aoVivo: false });
  }

  if (resposta && resposta !== guardada) {
    await supabase.from("atividades").update({ google_resposta: resposta }).eq("id", atividadeId);
  }

  return NextResponse.json({ resposta: resposta ?? guardada, aoVivo: resposta !== null });
}
