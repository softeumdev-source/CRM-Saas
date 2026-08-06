import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAnonClient } from "@/lib/supabase/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { enviarEmail, emailBase } from "@/lib/resend";
import { renderPropostaComercialPdf } from "@/lib/pdf/PropostaComercial";
import { montarDadosDaProposta } from "@/lib/pdf/montarDados";

interface CampoAssinatura {
  id: string;
  signatario_ordem: number;
  tipo: string;
  documento: "comercial" | "tecnica";
  pagina: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
}

async function embutirAssinaturasNoPdf(
  pdfBytes: ArrayBuffer | Uint8Array,
  campos: CampoAssinatura[],
  signatarioOrdem: number,
  assinaturaTipo: string,
  assinaturaDados: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaOblique);
  const meusCampos = campos.filter((c) => c.signatario_ordem === signatarioOrdem);

  for (const campo of meusCampos) {
    const pageIdx = campo.pagina - 1;
    if (pageIdx < 0 || pageIdx >= doc.getPageCount()) continue;
    const page = doc.getPage(pageIdx);
    const { width, height } = page.getSize();

    const x = campo.x * width;
    const w = campo.largura * width;
    const h = campo.altura * height;
    const y = height - campo.y * height - h;

    if (assinaturaTipo === "desenhada" && assinaturaDados.startsWith("data:image/png")) {
      try {
        const base64 = assinaturaDados.split(",")[1];
        const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const img = await doc.embedPng(imgBytes);
        const scaled = img.scaleToFit(w - 4, h - 4);
        page.drawImage(img, {
          x: x + (w - scaled.width) / 2,
          y: y + (h - scaled.height) / 2,
          width: scaled.width,
          height: scaled.height,
        });
      } catch (e) {
        console.error("Falha ao embutir imagem de assinatura", e);
      }
    } else {
      const fontSize = Math.min(h * 0.5, 18);
      page.drawText(String(assinaturaDados), {
        x: x + 4,
        y: y + h / 2 - fontSize / 3,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.3),
      });
    }
  }

  return doc.save();
}

interface CertificadoInfo {
  titulo: string;
  assinantes: { nome: string; email: string; ip: string; data: string; tipo: string }[];
  numero: string;
  emailFaturamento?: string;
}

