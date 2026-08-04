import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderPropostaComercialPdf } from "@/lib/pdf/PropostaComercial";
import { renderPropostaTecnicaPdf } from "@/lib/pdf/PropostaTecnica";
import type { DadosProposta } from "@/lib/pdf/dados";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const body = await request.json();
  const {
    negocioId,
    planoId,
    avisoPrevioDias,
    valorPlataforma,
    valorUso,
    qtdCaixasEmail,
    valorModuloEmail,
    qtdNumerosWhatsapp,
    valorModuloWhatsapp,
    prazoContratoMeses,
    formaPagamento,
    valorSetup,
  } = body;

  if (!negocioId || !planoId) {
    return NextResponse.json({ error: "negocioId e planoId sao obrigatorios." }, { status: 400 });
  }

  const { data: negocio } = await supabase
    .from("negocios")
    .select("*, contato:contatos(*), tenant:tenants(*)")
    .eq("id", negocioId)
    .single();

  if (!negocio) {
    return NextResponse.json({ error: "Negocio nao encontrado." }, { status: 404 });
  }
  if (!negocio.contato?.cnpj || !negocio.contato.cnpj.trim()) {
    return NextResponse.json(
      { error: "Este contato nao tem CNPJ cadastrado. Preencha o CNPJ antes de gerar a proposta." },
      { status: 422 }
    );
  }

  const { data: plano } = await supabase.from("planos").select("*").eq("id", planoId).single();
  if (!plano) {
    return NextResponse.json({ error: "Plano nao encontrado." }, { status: 404 });
  }

  const valorPlataformaFinal = Number(valorPlataforma ?? plano.valor_plataforma_base);
  const valorUsoFinal = Number(valorUso ?? plano.valor_uso_base);
  if (valorPlataformaFinal < plano.valor_plataforma_base || valorUsoFinal < plano.valor_uso_base) {
    return NextResponse.json(
      { error: "Os valores da proposta nao podem ser menores que os valores base do plano cadastrado pelo admin." },
      { status: 422 }
    );
  }

  const tenantId = negocio.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "Negocio sem tenant associado." }, { status: 500 });
  }
  const { data: tenant } = await supabase.from("tenants").select("*").eq("id", tenantId).single();
  const { count } = await supabase
    .from("propostas")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const numero = `${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const valorSetupPlano = Number(plano.valor_setup_plataforma) + Number(plano.valor_setup_erp) + Number(plano.valor_setup_catalogo);
  const valorSetupTotal = valorSetup != null ? Number(valorSetup) : valorSetupPlano;
  const qtdEmail = Number(qtdCaixasEmail ?? 0);
  const qtdWhats = Number(qtdNumerosWhatsapp ?? 0);
  const valorModEmail = Number(valorModuloEmail ?? 0);
  const valorModWhats = Number(valorModuloWhatsapp ?? 0);
  const valorMensalTotal = valorPlataformaFinal + valorUsoFinal + (qtdEmail > 0 ? valorModEmail : 0) + (qtdWhats > 0 ? valorModWhats : 0);

  const dados: DadosProposta = {
    clienteRazaoSocial: negocio.contato.empresa || negocio.contato.nome,
    clienteCnpj: negocio.contato.cnpj,
    numeroProposta: numero,
    versao: 1,
    cidade: "Sao Paulo",
    data: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    planoNome: plano.nome,
    tetoPedidos: plano.franquia_pedidos,
    valorSetupPlataforma: valorSetupTotal,
    valorSetupErp: 0,
    valorSetupCatalogo: 0,
    valorSetupTotal,
    valorPlataforma: valorPlataformaFinal,
    valorUso: valorUsoFinal,
    qtdCaixasEmail: qtdEmail,
    valorModuloEmail: valorModEmail,
    qtdNumerosWhatsapp: qtdWhats,
    valorModuloWhatsapp: valorModWhats,
    valorMensalTotal,
    valorExcedentePedido: Number(plano.valor_excedente_pedido),
    emailMonitorado1: negocio.contato.email || undefined,
    prazoContratoMeses: Number(prazoContratoMeses ?? 12),
    diasAviso: Number(avisoPrevioDias ?? 180),
    vencimentoSetup: "15 dias apos emissao",
    formaPagamento: formaPagamento || "Pix ou Boleto",
    condicaoSetup: "100% no aceite da proposta",
    vencimentoMensal: "todo dia 10",
    indiceReajuste: "IPCA",
    validadeDias: 15,
    sla: "99% de disponibilidade mensal",
    softeumAssinante: "Softeum Tecnologia",
    softeumAssinanteEmail: "contato@softeum.com.br",
    softeumAssinante2: "Softeum Tecnologia",
    softeumCnpj: tenant?.slug === "softeum" ? "00.000.000/0001-00" : "00.000.000/0001-00",
    clienteAssinante: negocio.contato.nome,
    linkSuporte: process.env.NEXT_PUBLIC_SUPPORT_URL || "https://www.softeum.com.br/suporte",
    linkArquitetura: "https://api.softeum.com.br/arquitetura",
    linkDocumentacaoApi: "https://api.softeum.com.br/docs",
  };

  const [comercialBuffer, tecnicaBuffer] = await Promise.all([
    renderPropostaComercialPdf(dados),
    renderPropostaTecnicaPdf(dados),
  ]);

  const basePath = `${tenantId}/${negocioId}`;
  const comercialPath = `${basePath}/proposta-${numero}-comercial.pdf`;
  const tecnicaPath = `${basePath}/proposta-${numero}-tecnica.pdf`;

  const [uploadComercial, uploadTecnica] = await Promise.all([
    supabase.storage.from("documentos").upload(comercialPath, comercialBuffer, {
      contentType: "application/pdf",
      upsert: true,
    }),
    supabase.storage.from("documentos").upload(tecnicaPath, tecnicaBuffer, {
      contentType: "application/pdf",
      upsert: true,
    }),
  ]);

  if (uploadComercial.error || uploadTecnica.error) {
    return NextResponse.json(
      { error: uploadComercial.error?.message || uploadTecnica.error?.message },
      { status: 500 }
    );
  }

  const { data: proposta, error: erroProposta } = await supabase
    .from("propostas")
    .insert({
      tenant_id: tenantId,
      negocio_id: negocioId,
      plano_id: planoId,
      gerado_por: user.id,
      numero,
      versao: 1,
      aviso_previo_dias: Number(avisoPrevioDias ?? 180),
      prazo_contrato_meses: Number(prazoContratoMeses ?? 12),
      valor_setup_plataforma: valorSetupTotal,
      valor_setup_erp: 0,
      valor_setup_catalogo: 0,
      valor_plataforma: valorPlataformaFinal,
      valor_uso: valorUsoFinal,
      valor_excedente_pedido: dados.valorExcedentePedido,
      valor_plataforma_base_snapshot: plano.valor_plataforma_base,
      valor_uso_base_snapshot: plano.valor_uso_base,
      qtd_caixas_email: qtdEmail,
      valor_modulo_email: valorModEmail,
      qtd_numeros_whatsapp: qtdWhats,
      valor_modulo_whatsapp: valorModWhats,
      forma_pagamento: dados.formaPagamento,
      status: "rascunho",
      pdf_comercial_path: comercialPath,
      pdf_tecnica_path: tecnicaPath,
    })
    .select()
    .single();

  if (erroProposta || !proposta) {
    return NextResponse.json({ error: erroProposta?.message }, { status: 500 });
  }

  await supabase.from("atividades").insert({
    negocio_id: negocioId,
    usuario_id: user.id,
    tipo: "proposta",
    titulo: `Proposta ${numero} gerada`,
    descricao: `Plano ${plano.nome}, aviso previo de ${avisoPrevioDias ?? 180} dias.`,
  });

  const [{ data: urlComercial }, { data: urlTecnica }] = await Promise.all([
    supabase.storage.from("documentos").createSignedUrl(comercialPath, 60 * 30),
    supabase.storage.from("documentos").createSignedUrl(tecnicaPath, 60 * 30),
  ]);

  return NextResponse.json({
    proposta,
    urlComercial: urlComercial?.signedUrl,
    urlTecnica: urlTecnica?.signedUrl,
  });
}
