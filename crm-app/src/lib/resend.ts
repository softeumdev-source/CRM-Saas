import { Resend } from "resend";

export function temResendConfigurado(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function usandoRemetenteTest(): boolean {
  return !process.env.RESEND_FROM_EMAIL;
}

export interface EmailResult {
  sent: boolean;
  skipped: boolean;
  id?: string;
  error?: string;
  remetenteTest?: boolean;
}

export async function enviarEmail(params: { to: string; subject: string; html: string }): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY nao configurada - e-mail nao enviado:", params.subject, "->", params.to);
    return { sent: false, skipped: true, error: "RESEND_API_KEY nao configurada no servidor." };
  }

  const from = process.env.RESEND_FROM_EMAIL || "Softeum <onboarding@resend.dev>";
  const remetenteTest = from.includes("onboarding@resend.dev");

  if (remetenteTest) {
    console.warn("[resend] Usando remetente de teste onboarding@resend.dev — e-mails so chegam no dono da conta Resend. Configure RESEND_FROM_EMAIL com um dominio verificado.");
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error("[resend] Erro ao enviar e-mail:", error.message, "-> ", params.to);
      return { sent: false, skipped: false, error: error.message, remetenteTest };
    }

    return { sent: true, skipped: false, id: data?.id, remetenteTest };
  } catch (e: any) {
    console.error("[resend] Excecao ao enviar e-mail:", e);
    return { sent: false, skipped: false, error: e?.message || String(e), remetenteTest };
  }
}

export function emailBase(conteudo: string): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
    <div style="background: linear-gradient(135deg, #0f172a, #312e81); padding: 20px 24px; border-radius: 16px 16px 0 0;">
      <span style="color:#fff; font-weight:800; font-size:18px; letter-spacing: 0.5px;">SOFTEUM</span>
    </div>
    <div style="background:#fff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px; padding: 24px; color:#1e293b;">
      ${conteudo}
    </div>
    <p style="text-align:center; color:#94a3b8; font-size:11px; margin-top:16px;">
      Softeum Tecnologia · <a href="https://www.softeum.com.br/suporte" style="color:#94a3b8;">Suporte</a>
    </p>
  </div>`;
}
