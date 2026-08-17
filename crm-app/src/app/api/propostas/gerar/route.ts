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
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

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
    return NextResponse.json({ error: "negocioId e planoId são obrigatórios." }, { status: 400 });
  }

  const { data: negocio } = await supabase
    .from("negocios")
    .select("*, contato:contatos(*), tenant:tenants(*)")
    .eq("id", negocioId)
    .single();

  if (!negocio) {
    return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });
  }
  if (!negocio.contato?.cnpj || !negocio.contato.cnpj.trim()) {
    return NextResponse.json(
      { error: "Este contato não tem CNPJ cadastrado. Preencha o CNPJ antes de gerar a proposta." },
      { status: 422 }
    );
  }

  const { data: plano } = await supabase.from("planos").select("*").eq("id", planoId).single();
  if (!plano) {
    return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = usuario?.role === "admin";

  const valorPlataformaFinal = Number(valorPlataforma ?? plano.valor_plataforma_base);
  const valorUsoFinal = Number(valorUso ?? plano.valor_uso_base);
  const valorMensalSolicitado = valorPlataformaFinal + valorUsoFinal;
  const valorMensalBase = Number(plano.valor_plataforma_base) + Number(plano.valor_uso_base);

  // Piso padrão: valor base do plano (mensal) e R$ 500 (setup) para vendedor.
  // Um desconto aprovado pelo admin para este negócio rebaixa o piso ao valor liberado.
  let pisoMensal = valorMensalBase;
  let pisoSetup = 500;
  if (!isAdmin) {
    const { data: aprovacao } = await supabase
      .from("solicitacoes_desconto")
      .select("valor_mensal_solicitado, valor_setup_solicitado")
      .eq("negocio_id", negocioId)
      .eq("status", "aprovado")
      .order("decidido_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (aprovacao) {
      pisoMensal = Math.min(pisoMensal, Number(aprovacao.valor_mensal_solicitado));
      pisoSetup = Math.min(pisoSetup, Number(aprovacao.valor_setup_solicitado));
    }
  }

  if (!isAdmin && valorMensalSolicitado < pisoMensal) {
    return NextResponse.json(
      {
        error:
          pisoMensal < valorMensalBase
            ? `O valor mensal aprovado para este negócio é ${pisoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Não é possível cobrar abaixo disso.`
            : `O valor mensal não pode ser menor que ${valorMensalBase.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (valor base do plano). Solicite aprovação de desconto ao admin.`,
      },
      { status: 422 }
    );
  }

  if (!isAdmin && valorSetup != null && Number(valorSetup) < pisoSetup) {
    return NextResponse.json(
      { error: `O valor de setup mínimo para este negócio é ${pisoSetup.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.` },
      { status: 422 }
    );
  }

  // Piso efetivo que ESTA proposta respeita: base do plano, ou o piso rebaixado por
  // um desconto aprovado (0 para admin, que precifica livre). É o valor gravado nos
  // snapshots, e a CHECK do banco compara valor_plataforma >= snapshot — então o
  // snapshot PRECISA refletir o desconto aprovado; do contrário a constraint rejeita
  // um desconto que o admin já autorizou e a proposta nunca é gerada.
  const pisoPlataformaSnapshot = isAdmin ? 0 : Math.min(Number(plano.valor_plataforma_base), pisoMensal);
  const pisoUsoSnapshot = isAdmin ? 0 : Number(plano.valor_uso_base);

  const tenantId = negocio.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: "Negócio sem tenant associado." }, { status: 500 });
  }
  const { data: tenant } = await supabase.from("tenants").select("*").eq("id", tenantId).single();

  const valorSetupPlano = Number(plano.valor_setup_plataforma) + Number(plano.valor_setup_erp) + Number(plano.valor_setup_catalogo);
  const valorSetupTotal = valorSetup != null ? Number(valorSetup) : valorSetupPlano;
  const qtdEmail = Number(qtdCaixasEmail ?? 0);
  const qtdWhats = Number(qtdNumerosWhatsapp ?? 0);
  const valorModEmail = Number(valorModuloEmail ?? 0);
  const valorModWhats = Number(valorModuloWhatsapp ?? 0);
  const valorMensalTotal = valorPlataformaFinal + valorUsoFinal + (qtdEmail > 0 ? valorModEmail : 0) + (qtdWhats > 0 ? valorModWhats : 0);

  // A proposta é criada ANTES de renderizar os PDFs: o número e a versão são
  // atribuídos pelo banco (trigger com lock por tenant), então nunca se repetem.
  // Antes o número vinha de count(*) + 1 no app: apagar uma proposta fazia o
  // contador voltar, o número repetir e o upload sobrescrever o PDF anterior —
  // era o "gerou um documento e apareceram dois" no mesmo negócio.
  const { data: proposta, error: erroProposta } = await supabase
    .from("propostas")
    .insert({
      tenant_id: tenantId,
      negocio_id: negocioId,
      plano_id: planoId,
      gerado_por: user.id,
      aviso_previo_dias: Number(avisoPrevioDias ?? 180),
      prazo_contrato_meses: Number(prazoContratoMeses ?? 12),
      valor_setup_plataforma: valorSetupTotal,
      valor_setup_erp: 0,
      valor_setup_catalogo: 0,
      valor_plataforma: valorPlataformaFinal,
      valor_uso: valorUsoFinal,
      valor_excedente_pedido: Number(plano.valor_excedente_pedido),
      valor_plataforma_base_snapshot: pisoPlataformaSnapshot,
      valor_uso_base_snapshot: pisoUsoSnapshot,
      qtd_caixas_email: qtdEmail,
      valor_modulo_email: valorModEmail,
      qtd_numeros_whatsapp: qtdWhats,
      valor_modulo_whatsapp: valorModWhats,
      forma_pagamento: formaPagamento || "Pix ou Boleto",
      status: "rascunho",
    })
    .select()
    .single();

  if (erroProposta || !proposta) {
    return NextResponse.json({ error: erroProposta?.message || "Falha ao criar a proposta." }, { status: 500 });
  }

  const numero = proposta.numero;

  const dados: DadosProposta = {
    clienteRazaoSocial: negocio.contato.empresa || negocio.contato.nome,
    clienteCnpj: negocio.contato.cnpj,
    numeroProposta: numero,
    versao: proposta.versao,
    cidade: "Joinville - SC",
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
    vencimentoSetup: "15 dias após emissão",
    formaPagamento: formaPagamento || "Pix ou Boleto",
    condicaoSetup: "100% no aceite da proposta",
    vencimentoMensal: "todo dia 10",
    indiceReajuste: "IPCA",
    validadeDias: 30,
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

  // Caminho por id da proposta: dois documentos nunca disputam o mesmo arquivo.
  const basePath = `${tenantId}/${negocioId}/${proposta.id}`;
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
    // Sem PDF a proposta não serve para nada: desfaz para não sobrar rascunho órfão.
    await supabase.from("propostas").delete().eq("id", proposta.id);
    return NextResponse.json(
      { error: uploadComercial.error?.message || uploadTecnica.error?.message },
      { status: 500 }
    );
  }

  const { data: propostaFinal, error: erroPaths } = await supabase
    .from("propostas")
    .update({ pdf_comercial_path: comercialPath, pdf_tecnica_path: tecnicaPath })
    .eq("id", proposta.id)
    .select()
    .single();

  if (erroPaths || !propostaFinal) {
    return NextResponse.json({ error: erroPaths?.message || "Falha ao salvar os PDFs da proposta." }, { status: 500 });
  }

  await supabase.from("atividades").insert({
    negocio_id: negocioId,
    usuario_id: user.id,
    tipo: "proposta",
    titulo: `Proposta ${numero} (v${propostaFinal.versao}) gerada`,
    descricao: `Plano ${plano.nome}, aviso previo de ${avisoPrevioDias ?? 180} dias.`,
  });

  const [{ data: urlComercial }, { data: urlTecnica }] = await Promise.all([
    supabase.storage.from("documentos").createSignedUrl(comercialPath, 60 * 30),
    supabase.storage.from("documentos").createSignedUrl(tecnicaPath, 60 * 30),
  ]);

  return NextResponse.json({
    proposta: propostaFinal,
    urlComercial: urlComercial?.signedUrl,
    urlTecnica: urlTecnica?.signedUrl,
  });
}
