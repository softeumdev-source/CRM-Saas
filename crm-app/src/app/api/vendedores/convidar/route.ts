import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarEmail, emailBase, temResendConfigurado } from "@/lib/resend";

export async function POST(request: Request) {
  const { nome, email } = await request.json();
  if (!nome?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Nome e e-mail sao obrigatorios." }, { status: 422 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const { data, error } = await supabase.rpc("convidar_usuario", {
    p_email: email.trim(),
    p_nome: nome.trim(),
    p_role: "vendedor",
  });

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: error?.message || "Erro ao convidar vendedor." }, { status: 500 });
  }

  const { convite_id, token } = data[0];
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const link = `${origin}/aceitar-convite/${token}`;

  const resultado = await enviarEmail({
    to: email.trim(),
    subject: "Voce foi convidado para o CRM Softeum",
    html: emailBase(`
      <h2 style="margin-top:0;">Bem-vindo(a) ao CRM Softeum</h2>
      <p>Ola ${nome.trim()},</p>
      <p>Voce foi convidado para acessar o CRM da Softeum como vendedor. Clique no botao abaixo para criar sua senha e comecar a usar a plataforma.</p>
      <p style="text-align:center; margin: 28px 0;">
        <a href="${link}" style="background:#4f46e5; color:#fff; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:700;">Aceitar convite</a>
      </p>
      <p style="font-size:12px; color:#64748b;">Se o botao nao funcionar, copie e cole este link no navegador: ${link}</p>
    `),
  });

  return NextResponse.json({
    convite_id,
    token,
    link,
    emailEnviado: resultado.sent,
    resendConfigurado: temResendConfigurado(),
    emailErro: resultado.error || null,
    remetenteTest: resultado.remetenteTest || false,
  });
}