async function gerarPdfComCertificado(
  pdfOriginal: ArrayBuffer | Uint8Array,
  info: CertificadoInfo
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfOriginal);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const { height } = page.getSize();
  let y = height - 60;

  page.drawText("CERTIFICADO DE CONCLUSÃO", { x: 50, y, size: 18, font: fontBold, color: rgb(0.31, 0.27, 0.9) });
  y -= 12;
  page.drawText("Assinatura eletrônica - Softeum", { x: 50, y: y - 8, size: 10, font, color: rgb(0.4, 0.4, 0.45) });
  y -= 40;
  page.drawText(`Documento: ${info.titulo}`, { x: 50, y, size: 11, font: fontBold });
  y -= 18;
  page.drawText(`Proposta: ${info.numero}`, { x: 50, y, size: 11, font });
  y -= 30;
  page.drawText("Signatários:", { x: 50, y, size: 12, font: fontBold });
  y -= 22;

  for (const a of info.assinantes) {
    page.drawText(`- ${a.nome} (${a.email})`, { x: 55, y, size: 10, font: fontBold });
    y -= 15;
    page.drawText(`  Assinado em ${a.data} · IP ${a.ip} · assinatura ${a.tipo}`, { x: 55, y, size: 9, font, color: rgb(0.3, 0.3, 0.35) });
    y -= 22;
  }

  if (info.emailFaturamento) {
    y -= 10;
    page.drawText("Email para faturamento:", { x: 50, y, size: 10, font: fontBold });
    y -= 16;
    page.drawText(info.emailFaturamento, { x: 55, y, size: 10, font, color: rgb(0.15, 0.38, 0.92) });
    y -= 22;
  }

  y -= 10;
  page.drawText(
    "Documento assinado eletronicamente nos termos do art. 10, §2º da MP nº 2.200-2/2001.",
    { x: 50, y, size: 8, font, color: rgb(0.4, 0.4, 0.45) }
  );

  return doc.save();
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const body = await request.json();
    const { tipo, dados, email_faturamento } = body;

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
      p_email_faturamento: email_faturamento || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data && (data as any).envelope_concluido && temServiceRole()) {
      try {
        const admin = createAdminClient();
        const envelopeInfo = (await supabase.rpc("obter_envelope_publico", { p_token: token })) as any;
        const info = envelopeInfo.data;
        const camposAssinatura: CampoAssinatura[] = info?.envelope?.campos_assinatura || [];

        const { data: signatariosData } = await admin
          .from("signatarios")
          .select("nome, email, ip_assinatura, assinado_em, assinatura_tipo, assinatura_dados, envelope_id, ordem")
          .eq("token", token)
          .single();

        const { data: todosSig } = await admin
          .from("signatarios")
          .select("nome, email, ip_assinatura, assinado_em, assinatura_tipo, assinatura_dados, ordem, email_faturamento")
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

        // E-mails de faturamento preenchidos pelos signatários, SEM duplicar:
        // se 3 pessoas da empresa assinam e digitam o mesmo e-mail, ele aparece
        // uma vez só (dedup sem diferenciar maiúsculas/minúsculas).
        const emailsFatMap = new Map<string, string>();
        for (const s of todosSig || []) {
          const e = (s.email_faturamento || "").trim();
          if (e) emailsFatMap.set(e.toLowerCase(), e);
        }
        const eAtual = (email_faturamento || "").trim();
        if (eAtual) emailsFatMap.set(eAtual.toLowerCase(), eAtual);
        const emailFat = [...emailsFatMap.values()].join(", ");

        const [comercialResp, tecnicaResp] = await Promise.all([
          fetch(`${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/comercial.pdf`),
          fetch(`${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/tecnica.pdf`),
        ]);

        if (comercialResp.ok && tecnicaResp.ok) {
          // Regera o comercial com o(s) e-mail(s) de faturamento preenchido(s),
          // renderizando nativamente (react-pdf) em vez de "carimbar" texto no
          // PDF pronto — o que dependia do encoding e falhava silenciosamente.
          // Layout idêntico ao original → posições de assinatura preservadas.
          // Em qualquer falha, cai no PDF original já enviado.
          let comercialBuf: ArrayBuffer | Uint8Array = await comercialResp.arrayBuffer();
          let tecnicaBuf: ArrayBuffer | Uint8Array = await tecnicaResp.arrayBuffer();

          if (emailFat) {
            try {
              const { data: envRow } = await admin
                .from("envelopes")
                .select("proposta_id")
                .eq("id", signatariosData?.envelope_id || "")
                .single();
              const { data: prop } = await admin
                .from("propostas")
                .select("*")
                .eq("id", envRow?.proposta_id || "")
                .single();
              const [{ data: pl }, { data: neg }] = await Promise.all([
                admin.from("planos").select("nome, franquia_pedidos").eq("id", prop?.plano_id || "").single(),
                admin.from("negocios").select("contato:contatos(nome, empresa, cnpj, email)").eq("id", prop?.negocio_id || "").single(),
              ]);
              const contato = (neg as any)?.contato;
              if (prop && pl && contato) {
                const dados = montarDadosDaProposta(prop as any, pl as any, contato, { emailFaturamento: emailFat });
                comercialBuf = await renderPropostaComercialPdf(dados);
              }
            } catch (e) {
              console.error("Falha ao regerar comercial com email de faturamento; usando o original", e);
            }
          }

          if (camposAssinatura.length > 0 && todosSig) {
            for (const sig of todosSig) {
              if (sig.assinatura_tipo && sig.assinatura_dados && sig.ordem != null) {
                const camposComercial = camposAssinatura.filter((c) => c.documento === "comercial");
                const camposTecnica = camposAssinatura.filter((c) => c.documento === "tecnica");
                if (camposComercial.length > 0) {
                  comercialBuf = await embutirAssinaturasNoPdf(comercialBuf, camposComercial, sig.ordem as number, sig.assinatura_tipo, sig.assinatura_dados);
                }
                if (camposTecnica.length > 0) {
                  tecnicaBuf = await embutirAssinaturasNoPdf(tecnicaBuf, camposTecnica, sig.ordem as number, sig.assinatura_tipo, sig.assinatura_dados);
                }
              }
            }
          }

          const comercialAssinado = await gerarPdfComCertificado(comercialBuf, {
            titulo,
            assinantes,
            numero: `${numero} (Comercial)`,
            emailFaturamento: emailFat || undefined,
          });
          const tecnicaAssinado = await gerarPdfComCertificado(tecnicaBuf, {
            titulo,
            assinantes,
            numero: `${numero} (Tecnica)`,
          });

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

          const { data: envelopeRow } = await admin
            .from("envelopes")
            .select("copias_emails")
            .eq("id", signatariosData?.envelope_id || "")
            .single();

          const destinatarios = new Set<string>();
          for (const sig of todosSig || []) {
            if (sig.email) destinatarios.add(sig.email);
          }
          for (const cc of (envelopeRow?.copias_emails as string[]) || []) {
            if (cc?.trim()) destinatarios.add(cc.trim());
          }

          for (const emailDest of destinatarios) {
            const sigNome = (todosSig || []).find((s: any) => s.email === emailDest)?.nome || "";
            await enviarEmail({
              to: emailDest,
              subject: `Proposta ${numero} assinada por todos — documentos para download`,
              html: emailBase(`
                <h2 style="margin-top:0;">Documentação assinada disponível para download</h2>
                ${sigNome ? `<p>Olá ${sigNome},</p>` : ""}
                <p>Todos os signatários concluíram a assinatura da proposta <strong>${numero}</strong>${titulo ? ` — ${titulo}` : ""}.</p>
                <p>Os documentos assinados, com certificado de conclusão, estão disponíveis para download:</p>
                <table style="width:100%; margin: 20px 0; border-collapse:collapse;">
                  <tr>
                    <td style="padding:12px; text-align:center;">
                      <a href="${urlComercial}" style="display:inline-block; background:#4f46e5; color:#fff; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:700; font-size:13px;">Proposta Comercial</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px; text-align:center;">
                      <a href="${urlTecnica}" style="display:inline-block; background:#0f172a; color:#fff; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:700; font-size:13px;">Proposta Técnica</a>
                    </td>
                  </tr>
                </table>
                <p style="font-size:12px; color:#64748b;">Os documentos incluem o certificado de conclusão com os dados de todos os signatários.</p>
              `),
            });
          }
        }
      } catch (e) {
        console.error("Falha ao gerar PDF assinado ou enviar emails", e);
      }
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error("Erro na rota /api/assinar:", e);
    return NextResponse.json({ error: e?.message || "Erro interno ao processar assinatura." }, { status: 500 });
  }
}
