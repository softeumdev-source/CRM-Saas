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

  const { negocioId, objetivo } = await request.json();
  const { data: negocio } = await supabase
    .from("negocios")
    .select("*, contato:contatos(*)")
    .eq("id", negocioId)
    .single();
  if (!negocio) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  const prompt = `Você é um vendedor B2B da Softeum (automação de pedidos com IA via e-mail/WhatsApp).
Escreva uma mensagem curta de WhatsApp (max 3 frases, tom direto e humano, sem emojis em excesso) com
objetivo "${objetivo}" para o lead abaixo. Retorne JSON no schema exato: {"mensagem": string}

Contato: ${negocio.contato?.nome}
Empresa: ${negocio.contato?.empresa}
Negócio: ${negocio.titulo}
`;

  try {
    const resultado = await gerarJson<{ mensagem: string }>(prompt);
    const telefone = (negocio.contato?.telefone || "").replace(/\D/g, "");
    const linkWhatsapp = `https://wa.me/${telefone}?text=${encodeURIComponent(resultado.mensagem)}`;
    return NextResponse.json({ ...resultado, linkWhatsapp, temTelefone: !!telefone });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha ao gerar mensagem." }, { status: 500 });
  }
}
