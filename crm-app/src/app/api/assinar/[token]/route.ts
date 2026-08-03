import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAnonClient } from "@/lib/supabase/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/config";

async function gerarPdfComCertificado(
  pdfOriginal: ArrayBuffer,
  info: { titulo: string; assinantes: { nome: string; email: string; ip: string; data: string; tipo: string }[]; numero: string }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfOriginal);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const { height } = page.getSize();
  let y = height - 60;

  page.drawText("CERTIFICADO DE CONCLUSAO", { x: 50, y, size: 18, font: fontBold, color: rgb(0.31, 0.27, 0.9) });
  y -= 12;
  page.drawText("Assinatura eletronica - Softeum", { x: 50, y: y - 8, size: 10, font, color: rgb(0.4, 0.4, 0.45) });
  y -= 40;
  page.drawText(`Documento: ${info.titulo}`, { x: 50, y, size: 11, font: fontBold });
  y -= 18;
  page.drawText(`Proposta: ${info.numero}`, { x: 50, y, size: 11, font });
  y -= 30;
  page.drawText("Signatarios:", { x: 50, y, size: 12, font: fontBold });
  y -= 22;

  for (const a of info.assinantes) {
    page.drawText(`- ${a.nome} (${a.email})`, { x: 55, y, size: 10, font: fontBold });
    y -= 15;
    page.drawText(`  Assinado em ${a.data} · IP ${a.ip} · assinatura ${a.tipo}`, { x: 55, y, size: 9, font, color: rgb(0.3, 0.3, 0.35) });
    y -= 22;
  }

  y -= 10;
  page.drawText(
    "Documento assinado eletronicamente nos termos do art. 10, par. 2 da MP no 2.200-2/2001.",
    { x: 50, y, size: 8, font, color: rgb(0.4, 0.4, 0.45) }
  );

  return doc.save();
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json();
  const { tipo, dados } = body;

  if (!tipo || !dados) {
    return NextResponse.json({ error: "Assinatura vazia." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
  const userAgent = request.headers.get("user-agent") || "desconhecido";

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("registrar_assinatura", {
    p_token: token,
    p_tipo: tipo,
    p_dados: dados,
    p_ip: ip,
    p_user_agent: userAgent,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Se o envelope foi concluido, gera os PDFs com certificado de conclusao
  if (data && (data as any).envelope_concluido && temServiceRole()) {
    try {
      const admin = createAdminClient();
      const envelopeInfo = (await supabase.rpc("obter_envelope_publico", { p_token: token })) as any;
      const info = envelopeInfo.data;

      const { data: signatariosData } = await admin
        .from("signatarios")
        .select("nome, email, ip_assinatura, assinado_em, assinatura_tipo, envelope_id")
        .eq("token", token)
        .single();

      const { data: todosSig } = await admin
        .from("signatarios")
        .select("nome, email, ip_assinatura, assinado_em, assinatura_tipo")
        .eq("envelope_id", signatariosData?.envelope_id || "");

      const assinantes = (todosSig || []).map((s: any) => ({
        nome: s.nome,
        email: s.email,
        ip: s.ip_assinatura || "-",
        data: s.assinado_em ? new Date(s.assinado_em).toLocaleString("pt-BR") : "-",
        tipo: s.assinatura_tipo || "digitada",
      }));

      const numero = info?.proposta?.numero || "";
      const titulo = info?.negocio?.titulo || "";

      const [comercialResp, tecnicaResp] = await Promise.all([
        fetch(`${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/comercial.pdf`),
        fetch(`${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/tecnica.pdf`),
      ]);

      if (comercialResp.ok && tecnicaResp.ok) {
        const [comercialBuf, tecnicaBuf] = await Promise.all([comercialResp.arrayBuffer(), tecnicaResp.arrayBuffer()]);
        const comercialAssinado = await gerarPdfComCertificado(comercialBuf, { titulo, assinantes, numero: `${numero} (Comercial)` });
        const tecnicaAssinado = await gerarPdfComCertificado(tecnicaBuf, { titulo, assinantes, numero: `${numero} (Tecnica)` });

        await Promise.all([
          admin.storage.from("assinatura-publica").upload(`${token}/comercial-assinado.pdf`, comercialAssinado, {
            contentType: "application/pdf",
            upsert: true,
          }),
          admin.storage.from("assinatura-publica").upload(`${token}/tecnica-assinado.pdf`, tecnicaAssinado, {
            contentType: "application/pdf",
            upsert: true,
          }),
        ]);

        const urlComercial = `${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/comercial-assinado.pdf`;
        const urlTecnica = `${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/tecnica-assinado.pdf`;
        await supabase.rpc("salvar_pdf_assinado", { p_token: token, p_comercial_url: urlComercial, p_tecnica_url: urlTecnica });
      }
    } catch (e) {
      console.error("Falha ao gerar PDF assinado", e);
    }
  }

  return NextResponse.json(data);
}
