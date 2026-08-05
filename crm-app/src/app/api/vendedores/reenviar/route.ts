import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarEmail, emailBase, temResendConfigurado } from "@/lib/resend";

export async function POST(request: Request) {
  const { conviteId } = await request.json();
  if (!conviteId) return NextResponse.json({ error: "conviteId obrigatório." }, { status: 422 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: convite, error } = await supabase.from("convites").select("*").eq("id", conviteId).single();
  if (error || !convite) {
    return NextResponse.json({ error: "Convite não encontrado." }, { status: 404 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const link = `${origin}/aceitar-convite/${convite.token}`;

  const resultado = await enviarEmail({
    to: convite.email,
    subject: "Lembrete: você foi convidado para o CRM Softeum",
    html: emailBase(`
      <h2 style="margin-top:0;">Convite pendente</h2>
      <p>Olá,</p>
      <p>Este é um lembrete do seu convite para acessar o CRM da Softeum. Clique no botão abaixo para criar sua senha e começar a usar a plataforma.</p>
      <p style="text-align:center; margin: 28px 0;">
        <a href="${link}" style="background:#4f46e5; color:#fff; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:700;">Aceitar convite</a>
      </p>
      <p style="font-size:12px; color:#64748b;">Se o botão não funcionar, copie e cole este link no navegador: ${link}</p>
    `),
  });

  return NextResponse.json({
    link,
    emailEnviado: resultado.sent,
    resendConfigurado: temResendConfigurado(),
    emailErro: resultado.error || null,
  });
}
