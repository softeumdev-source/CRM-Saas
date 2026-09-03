import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gerarJson, temGeminiConfigurado } from "@/lib/ai/gemini";
import { REGRAS_DA_IA, violacoesDaIa } from "@/lib/ai/limites";

/**
 * Reescreve o texto de UMA mensagem que está esperando aprovação.
 *
 * Três coisas que esta rota deliberadamente não faz:
 *
 * 1. Não envia nada. Ela grava o texto e devolve; quem envia é o despachante,
 *    e só depois de alguém aprovar. A rota que este projeto teve antes gerava
 *    e enviava na mesma chamada, e foi por isso que ela saiu.
 * 2. Não usa service role. Roda com a sessão de quem chamou, então a RLS
 *    decide quais mensagens a pessoa pode tocar — a checagem é do banco, não
 *    de um `if` aqui.
 * 3. Não confia no prompt. O texto gerado passa por `violacoesDaIa()` antes de
 *    ser gravado; se falar preço, desconto ou garantia, a rota recusa e
 *    devolve o motivo. Prompt não é garantia, e "a instrução mandava não falar
 *    de preço" não desfaz um e-mail enviado.
 */
export async function POST(request: Request) {
  if (!temGeminiConfigurado()) {
    return NextResponse.json(
      { error: "IA não configurada. Peça ao administrador para definir GEMINI_API_KEY." },
      { status: 503 },
    );
  }

  const { mensagemId, instrucao } = await request.json();
  if (!mensagemId) {
    return NextResponse.json({ error: "mensagemId é obrigatório." }, { status: 422 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: mensagem } = await supabase
    .from("mensagens")
    .select("id, status, assunto, corpo, negocio:negocios(titulo, contato:contatos(nome, empresa, cargo))")
    .eq("id", mensagemId)
    .single();

  if (!mensagem) {
    return NextResponse.json({ error: "Mensagem não encontrada." }, { status: 404 });
  }
  // Só faz sentido reescrever o que ainda não saiu. Uma mensagem aprovada pode
  // estar sendo enviada neste instante.
  if (mensagem.status !== "aguardando_aprovacao") {
    return NextResponse.json(
      { error: "Só dá para reescrever mensagem que ainda está esperando aprovação." },
      { status: 409 },
    );
  }

  const contato = (mensagem.negocio as never as { contato?: { nome?: string; empresa?: string; cargo?: string } })
    ?.contato;

  const prompt = `${REGRAS_DA_IA}

Lead:
- nome: ${contato?.nome || "não informado"}
- cargo: ${contato?.cargo || "não informado"}
- empresa: ${contato?.empresa || "não informada"}

Texto atual (para você melhorar, mantendo o objetivo):
${mensagem.corpo}

${instrucao ? `Instrução de quem pediu: ${instrucao}` : ""}

Responda em JSON no schema exato: {"assunto": string, "corpo": string}`;

  let gerado: { assunto?: string; corpo?: string };
  try {
    gerado = await gerarJson<{ assunto?: string; corpo?: string }>(prompt);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao gerar o texto." },
      { status: 502 },
    );
  }

  const corpo = (gerado.corpo || "").trim();
  const assunto = (gerado.assunto || mensagem.assunto || "").trim();
  if (!corpo) {
    return NextResponse.json({ error: "A IA devolveu um texto vazio." }, { status: 502 });
  }

  const violacoes = violacoesDaIa(`${assunto} ${corpo}`);
  if (violacoes.length > 0) {
    return NextResponse.json(
      {
        error: `A IA saiu dos limites (${violacoes.map((v) => v.motivo).join("; ")}). O texto foi descartado.`,
        violacoes,
      },
      { status: 422 },
    );
  }

  const { error } = await supabase
    .from("mensagens")
    .update({ assunto, corpo, gerado_por: "ia" })
    .eq("id", mensagemId)
    .eq("status", "aguardando_aprovacao");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assunto, corpo });
}
