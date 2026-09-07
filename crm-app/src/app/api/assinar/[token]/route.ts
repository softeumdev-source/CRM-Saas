import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAnonClient } from "@/lib/supabase/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { emailBase } from "@/lib/resend";
import { escaparHtml } from "@/lib/gmail/corpo";
import { enviarDoTenant } from "@/lib/gmail/enviarDoTenant";
import { quemAssina } from "@/lib/gmail/caixa";
import { emailDeAssinatura } from "@/lib/assinatura/email";
import { renderPropostaComercialPdf } from "@/lib/pdf/PropostaComercial";
import { montarDadosDaProposta } from "@/lib/pdf/montarDados";
import { mensagemDoErro } from "@/lib/erros";
import type { AssinaturaRegistrada, CampoAssinatura, EnvelopePublico } from "@/lib/types";

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

/**
 * A CARGA da página de assinatura, do lado do servidor.
 *
 * Existe por um motivo só: o IP. A página chamava `obter_envelope_publico`
 * direto do navegador, e o banco não tem como saber o endereço de quem chamou —
 * então o "visualizado em" do certificado era uma data sem ninguém atrás dela.
 * A assinatura sempre registrou IP e user-agent (o POST aqui embaixo); a
 * VISUALIZAÇÃO, que é o momento em que a pessoa teve acesso ao documento, não
 * registrava nada.
 *
 * Aqui os dois vêm do `x-forwarded-for` e do `user-agent` da requisição — a
 * mesma fonte que a assinatura usa, o que mantém as duas provas comparáveis.
 *
 * A RPC continua sendo chamada com a chave ANÔNIMA, e não com service role: ela
 * é `security definer` e já sabe se defender: sem token válido, levanta exceção.
 * Trocar por service role só ampliaria o estrago de um defeito futuro.
 *
 * Sem sessão, de propósito: quem abre este link é o cliente, que não tem conta.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
    const userAgent = request.headers.get("user-agent") || "desconhecido";

    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("obter_envelope_publico", {
      p_token: token,
      p_ip: ip,
      p_user_agent: userAgent,
    });

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Link inválido ou expirado." }, { status: 404 });
    }

    return NextResponse.json(data, {
      // Documento de assinatura não entra em cache de ninguém: cada abertura é
      // um evento que precisa chegar ao banco para virar registro.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("Erro ao carregar envelope publico:", e);
    return NextResponse.json({ error: mensagemDoErro(e, "Erro ao carregar o documento.") }, { status: 500 });
  }
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

    let documentosAssinados: { comercial: string; tecnica: string } | null = null;

    if (data && (data as unknown as AssinaturaRegistrada).envelope_concluido && temServiceRole()) {
      try {
        const admin = createAdminClient();
        const envelopeInfo = await supabase.rpc("obter_envelope_publico", { p_token: token });
        const info = envelopeInfo.data as unknown as EnvelopePublico | null;
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

        const assinantes = (todosSig || []).map((s) => ({
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

        // Os dois PDFs de origem, baixados com SERVICE ROLE.
        //
        // Eram dois `fetch` na URL pública do bucket. O bucket fechou — aquela
        // URL não serve mais nada, e sem esta troca o documento assinado
        // simplesmente não seria gerado, em silêncio, dentro do `try`.
        const [comercialResp, tecnicaResp] = await Promise.all([
          admin.storage.from("assinatura-publica").download(`${token}/comercial.pdf`),
          admin.storage.from("assinatura-publica").download(`${token}/tecnica.pdf`),
        ]);

        if (comercialResp.data && tecnicaResp.data) {
          // Regera o comercial com o(s) e-mail(s) de faturamento preenchido(s),
          // renderizando nativamente (react-pdf) em vez de "carimbar" texto no
          // PDF pronto — o que dependia do encoding e falhava silenciosamente.
          // Layout idêntico ao original → posições de assinatura preservadas.
          // Em qualquer falha, cai no PDF original já enviado.
          let comercialBuf: ArrayBuffer | Uint8Array = await comercialResp.data.arrayBuffer();
          let tecnicaBuf: ArrayBuffer | Uint8Array = await tecnicaResp.data.arrayBuffer();

          // Sempre regenera o comercial para assinatura (mesmo sem e-mail de
          // faturamento): é assim que a NOTA DE VALIDADE sai do documento assinado
          // (montarDados usa validadeDias=0). Como a nota fica fora do fluxo, o
          // layout é idêntico ao original e as posições de assinatura se mantêm.
          // Em qualquer falha, cai no PDF original já enviado.
          {
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
              const contato = neg?.contato;
              if (prop && pl && contato) {
                const dados = montarDadosDaProposta(prop, pl, contato, { emailFaturamento: emailFat });
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

          // O QUE VAI PARA O BANCO É CAMINHO; o que vai para o e-mail é o
          // endereço do proxy. Antes os dois eram a mesma coisa — a URL pública
          // do bucket, que não expira e não pede nada — e ela ficava gravada na
          // proposta e linkada no e-mail de conclusão, para sempre.
          const caminhoComercial = `${token}/comercial-assinado.pdf`;
          const caminhoTecnica = `${token}/tecnica-assinado.pdf`;

          const origemApp = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
          const urlComercial = `${origemApp}/api/pdf-publico/${token}/comercial-assinado.pdf`;
          const urlTecnica = `${origemApp}/api/pdf-publico/${token}/tecnica-assinado.pdf`;

          documentosAssinados = { comercial: urlComercial, tecnica: urlTecnica };
          await supabase.rpc("salvar_pdf_assinado", {
            p_token: token,
            p_comercial_path: caminhoComercial,
            p_tecnica_path: caminhoTecnica,
          });

          // Amplia a consulta que ja existia em vez de somar outra ida: o
          // tenant vem pelo mesmo caminho (envelope -> proposta -> negocio).
          // Esta rota e publica e nao tem sessao, entao `usuario_tenant_id()`
          // nao existe aqui.
          const { data: envelopeRow } = await admin
            .from("envelopes")
            .select("copias_emails, proposta:propostas(negocio:negocios(tenant_id))")
            .eq("id", signatariosData?.envelope_id || "")
            .single();
          const tenantId =
            (envelopeRow?.proposta as { negocio?: { tenant_id?: string } } | null)?.negocio?.tenant_id ?? null;

          // Mesma fonte do cabecalho — `enviarDoTenant` le a caixa por dentro,
          // e o corpo precisa do nome antes disso.
          const assinatura = await quemAssina(admin, tenantId);

          const destinatarios = new Set<string>();
          for (const sig of todosSig || []) {
            if (sig.email) destinatarios.add(sig.email);
          }
          for (const cc of (envelopeRow?.copias_emails as string[]) || []) {
            if (cc?.trim()) destinatarios.add(cc.trim());
          }

          // Os PDFs assinados JA estao em memoria aqui. Antes o e-mail mandava
          // um link para o bucket publico; agora vao anexados, o que resolve
          // duas coisas de uma vez: chega quem so le e-mail sem clicar em link,
          // e o documento deixa de depender de uma URL publica eterna.
          const anexosAssinados = [
            {
              nome: `proposta-${numero}-comercial-assinada.pdf`,
              mime: "application/pdf",
              conteudo: Buffer.from(comercialAssinado),
            },
            {
              nome: `proposta-${numero}-tecnica-assinada.pdf`,
              mime: "application/pdf",
              conteudo: Buffer.from(tecnicaAssinado),
            },
          ];

          for (const emailDest of destinatarios) {
            const sigNome = (todosSig || []).find((s) => s.email === emailDest)?.nome || "";
            await enviarDoTenant(admin, tenantId, {
              para: emailDest,
              anexos: anexosAssinados,
              assunto: `Proposta ${numero} assinada por todos — documentos para download`,
              html: emailBase(`
                <h2 style="margin-top:0;">Documentação assinada disponível para download</h2>
                ${sigNome ? `<p>Olá ${escaparHtml(sigNome)},</p>` : ""}
                <p>Todos os signatários concluíram a assinatura da proposta <strong>${escaparHtml(numero)}</strong>${titulo ? ` — ${escaparHtml(titulo)}` : ""}.</p>
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
              `, { assinatura }),
            });
          }
        }
      } catch (e) {
        console.error("Falha ao gerar PDF assinado ou enviar emails", e);
      }
    }

    // A VEZ DO PRÓXIMO.
    //
    // Sem isto a fila trava: o envio manda o link só para o primeiro, e os
    // seguintes nunca receberiam nada — o envelope ficaria aberto para sempre,
    // esperando gente que não sabe que está sendo esperada.
    //
    // O `proximo` vem da RPC sem o token, de propósito: ela roda com a chave
    // anônima, dentro do navegador de quem acabou de assinar, e devolver o
    // token de outra pessoa ali entregaria a credencial dela. O token é buscado
    // AQUI, no servidor, pelo id.
    //
    // A falha é registrada e engolida: quem acabou de assinar já assinou, e a
    // assinatura dele não pode ser desfeita porque o e-mail do próximo não
    // saiu. Quando isso acontece, o vendedor tem o botão de reenvio na tela.
    const proximo = (data as unknown as AssinaturaRegistrada)?.proximo;
    if (proximo?.id && temServiceRole()) {
      try {
        const admin = createAdminClient();
        const { data: sigProximo } = await admin
          .from("signatarios")
          .select("token, nome, email, envelope:envelopes(proposta:propostas(numero, tenant_id, negocio:negocios(contato:contatos(nome, empresa))))")
          .eq("id", proximo.id)
          .single();

        const prop = sigProximo?.envelope?.proposta;
        const contatoProx = prop?.negocio?.contato;
        if (sigProximo?.token) {
          const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
          const envioProximo = await enviarDoTenant(admin, prop?.tenant_id, {
            para: sigProximo.email,
            assunto: `Proposta Softeum ${prop?.numero ?? ""} - assinatura eletronica`,
            html: emailDeAssinatura({
              nome: sigProximo.nome,
              numero: prop?.numero ?? "",
              empresa: contatoProx?.empresa || contatoProx?.nome || "sua empresa",
              link: `${origin}/assinar/${sigProximo.token}`,
              assinatura: await quemAssina(admin, prop?.tenant_id),
            }),
          });

          // Mesmo registro do primeiro envio: a vez na fila é um envio de link
          // como qualquer outro, e precisa deixar o mesmo rastro.
          if (envioProximo.enviado) {
            await admin
              .from("signatarios")
              .update({ link_enviado_em: new Date().toISOString(), link_enviado_para: sigProximo.email })
              .eq("id", proximo.id);
          }
        }
      } catch (e) {
        console.error("Falha ao avisar o proximo signatario da fila", e);
      }
    }

    return NextResponse.json({ ...(data as Record<string, unknown>), documentos_assinados: documentosAssinados });
  } catch (e) {
    console.error("Erro na rota /api/assinar:", e);
    return NextResponse.json({ error: mensagemDoErro(e, "Erro interno ao processar assinatura.") }, { status: 500 });
  }
}
