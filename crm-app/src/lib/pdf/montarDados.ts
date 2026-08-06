import type { DadosProposta } from "@/lib/pdf/dados";

// Reconstrói os dados da proposta a partir do registro já salvo (todos os
// valores ficam "snapshotados" na tabela `propostas`), para poder REGERAR o
// PDF na assinatura — por exemplo, já com o e-mail de faturamento preenchido.
// O layout sai idêntico ao original, então as posições de assinatura seguem
// válidas.

interface PropostaRegistro {
  numero: string;
  versao: number | null;
  criado_em: string | null;
  valor_setup_plataforma: number;
  valor_setup_erp: number;
  valor_setup_catalogo: number;
  valor_plataforma: number;
  valor_uso: number;
  qtd_caixas_email: number | null;
  valor_modulo_email: number | null;
  qtd_numeros_whatsapp: number | null;
  valor_modulo_whatsapp: number | null;
  valor_excedente_pedido: number;
  forma_pagamento: string | null;
  aviso_previo_dias: number;
  prazo_contrato_meses: number;
}

interface PlanoRegistro {
  nome: string;
  franquia_pedidos: number;
}

interface ContatoRegistro {
  nome: string;
  empresa: string | null;
  cnpj: string | null;
  email: string | null;
}

export function montarDadosDaProposta(
  proposta: PropostaRegistro,
  plano: PlanoRegistro,
  contato: ContatoRegistro,
  opcoes?: { emailFaturamento?: string },
): DadosProposta {
  const qtdEmail = Number(proposta.qtd_caixas_email ?? 0);
  const qtdWhats = Number(proposta.qtd_numeros_whatsapp ?? 0);
  const valorModEmail = Number(proposta.valor_modulo_email ?? 0);
  const valorModWhats = Number(proposta.valor_modulo_whatsapp ?? 0);
  const valorSetupTotal =
    Number(proposta.valor_setup_plataforma) + Number(proposta.valor_setup_erp) + Number(proposta.valor_setup_catalogo);
  const valorMensalTotal =
    Number(proposta.valor_plataforma) +
    Number(proposta.valor_uso) +
    (qtdEmail > 0 ? valorModEmail : 0) +
    (qtdWhats > 0 ? valorModWhats : 0);

  const dataBase = proposta.criado_em ? new Date(proposta.criado_em) : new Date();

  return {
    clienteRazaoSocial: contato.empresa || contato.nome,
    clienteCnpj: contato.cnpj || "",
    numeroProposta: proposta.numero,
    versao: proposta.versao ?? 1,
    cidade: "Joinville - SC",
    data: dataBase.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    planoNome: plano.nome,
    tetoPedidos: plano.franquia_pedidos,
    valorSetupPlataforma: valorSetupTotal,
    valorSetupErp: 0,
    valorSetupCatalogo: 0,
    valorSetupTotal,
    valorPlataforma: Number(proposta.valor_plataforma),
    valorUso: Number(proposta.valor_uso),
    qtdCaixasEmail: qtdEmail,
    valorModuloEmail: valorModEmail,
    qtdNumerosWhatsapp: qtdWhats,
    valorModuloWhatsapp: valorModWhats,
    valorMensalTotal,
    valorExcedentePedido: Number(proposta.valor_excedente_pedido),
    emailMonitorado1: contato.email || undefined,
    emailFaturamento: opcoes?.emailFaturamento || undefined,
    prazoContratoMeses: Number(proposta.prazo_contrato_meses ?? 12),
    diasAviso: Number(proposta.aviso_previo_dias ?? 180),
    vencimentoSetup: "15 dias após emissão",
    formaPagamento: proposta.forma_pagamento || "Pix ou Boleto",
    condicaoSetup: "100% no aceite da proposta",
    vencimentoMensal: "todo dia 10",
    indiceReajuste: "IPCA",
    // 0 = sem cláusula/nota de validade: este é o documento que vai para ASSINATURA,
    // e a validade de aceite não faz sentido no contrato executado. Como a nota é
    // renderizada fora do fluxo, omiti-la não desloca as posições de assinatura.
    validadeDias: 0,
    sla: "99% de disponibilidade mensal",
    softeumAssinante: "Softeum Tecnologia",
    softeumAssinanteEmail: "contato@softeum.com.br",
    softeumAssinante2: "Softeum Tecnologia",
    softeumCnpj: "00.000.000/0001-00",
    clienteAssinante: contato.nome,
    linkSuporte: process.env.NEXT_PUBLIC_SUPPORT_URL || "https://www.softeum.com.br/suporte",
    linkArquitetura: "https://api.softeum.com.br/arquitetura",
    linkDocumentacaoApi: "https://api.softeum.com.br/docs",
  };
}
