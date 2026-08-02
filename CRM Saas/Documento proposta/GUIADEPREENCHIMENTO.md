# Guia de preenchimento — Propostas Softeum

Os dois documentos (Comercial e Técnica) são **modelos**. Substitua os campos `{{...}}`
pelos dados de cada cliente antes de enviar. Dica: no Word/Google Docs use
**Localizar e substituir** (Ctrl+H) para trocar cada campo de uma vez.

> Os valores em `R$` estão como placeholders de propósito — nenhum preço foi inventado.
> Preencha com a sua tabela real quando definir os planos.

> **Atenção sobre a CAPA:** a capa é uma **imagem** (fundo navy). Os campos da capa
> (cliente, número, versão, cidade/data) estão “desenhados” nessa imagem e **não são
> editáveis** por Localizar/Substituir. Se quiser a capa personalizada por cliente,
> me peça que eu regenero a imagem com os dados preenchidos — é rápido. O restante do
> documento (páginas internas) é 100% texto editável.

## Comuns às duas propostas (capa e rodapé)
| Campo | O que preencher |
|---|---|
| `{{CLIENTE_RAZAO_SOCIAL}}` | Razão social do cliente |
| `{{NUMERO_PROPOSTA}}` | Número/código da proposta (ex.: 2026-0001) |
| `{{VERSAO}}` | Versão da proposta (ex.: 1) |
| `{{CIDADE}}` | Cidade de emissão |
| `{{DATA}}` | Data de emissão (ex.: 02 de agosto de 2026) |
| `{{SOFTEUM_CNPJ}}` | CNPJ da Softeum (rodapé) |

## Proposta Comercial — Investimento (§2)
| Campo | O que preencher |
|---|---|
| `{{VALOR_SETUP_PLATAFORMA}}` | Valor do setup de implantação |
| `{{VALOR_SETUP_ERP}}` | Valor do setup de integração com ERP |
| `{{VALOR_SETUP_CATALOGO}}` | Valor do setup de carga de catálogo/de-para |
| `{{VALOR_SETUP_TOTAL}}` | Total do setup |
| `{{PLANO}}` | Nome do plano contratado |
| `{{TETO_PEDIDOS}}` | Teto de pedidos/mês da faixa contratada |
| `{{VALOR_PLATAFORMA}}` | Mensalidade da plataforma |
| `{{QTD_CAIXAS}}` / `{{VALOR_MODULO_EMAIL}}` | Nº de caixas de e-mail e valor do módulo |
| `{{QTD_NUMEROS}}` / `{{VALOR_MODULO_WHATSAPP}}` | Nº de números WhatsApp e valor do módulo |
| `{{VALOR_USO}}` | Valor da mensalidade de uso (faixa contratada) |
| `{{VALOR_MENSAL_TOTAL}}` | Total mensal recorrente |

## Proposta Comercial — 2.3 Conexões
`{{EMAIL_MONITORADO_1}}`, `{{PROVIDER_EMAIL_1}}`, `{{EMAIL_MONITORADO_2}}`,
`{{PROVIDER_EMAIL_2}}` (Gmail/Outlook), `{{WHATSAPP_1}}`,
`{{ERP_NOME_OU_ENDPOINT}}`, `{{ERP_MODO}}` (ex.: pull / push).

## Proposta Comercial — Condições (§3 e §4)
| Campo | O que preencher |
|---|---|
| `{{PRAZO_CONTRATO}}` | Prazo em meses |
| `{{DIAS_AVISO}}` | Dias de aviso prévio para rescisão |
| `{{VENCIMENTO_SETUP}}` | Prazo de vencimento do setup (ex.: 15 DIAS APÓS EMISSÃO) |
| `{{FORMA_PAGAMENTO}}` | Forma de pagamento (Pix/boleto/cartão) |
| `{{CONDICAO_SETUP}}` | Subtítulo da parcela (ex.: 100% no aceite da proposta) |
| `{{DATA_PARCELA}}` / `{{VALOR_PARCELA}}` / `{{CONDICIONAL_PARCELA}}` | Linha da tabela de parcelas do setup |
| `{{VENCIMENTO_MENSAL}}` | Vencimento da mensalidade |
| `{{INDICE_REAJUSTE}}` | Índice de reajuste anual (ex.: IPCA) |
| `{{VALIDADE_DIAS}}` | Validade da proposta em dias |
| `{{SLA}}` | Nível de serviço/disponibilidade oferecido |

## Proposta Comercial — Aceite (§5)
`{{SOFTEUM_ASSINANTE}}`, `{{SOFTEUM_ASSINANTE_EMAIL}}`, `{{SOFTEUM_ASSINANTE_2}}`,
`{{CLIENTE_ASSINANTE}}`. A tabela “Informações para Faturamento” tem os rótulos fixos
(Razão Social, CNPJ, etc.) para o cliente preencher à mão/digitando.

## Proposta Comercial — Anexo I (faixas de cobrança)
`{{VU_FAIXA_1}}` a `{{VU_FAIXA_9}}` — valor unitário por pedido em cada faixa de volume.

## Proposta Técnica
Não tem valores a preencher além dos campos comuns da capa/rodapé. O conteúdo
descreve a plataforma Softeum conforme a arquitetura atual.
