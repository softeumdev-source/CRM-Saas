import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailBase } from "@/lib/resend";
import { enviarDoTenant } from "@/lib/gmail/enviarDoTenant";
import { renderPropostaComercialPdf } from "@/lib/pdf/PropostaComercial";
import { montarDadosDaProposta } from "@/lib/pdf/montarDados";

interface SignatarioEntrada {
  nome: string;
  email: string;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const signatariosEntrada: SignatarioEntrada[] = Array.isArray(body.signatarios) ? body.signatarios : [];
  const copias: string[] = Array.isArray(body.copias) ? body.copias.filter((c: string) => c && c.trim()) : [];
  const camposAssinatura: any[] = Array.isArray(body.campos_assinatura) ? body.campos_assinatura : [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: usuarioAtual } = await supabase.from("usuarios").select("*").eq("id", user.id).single();

  const { data: proposta } = await supabase
    .from("propostas")
    .select("*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios!negocios_responsavel_id_fkey(*))")
    .eq("id", id)
    .single();

  if (!proposta) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  if (proposta.status !== "rascunho") {
    return NextResponse.json({ error: "Esta proposta já foi enviada para assinatura. Gere uma nova versão para reenviar." }, { status: 422 });
  }
  if (!proposta.pdf_comercial_path || !proposta.pdf_tecnica_path) {
    return NextResponse.json({ error: "Gere os PDFs da proposta antes de enviar." }, { status: 422 });
  }

  const negocio = proposta.negocio as any;
  const contato = negocio?.contato;

  const signatariosFinal =
    signatariosEntrada.length > 0
      ? signatariosEntrada.filter((s) => s.nome?.trim() && s.email?.trim())
      : contato?.email
        ? [{ nome: contato.nome, email: contato.email }]
        : [];

  if (signatariosFinal.length === 0) {
    return NextResponse.json({ error: "Informe pelo menos um signatario com nome e e-mail." }, { status: 422 });
  }

