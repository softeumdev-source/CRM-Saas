import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gerarJson, temGeminiConfigurado } from "@/lib/ai/gemini";
import { enviarEmail, emailBase, temResendConfigurado } from "@/lib/resend";

export async function POST(request: Request) {
  if (!temGeminiConfigurado()) {
    return NextResponse.json({ error: "IA não configurada. Peça ao administrador para definir GEMINI_API_KEY." }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { negocioId, objetivo, tom, enviar } = await request.json();
  const { data: negocio } = await supabase
    .from("negocios")
    .select("*, contato:contatos(*)")
    .eq("id", negocioId)
    .single();
  if (!negocio) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  const prompt = `Você é um vendedor B2B da Softeum (automação de pedidos com IA via e-mail/WhatsApp).
Escreva um e-mail de vendas em português do Brasil, objetivo "${objetivo}", tom "${tom}", para o lead abaixo.
Retorne JSON no schema exato: {"assunto": string, "corpo": string, "callToAction": string}
O corpo deve estar em HTML simples (parágrafos <p>), sem saudações genéricas demais, mencionando o nome do contato.

Contato: ${negocio.contato?.nome} (${negocio.contato?.cargo || "sem cargo"})
Empresa: ${negocio.contato?.empresa}
Negócio: ${negocio.titulo}
`;

  try {
    const resultado = await gerarJson<{ assunto: string; corpo: string; callToAction: string }>(prompt);

    let enviado = false;
    if (enviar && negocio.contato?.email) {
      const r = await enviarEmail({
        to: negocio.contato.email,
        subject: resultado.assunto,
        html: emailBase(`${resultado.corpo}<p style="margin-top:20px;"><strong>${resultado.callToAction}</strong></p>`),
      });
      enviado = !r.skipped;
      await supabase.from("atividades").insert({
        negocio_id: negocioId,
        usuario_id: user.id,
        tipo: "email",
        // O título da atividade é obrigatório; a IA pode devolver assunto vazio.
        titulo: resultado.assunto?.trim() || "E-mail enviado ao contato",
        descricao: "E-mail gerado por IA e enviado ao contato.",
      });
    }

    return NextResponse.json({ ...resultado, enviado, resendConfigurado: temResendConfigurado() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha ao gerar e-mail." }, { status: 500 });
  }
}
