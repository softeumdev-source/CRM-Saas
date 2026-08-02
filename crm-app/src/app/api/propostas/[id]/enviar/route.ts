import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarEmail, emailBase, temResendConfigurado } from "@/lib/resend";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const { data: usuarioAtual } = await supabase.from("usuarios").select("*").eq("id", user.id).single();

  const { data: proposta } = await supabase
    .from("propostas")
    .select("*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios(*))")
    .eq("id", id)
    .single();

  if (!proposta) return NextResponse.json({ error: "Proposta nao encontrada." }, { status: 404 });
  if (!proposta.pdf_comercial_path || !proposta.pdf_tecnica_path) {
    return NextResponse.json({ error: "Gere os PDFs da proposta antes de enviar." }, { status: 422 });
  }

  const negocio = proposta.negocio as any;
  const contato = negocio?.contato;
  if (!contato?.email) {
    return NextResponse.json({ error: "O contato precisa ter um e-mail cadastrado para assinar." }, { status: 422 });
  }

  const { data: envelope, error: erroEnvelope } = await supabase
    .from("envelopes")
    .insert({ proposta_id: id, tenant_id: proposta.tenant_id, status: "enviado" })
    .select()
    .single();
  if (erroEnvelope || !envelope) {
    return NextResponse.json({ error: erroEnvelope?.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "interno";

  const { data: signatarioSofteum } = await supabase
    .from("signatarios")
    .insert({
      envelope_id: envelope.id,
      nome: usuarioAtual?.nome || "Softeum",
      email: usuarioAtual?.email || "contato@softeum.com.br",
      papel: "softeum",
      ordem: 1,
      status: "assinado",
      assinado_em: new Date().toISOString(),
      ip_assinatura: ip,
      user_agent: "sistema-crm-interno",
      assinatura_tipo: "digitada",
      assinatura_dados: usuarioAtual?.nome || "Softeum",
    })
    .select()
    .single();

  const { data: signatarioCliente, error: erroSig } = await supabase
    .from("signatarios")
    .insert({
      envelope_id: envelope.id,
      nome: contato.nome,
      email: contato.email,
      papel: "cliente",
      ordem: 2,
      status: "pendente",
    })
    .select()
    .single();

  if (erroSig || !signatarioCliente) {
    return NextResponse.json({ error: erroSig?.message }, { status: 500 });
  }

  const [comercialFile, tecnicaFile] = await Promise.all([
    supabase.storage.from("documentos").download(proposta.pdf_comercial_path),
    supabase.storage.from("documentos").download(proposta.pdf_tecnica_path),
  ]);

  if (comercialFile.error || tecnicaFile.error || !comercialFile.data || !tecnicaFile.data) {
    return NextResponse.json({ error: "Falha ao carregar os PDFs gerados." }, { status: 500 });
  }

  const token = signatarioCliente.token;
  await Promise.all([
    supabase.storage.from("assinatura-publica").upload(`${token}/comercial.pdf`, await comercialFile.data.arrayBuffer(), {
      contentType: "application/pdf",
      upsert: true,
    }),
    supabase.storage.from("assinatura-publica").upload(`${token}/tecnica.pdf`, await tecnicaFile.data.arrayBuffer(), {
      contentType: "application/pdf",
      upsert: true,
    }),
  ]);

  await supabase.from("propostas").update({ status: "enviada", enviada_em: new Date().toISOString() }).eq("id", id);
  await supabase.from("atividades").insert({
    negocio_id: proposta.negocio_id,
    usuario_id: user.id,
    tipo: "proposta",
    titulo: `Proposta ${proposta.numero} enviada para assinatura`,
    descricao: `Enviada para ${contato.email}.`,
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const linkAssinatura = `${origin}/assinar/${token}`;

  let emailEnviado = false;
  try {
    const resultado = await enviarEmail({
      to: contato.email,
      subject: `Proposta Softeum ${proposta.numero} - assinatura eletronica`,
      html: emailBase(`
        <h2 style="margin-top:0;">Proposta comercial pronta para assinatura</h2>
        <p>Ola ${contato.nome},</p>
        <p>A Softeum preparou sua proposta comercial e tecnica (${proposta.numero}). Revise os documentos e assine eletronicamente pelo link abaixo.</p>
        <p style="text-align:center; margin: 28px 0;">
          <a href="${linkAssinatura}" style="background:#4f46e5; color:#fff; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:700;">Revisar e assinar</a>
        </p>
        <p style="font-size:12px; color:#64748b;">Se o botao nao funcionar, copie e cole este link no navegador: ${linkAssinatura}</p>
      `),
    });
    emailEnviado = !resultado.skipped;
  } catch (e) {
    console.error("Falha ao enviar e-mail de assinatura", e);
  }

  return NextResponse.json({
    envelope,
    linkAssinatura,
    emailEnviado,
    resendConfigurado: temResendConfigurado(),
  });
}