  const { data: envelope, error: erroEnvelope } = await supabase
    .from("envelopes")
    .insert({ proposta_id: id, tenant_id: proposta.tenant_id, status: "enviado", copias_emails: copias, campos_assinatura: camposAssinatura } as any)
    .select()
    .single();
  if (erroEnvelope || !envelope) {
    return NextResponse.json({ error: erroEnvelope?.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "interno";

  // Signatario interno Softeum (ja assinado)
  await supabase.from("signatarios").insert({
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
  });

  // Signatarios do cliente
  const linhasClientes = signatariosFinal.map((s, idx) => ({
    envelope_id: envelope.id,
    nome: s.nome.trim(),
    email: s.email.trim(),
    papel: "cliente" as const,
    ordem: idx + 2,
    status: "pendente" as const,
  }));

  const { data: signatariosCriados, error: erroSig } = await supabase
    .from("signatarios")
    .insert(linhasClientes)
    .select();

  if (erroSig || !signatariosCriados) {
    return NextResponse.json({ error: erroSig?.message }, { status: 500 });
  }

  const admin = createAdminClient();
  const [comercialFile, tecnicaFile] = await Promise.all([
    admin.storage.from("documentos").download(proposta.pdf_comercial_path),
    admin.storage.from("documentos").download(proposta.pdf_tecnica_path),
  ]);

  if (comercialFile.error || tecnicaFile.error || !comercialFile.data || !tecnicaFile.data) {
    return NextResponse.json({ error: "Falha ao carregar os PDFs gerados." }, { status: 500 });
  }

  const comercialBuffer = await comercialFile.data.arrayBuffer();
  const tecnicaBuffer = await tecnicaFile.data.arrayBuffer();

  // O documento que vai para ASSINATURA não leva a nota de validade (a validade de
  // 30 dias é da proposta ENVIADA para aceite, não do contrato que será assinado).
  // Regenera o comercial com validadeDias=0 (definido em montarDadosDaProposta).
  // Como a nota fica fora do fluxo, o layout é idêntico ao gerado e as posições dos
  // campos de assinatura permanecem válidas. Em falha, cai no PDF original.
  let comercialParaAssinar: ArrayBuffer | Uint8Array = comercialBuffer;
  try {
    const { data: plano } = proposta.plano_id
      ? await admin.from("planos").select("nome, franquia_pedidos").eq("id", proposta.plano_id).single()
      : { data: null };
    if (plano && contato) {
      const dados = montarDadosDaProposta(proposta as any, plano as any, contato as any);
      comercialParaAssinar = await renderPropostaComercialPdf(dados);
    }
  } catch (e) {
    console.error("Falha ao regerar comercial sem validade para assinatura; usando o original", e);
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  let algumEmailEnviado = false;
  let emailErro: string | null = null;
  for (const sig of signatariosCriados) {
    const token = sig.token;
    const [upComercial, upTecnica] = await Promise.all([
      admin.storage.from("assinatura-publica").upload(`${token}/comercial.pdf`, comercialParaAssinar, {
        contentType: "application/pdf",
        upsert: true,
      }),
      admin.storage.from("assinatura-publica").upload(`${token}/tecnica.pdf`, tecnicaBuffer, {
        contentType: "application/pdf",
        upsert: true,
      }),
    ]);
    if (upComercial.error || upTecnica.error) {
      console.error("Falha ao publicar PDFs para assinatura", upComercial.error, upTecnica.error);
      return NextResponse.json({ error: "Falha ao publicar os PDFs para assinatura." }, { status: 500 });
    }

    const linkAssinatura = `${origin}/assinar/${token}`;
    const resultado = await enviarDoTenant(admin, usuarioAtual?.tenant_id, {
      para: sig.email,
      assunto: `Proposta Softeum ${proposta.numero} - assinatura eletronica`,
      html: emailBase(`
        <h2 style="margin-top:0;">Proposta comercial pronta para assinatura</h2>
        <p>Olá ${sig.nome},</p>
        <p>A Softeum preparou a proposta comercial e técnica (${proposta.numero}) para ${negocio?.contato?.empresa || negocio?.contato?.nome || "sua empresa"}. Revise os documentos e assine eletronicamente pelo link abaixo.</p>
        <p style="text-align:center; margin: 28px 0;">
          <a href="${linkAssinatura}" style="background:#4f46e5; color:#fff; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:700;">Revisar e assinar</a>
        </p>
        <p style="font-size:12px; color:#64748b;">Se o botão não funcionar, copie e cole este link no navegador: ${linkAssinatura}</p>
      `),
    });
    if (resultado.enviado) algumEmailEnviado = true;
    if (resultado.erro && !emailErro) emailErro = resultado.erro;
  }

  const linkPrimario = `${origin}/assinar/${signatariosCriados[0].token}`;
  for (const email of copias) {
    await enviarDoTenant(admin, usuarioAtual?.tenant_id, {
      para: email,
      assunto: `Cópia: Proposta Softeum ${proposta.numero}`,
      html: emailBase(`
        <h2 style="margin-top:0;">Cópia da proposta enviada para assinatura</h2>
        <p>Você está recebendo uma cópia da proposta ${proposta.numero} enviada para assinatura.</p>
        <p style="text-align:center; margin: 28px 0;">
          <a href="${linkPrimario}" style="background:#64748b; color:#fff; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:700;">Visualizar proposta</a>
        </p>
      `),
    });
  }

  await supabase.from("propostas").update({ status: "enviada", enviada_em: new Date().toISOString() }).eq("id", id);
  await supabase.from("atividades").insert({
    negocio_id: proposta.negocio_id,
    usuario_id: user.id,
    tipo: "proposta",
    titulo: `Proposta ${proposta.numero} enviada para assinatura`,
    descricao: `Enviada para ${signatariosFinal.map((s) => s.email).join(", ")}.`,
  });
  if (proposta.negocio_id) {
    await supabase.from("negocios").update({ ultima_atividade_em: new Date().toISOString() }).eq("id", proposta.negocio_id);
  }

  return NextResponse.json({
    envelope,
    linkAssinatura: linkPrimario,
    emailEnviado: algumEmailEnviado,
    emailErro: emailErro || null,
  });
}
