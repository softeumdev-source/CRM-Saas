import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gerarJson, temGeminiConfigurado } from "@/lib/ai/gemini";

export async function POST(request: Request) {
  if (!temGeminiConfigurado()) {
    return NextResponse.json({ error: "IA não configurada. Peça ao administrador para definir GEMINI_API_KEY." }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { negocioId } = await request.json();
  const { data: negocio } = await supabase
    .from("negocios")
    .select("*, contato:contatos(*)")
    .eq("id", negocioId)
    .single();
  if (!negocio) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  const { data: atividades } = await supabase
    .from("atividades")
    .select("*")
    .eq("negocio_id", negocioId)
    .order("criado_em", { ascending: false })
    .limit(10);

  const prompt = `Você é um especialista em vendas B2B da Softeum, empresa que automatiza recebimento e
processamento de pedidos de compra via e-mail e WhatsApp com IA. Analise o lead abaixo e retorne um
JSON com o schema exato:
{
  "fitScore": number (0-100),
  "resumo": string,
  "pontosFortes": string[],
  "riscos": string[],
  "pitchSugerido": string,
  "objecoes": [{"objecao": string, "resposta": string}]
}

Empresa: ${negocio.contato?.empresa || negocio.contato?.nome}
Cargo do contato: ${negocio.contato?.cargo || "não informado"}
Título do negócio: ${negocio.titulo}
Valor estimado: R$ ${negocio.valor}
Origem do lead: ${negocio.contato?.origem}
Últimas atividades: ${atividades?.map((a) => `${a.tipo}: ${a.titulo}`).join("; ") || "nenhuma"}
`;

  try {
    const resultado = await gerarJson(prompt);
    return NextResponse.json(resultado);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha ao consultar IA." }, { status: 500 });
  }
}
