import { Document, Page, Text, View, Link, renderToBuffer } from "@react-pdf/renderer";
import { estilos, CORES } from "./estilos";
import type { DadosProposta } from "./dados";

function Capa({ d }: { d: DadosProposta }) {
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={estilos.capa}>
        <View>
          <Text style={estilos.capaMarca}>SOFTEUM</Text>
          <Text style={estilos.capaTag}>Automação inteligente de pedidos</Text>
        </View>
        <View>
          <Text style={estilos.capaTitulo}>Proposta Técnica</Text>
          <Text style={estilos.capaCliente}>{d.clienteRazaoSocial}</Text>
          <Text style={estilos.capaMeta}>Proposta {d.numeroProposta} · Versão {d.versao}</Text>
          <Text style={estilos.capaMeta}>{d.cidade}, {d.data}</Text>
        </View>
        <Text style={estilos.capaRodape}>Softeum Tecnologia · CNPJ {d.softeumCnpj}</Text>
      </View>
    </Page>
  );
}

function Rodape({ d }: { d: DadosProposta }) {
  return (
    <View style={estilos.rodape} fixed>
      <Text>Softeum · CNPJ {d.softeumCnpj} · Proposta Técnica {d.numeroProposta} v{d.versao}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Item({ t }: { t: string }) {
  return <Text style={estilos.li}>• {t}</Text>;
}

function LinkAzul({ url, label }: { url: string; label?: string }) {
  return (
    <Link src={url} style={estilos.link}>
      {label || url}
    </Link>
  );
}

function Corpo({ d }: { d: DadosProposta }) {
  return (
    <Page size="A4" style={estilos.page}>
      <Text style={estilos.h1}>1. VISÃO GERAL DO PRODUTO</Text>
      <Text style={estilos.p}>
        A Softeum é uma plataforma SaaS multi-tenant que automatiza o recebimento e o
        processamento de pedidos de compra. A solução monitora as caixas de e-mail e os números
        de WhatsApp cadastrados de cada empresa cliente, extrai automaticamente os pedidos de
        arquivos (PDF e imagem) e de mensagens de texto, aplica um de-para inteligente contra
        o catálogo do próprio cliente e envia o pedido normalizado ao ERP, de forma idempotente.
      </Text>
      <Item t="Pedido em PDF — documentos nativos ou escaneados; cada página é lida e processada automaticamente." />
      <Item t="Pedido em imagem — fotos ou prints de pedidos, com pré-processamento e OCR quando a qualidade exige." />
      <Item t="Pedido no corpo do e-mail — texto livre extraído e estruturado automaticamente." />
      <Item t="Pedido por WhatsApp — mensagens tratadas por um atendente automatizado que recebe o pedido e confirma os dados antes de finalizar." />
      <Item t="Anexos de e-mail — armazenados em bucket privado com deduplicação por hash; o pedido guarda apenas a referência ao arquivo." />

      <Text style={estilos.h1}>2. MODELO DE OFERTA</Text>
      <Text style={estilos.p}>A plataforma é ofertada por módulos, contratados de forma independente:</Text>
      <Item t="Módulo E-mail — monitora caixas Gmail (API + Pub/Sub) e Outlook (Microsoft Graph), sem polling. Ingestão por webhook com varredura de reconciliação de garantia." />
      <Item t="Módulo WhatsApp — número oficial via WhatsApp Business Cloud API (Meta), com atendente automatizado que recebe pedidos, tira dúvidas e sempre confirma o pedido com os dados cadastrais antes de finalizar." />

      <Text style={estilos.h1}>3. MODELO OPERACIONAL</Text>
      <Text style={estilos.p}>O fluxo de ponta a ponta é idempotente — reprocessar uma mensagem nunca duplica o pedido no ERP:</Text>
      <Item t="Ingestão — o e-mail/WhatsApp de um remetente cadastrado dispara um webhook, tratado por uma Edge Function que deduplica (message-id / wamid) e enfileira." />
      <Item t="Reconciliação — a cada poucos minutos, uma varredura confere a caixa no provedor e recupera qualquer mensagem que o webhook tenha perdido." />
      <Item t="Extração — o worker lê o documento e extrai itens, cliente, condições e datas em formato estruturado e validado." />
      <Item t="De-para — cada item é casado contra o catálogo por múltiplas camadas: código/EAN/alias exato, fuzzy e semântico, garantindo precisão no match." />
      <Item t="Revisão — itens com confiança abaixo do limite vão para revisão humana no painel; acima do limite seguem automaticamente." />
      <Item t="Envio ao ERP — o pedido normalizado é entregue ao ERP (pull pela API ou push no endpoint), de forma idempotente." />
      <Item t="Notificação — o comprador recebe e-mails automáticos: pedido recebido e, depois, aprovado ou reprovado com o motivo." />

      <Text style={estilos.h1}>4. ARQUITETURA E INFRAESTRUTURA</Text>
      <Text style={estilos.p}>A documentação completa da arquitetura da plataforma está disponível em:</Text>
      <LinkAzul url={d.linkArquitetura} />
      <View style={estilos.tabela}>
        <View style={estilos.linhaHeader}>
          <Text style={estilos.celulaHeader}>Camada</Text>
          <Text style={[estilos.celulaHeader, { flex: 2, borderRightWidth: 0 }]}>Tecnologia</Text>
        </View>
        {[
          ["Frontend", "React + TypeScript (aplicação única com rotas por perfil)"],
          ["Auth · Banco · Storage · Realtime", "Supabase (PostgreSQL) com RLS obrigatório em todas as tabelas"],
          ["Fila durável", "Filas nativas do Postgres (pgmq), uma por etapa, particionadas por cliente"],
          ["Workers de processamento", "Node/TypeScript containerizados, escala horizontal, idempotentes"],
          ["Ingestão leve", "Edge Functions (apenas webhooks e enfileiramento)"],
          ["Busca semântica", "pgvector (embeddings do catálogo) no próprio Postgres"],
          ["Extração de documentos", "Tecnologia proprietária de extração multimodal"],
          ["Cobrança", "Asaas (Pix, boleto e cartão)"],
        ].map(([a, b]) => (
          <View style={estilos.linha} key={a}>
            <Text style={estilos.celula}>{a}</Text>
            <Text style={[estilos.celula, { flex: 2, borderRightWidth: 0 }]}>{b}</Text>
          </View>
        ))}
      </View>

      <Text style={estilos.h1}>5. MÓDULOS DO PRODUTO</Text>
      <Item t="Painel do Cliente — pedidos por status, dashboard, catálogo, clientes finais, de-para, configurações e inboxes." />
      <Item t="Motor de Extração Automatizada — leitura multimodal de PDF/imagem/texto com saída estruturada e validada." />
      <Item t="Camada de Layout Aprendido — aprende a receita de cada layout de documento e passa a lê-lo automaticamente." />
      <Item t="Motor de De-para Inteligente — casamento por múltiplas camadas contra o catálogo, com aprendizado contínuo." />
      <Item t="API aberta e documentada — o cliente conecta seu ERP consumindo a API REST com chave própria, gerada no painel." />
      <Item t="Conector Generic REST/Webhook — envio automático do pedido ao endpoint do cliente (push), como alternativa à API." />
      <Item t="Atendente automatizado de WhatsApp — atendimento ativo com guardrails e confirmação obrigatória do pedido." />
      <Item t="Monitoramento e Eventos — registro de erros e sinal de vida dos processos, visível no painel administrativo." />

      <Text style={estilos.h1}>6. INTEGRAÇÃO COM ERP</Text>
      <Text style={estilos.p}>
        A Softeum oferece uma API aberta e documentada para que o cliente integre o próprio ERP.
        O Admin de TI gera a chave de API diretamente no painel e utiliza a documentação disponível
        para configurar a integração. Alternativamente, a Softeum pode entregar o pedido diretamente
        no endpoint do ERP do cliente (push/webhook). Os dois modos são excludentes.
      </Text>
      <Text style={estilos.p}>Documentação da API:</Text>
      <LinkAzul url={d.linkDocumentacaoApi} />

      <Text style={estilos.h1}>7. SEGURANÇA E MULTI-TENANCY</Text>
      <Item t="Isolamento por cliente — tenant_id em toda tabela; RLS filtra por cliente em leitura e escrita." />
      <Item t="Credenciais criptografadas — tokens de ERP e OAuth criptografados em repouso; nunca em texto puro nem no navegador." />
      <Item t="Segredos apenas no backend — chaves vivem nos workers e Edge Functions." />
      <Item t="Idempotência — reprocessamentos e retentativas nunca duplicam pedidos no ERP." />
      <Item t="LGPD — dados tratados conforme a legislação aplicável, com isolamento por cliente e criptografia." />

      <Text style={estilos.h1}>8. REQUISITOS DO CLIENTE</Text>
      <Text style={estilos.p}>A implantação é colaborativa. Para o sucesso do projeto, o contratante deverá:</Text>
      <Item t="Definir um ponto focal para a execução do projeto de implantação." />
      <Item t="Indicar as caixas de e-mail e/ou o número de WhatsApp a monitorar e conceder as autorizações (OAuth / credenciais)." />
      <Item t="Fornecer o catálogo de produtos (SKU, nome, unidade, preço, EAN e aliases) para importação." />
      <Item t="Fornecer o cadastro dos clientes finais." />
      <Item t="Disponibilizar o acesso e a documentação da API do ERP (pull) ou o endpoint e as credenciais (push)." />
      <Item t="Programar um período de testes para validação da extração, do de-para e da integração." />

      <Text style={estilos.h1}>9. SUPORTE</Text>
      <Text style={estilos.p}>
        O cliente abre e acompanha chamados pelo site institucional, aba de suporte, com o mesmo
        e-mail e senha da plataforma. Qualquer usuário cadastrado tem acesso, sem distinção de
        perfil. Cada chamado recebe protocolo próprio, prioridade (P1/P2/P3) e permite anexos.
      </Text>
      <Text style={estilos.p}>Acesse o suporte em:</Text>
      <LinkAzul url={d.linkSuporte} />

      <Rodape d={d} />
    </Page>
  );
}

export function PropostaTecnicaDocument({ d }: { d: DadosProposta }) {
  return (
    <Document title={`Proposta Técnica ${d.numeroProposta}`}>
      <Capa d={d} />
      <Corpo d={d} />
    </Document>
  );
}

export async function renderPropostaTecnicaPdf(d: DadosProposta): Promise<Buffer> {
  return renderToBuffer(<PropostaTecnicaDocument d={d} />);
}
