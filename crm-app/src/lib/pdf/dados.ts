export interface DadosProposta {
  clienteRazaoSocial: string;
  clienteCnpj: string;
  numeroProposta: string;
  versao: number;
  cidade: string;
  data: string;

  planoNome: string;
  tetoPedidos: number;

  valorSetupPlataforma: number;
  valorSetupErp: number;
  valorSetupCatalogo: number;
  valorSetupTotal: number;

  valorPlataforma: number;
  valorUso: number;
  qtdCaixasEmail: number;
  valorModuloEmail: number;
  qtdNumerosWhatsapp: number;
  valorModuloWhatsapp: number;
  valorMensalTotal: number;
  valorExcedentePedido: number;

  emailMonitorado1?: string;
  providerEmail1?: string;
  emailMonitorado2?: string;
  providerEmail2?: string;
  whatsapp1?: string;
  erpNomeOuEndpoint?: string;
  erpModo?: string;

  prazoContratoMeses: number;
  diasAviso: number;
  vencimentoSetup: string;
  formaPagamento: string;
  condicaoSetup: string;
  vencimentoMensal: string;
  indiceReajuste: string;
  validadeDias: number;
  sla: string;

  softeumAssinante: string;
  softeumAssinanteEmail: string;
  softeumAssinante2: string;
  softeumCnpj: string;
  clienteAssinante: string;

  linkSuporte: string;

  emailFaturamento?: string;
}

export function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
