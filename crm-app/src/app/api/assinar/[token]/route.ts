import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAnonClient } from "@/lib/supabase/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { renderPropostaComercialPdf } from "@/lib/pdf/PropostaComercial";
import type { DadosProposta } from "@/lib/pdf/dados";

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

async function gerarPdfComCertificado(
  pdfOriginal: ArrayBuffer | Uint8Array,
  info: { titulo: string; assinantes: { nome: string; email: string; ip: string; data: string; tipo: string }[]; numero: string; emailFaturamento?: string }
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

  if (info.emailFaturamento) {
    y -= 10;
    page.drawText("Dados de faturamento:", { x: 50, y, size: 12, font: fontBold });
    y -= 18;
    page.drawText(`E-mail: ${info.emailFaturamento}`, { x: 55, y, size: 10, font });
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
          .select("nome, email, ip_assinatura, assinado_em, assinatura_tipo, assinatura_dados, envelope_id, ordem, email_faturamento")
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

        const emailFaturamento = (todosSig || [])
          .map((s: any) => s.email_faturamento)
          .find((e: string | null) => e && e.trim()) || "";

        const numero = info?.proposta?.numero || "";
        const titulo = info?.negocio?.titulo || "";

        const { data: envelope } = await admin
          .from("envelopes")
          .select("proposta_id")
          .eq("id", signatariosData?.envelope_id || "")
          .single();

        const { data: proposta } = envelope?.proposta_id
          ? await admin.from("propostas").select("*, plano:planos(*)").eq("id", envelope.proposta_id).single()
          : { data: null };

        const [comercialResp, tecnicaResp] = await Promise.all([
          fetch(`${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/comercial.pdf`),
          fetch(`${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/tecnica.pdf`),
        ]);

        if (comercialResp.ok && tecnicaResp.ok) {
          let comercialBuf: ArrayBuffer | Uint8Array = await comercialResp.arrayBuffer();
          let tecnicaBuf: ArrayBuffer | Uint8Array = await tecnicaResp.arrayBuffer();

          if (emailFaturamento && proposta && proposta.plano) {
            try {
              const pl = proposta.plano as any;
              const qtdEmail = Number(proposta.qtd_caixas_email ?? 0);
              const qtdWhats = Number(proposta.qtd_numeros_whatsapp ?? 0);
              const valModEmail = Number(proposta.valor_modulo_email ?? 0);
              const valModWhats = Number(proposta.valor_modulo_whatsapp ?? 0);
              const valorMensalTotal =
                Number(proposta.valor_plataforma) + Number(proposta.valor_uso) +
                (qtdEmail > 0 ? valModEmail : 0) + (qtdWhats > 0 ? valModWhats : 0);

              const dadosPdf: DadosProposta = {
                clienteRazaoSocial: info.contato.empresa || info.contato.nome,
                clienteCnpj: info.contato.cnpj,
                numeroProposta: proposta.numero,
                versao: proposta.versao,
                cidade: "Sao Paulo",
                data: new Date(proposta.criado_em || Date.now()).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
                planoNome: pl.nome,
                tetoPedidos: pl.franquia_pedidos,
                valorSetupPlataforma: Number(pl.valor_setup_plataforma),
                valorSetupErp: Number(pl.valor_setup_erp),
                valorSetupCatalogo: Number(pl.valor_setup_catalogo),
                valorSetupTotal: Number(pl.valor_setup_plataforma) + Number(pl.valor_setup_erp) + Number(pl.valor_setup_catalogo),
                valorPlataforma: Number(proposta.valor_plataforma),
                valorUso: Number(proposta.valor_uso),
                qtdCaixasEmail: qtdEmail,
                valorModuloEmail: valModEmail,
                qtdNumerosWhatsapp: qtdWhats,
                valorModuloWhatsapp: valModWhats,
                valorMensalTotal,
                valorExcedentePedido: Number(proposta.valor_excedente_pedido),
                prazoContratoMeses: proposta.prazo_contrato_meses,
                diasAviso: proposta.aviso_previo_dias,
                vencimentoSetup: "15 dias apos emissao",
                formaPagamento: proposta.forma_pagamento || "Pix ou Boleto",
                condicaoSetup: "100% no aceite da proposta",
                vencimentoMensal: "todo dia 10",
                indiceReajuste: "IPCA",
                validadeDias: 15,
                sla: "99% de disponibilidade mensal",
                softeumAssinante: "Softeum Tecnologia",
                softeumAssinanteEmail: "contato@softeum.com.br",
                softeumAssinante2: "Softeum Tecnologia",
                softeumCnpj: "00.000.000/0001-00",
                clienteAssinante: info.contato.nome,
                linkSuporte: "https://www.softeum.com.br/suporte",
                emailFaturamento,
              };
              comercialBuf = await renderPropostaComercialPdf(dadosPdf);
            } catch (e) {
              console.error("Falha ao regenerar PDF com email de faturamento", e);
            }
          }

          if (camposAssinatura.length > 0 && todosSig) {
            for (const sig of todosSig) {
              if (sig.assinatura_tipo && sig.assinatura_dados && sig.ordem != null) {
                const camposComercial = camposAssinatura.filter((c: CampoAssinatura) => c.documento === "comercial");
                const camposTecnica = camposAssinatura.filter((c: CampoAssinatura) => c.documento === "tecnica");
                if (camposComercial.length > 0) {
                  comercialBuf = await embutirAssinaturasNoPdf(comercialBuf, camposComercial, sig.ordem as number, sig.assinatura_tipo, sig.assinatura_dados);
                }
                if (camposTecnica.length > 0) {
                  tecnicaBuf = await embutirAssinaturasNoPdf(tecnicaBuf, camposTecnica, sig.ordem as number, sig.assinatura_tipo, sig.assinatura_dados);
                }
              }
            }
          }

          const comercialAssinado = await gerarPdfComCertificado(comercialBuf, { titulo, assinantes, numero: `${numero} (Comercial)`, emailFaturamento });
          const tecnicaAssinado = await gerarPdfComCertificado(tecnicaBuf, { titulo, assinantes, numero: `${numero} (Tecnica)`, emailFaturamento });

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
  } catch (e: any) {
    console.error("Erro na rota /api/assinar:", e);
    return NextResponse.json({ error: e?.message || "Erro interno ao processar assinatura." }, { status: 500 });
  }
}
