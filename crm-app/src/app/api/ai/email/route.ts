import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gerarJson, temGeminiConfigurado } from "@/lib/ai/gemini";
import { enviarEmail, emailBase, temResendConfigurado } from "@/lib/resend";

export async function POST(request: Request) {
  if (!temGeminiConfigurado()) {
    return NextResponse.json({ error: "IA nao configurada. Peca ao administrador para definir GEMINI_API_KEY." }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const { negocioId, objetivo, tom, enviar } = await request.json();
  const { data: negocio } = await supabase
    .from("negocios")
    .select("*, contato:contatos(*)")
    .eq("id", negocioId)
    .single();
  if (!negocio) return NextResponse.json({ error: "Negocio nao encontrado." }, { status: 404 });

  const prompt = `Voce e um vendedor B2B da Softeum (automacao de pedidos com IA via e-mail/WhatsApp).
Escreva um e-mail de vendas em portugues do Brasil, objetivo "${objetivo}", tom "${tom}", para o lead abaixo.
Retorne JSON no schema exato: {"assunto": string, "corpo": string, "callToAction": string}
O corpo deve estar em HTML simples (paragrafos <p>), sem saudacoes genericas demais, mencionando o nome do contato.

Contato: ${negocio.contato?.nome} (${negocio.contato?.cargo || "sem cargo"})
Empresa: ${negocio.contato?.empresa}
Negocio: ${negocio.titulo}
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
        titulo: resultado.assunto,
        descricao: "E-mail gerado por IA e enviado ao contato.",
      });
    }

    return NextResponse.json({ ...resultado, enviado, resendConfigurado: temResendConfigurado() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha ao gerar e-mail." }, { status: 500 });
  }
}
