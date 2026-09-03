import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { criarEvento } from "@/lib/google/calendar";
import { temGoogleConfigurado } from "@/lib/google/config";

/**
 * Transforma uma reunião já agendada no CRM em um convite de verdade na agenda
 * do vendedor, com Meet, e manda o convite ao cliente.
 *
 * Roda com a SESSÃO de quem chamou: a leitura da atividade passa pela RLS, e o
 * evento é criado na agenda dessa pessoa (é a conta Google dela que está
 * conectada). Não existe caminho para agendar em nome de outro.
 */
export async function POST(request: Request) {
  if (!temGoogleConfigurado()) {
    return NextResponse.json(
      { error: "Google não configurado. Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET." },
      { status: 503 },
    );
  }

  const { atividadeId, minutos } = await request.json();
  if (!atividadeId) return NextResponse.json({ error: "atividadeId é obrigatório." }, { status: 422 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: atividade } = await supabase
    .from("atividades")
    .select("id, titulo, descricao, data_agendada, google_evento_id, negocio:negocios(titulo, contato:contatos(nome, email))")
    .eq("id", atividadeId)
    .single();

  if (!atividade) return NextResponse.json({ error: "Atividade não encontrada." }, { status: 404 });
  if (!atividade.data_agendada) {
    return NextResponse.json({ error: "Esta atividade não tem data e hora." }, { status: 422 });
  }
  // A trava contra convite duplicado. Um clique duplo não pode virar dois
  // convites na caixa do cliente.
  if (atividade.google_evento_id) {
    return NextResponse.json({ error: "Esta reunião já tem convite no Google." }, { status: 409 });
  }

  const negocio = atividade.negocio as never as {
    titulo?: string;
    contato?: { nome?: string; email?: string };
  };
  const email = negocio?.contato?.email;
  if (!email) {
    return NextResponse.json(
      { error: "O contato não tem e-mail — sem ele a Google não consegue convidar ninguém." },
      { status: 422 },
    );
  }

  const inicio = new Date(atividade.data_agendada);

  let evento;
  try {
    evento = await criarEvento({
      usuarioId: user.id,
      titulo: atividade.titulo || `Reunião — ${negocio?.titulo || "Softeum"}`,
      descricao: atividade.descricao || undefined,
      inicio,
      minutos: Number(minutos) > 0 ? Number(minutos) : 30,
      convidados: [{ email, nome: negocio?.contato?.nome }],
      // Derivado da atividade: um retry devolve a MESMA conferência em vez de
      // criar outra.
      requestId: `crm-${atividade.id}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao criar o evento." },
      { status: 502 },
    );
  }

  const { error } = await supabase
    .from("atividades")
    .update({
      google_evento_id: evento.id,
      google_meet_link: evento.meetLink,
      google_resposta: "sem_resposta",
    })
    .eq("id", atividadeId);

  if (error) {
    // O evento já existe na agenda; o que falhou foi só a anotação. Dizer isso
    // é melhor do que um erro genérico que faria a pessoa tentar de novo e
    // criar um segundo convite.
    return NextResponse.json(
      { error: `O convite foi criado, mas não consegui vinculá-lo à atividade: ${error.message}`, evento },
      { status: 500 },
    );
  }

  return NextResponse.json(evento);
}
