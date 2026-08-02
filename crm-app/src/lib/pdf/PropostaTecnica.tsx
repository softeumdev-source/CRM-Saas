import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { estilos } from "./estilos";
import type { DadosProposta } from "./dados";

function Capa({ d }: { d: DadosProposta }) {
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={estilos.capa}>
        <View>
          <Text style={estilos.capaMarca}>SOFTEUM</Text>
          <Text style={estilos.capaTag}>Automacao de pedidos com IA</Text>
        </View>
        <View>
          <Text style={estilos.capaTitulo}>Proposta Tecnica</Text>
          <Text style={estilos.capaCliente}>{d.clienteRazaoSocial}</Text>
          <Text style={estilos.capaMeta}>Proposta {d.numeroProposta} · Versao {d.versao}</Text>
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
      <Text>Softeum · CNPJ {d.softeumCnpj} · Proposta Tecnica {d.numeroProposta} v{d.versao}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Item({ t }: { t: string }) {
  return <Text style={estilos.li}>• {t}</Text>;
}

function Corpo({ d }: { d: DadosProposta }) {
  return (
    <Page size="A4" style={estilos.page}>
      <Text style={estilos.h1}>1. VISAO GERAL DO PRODUTO</Text>
      <Text style={estilos.p}>
        A Softeum e uma plataforma SaaS multi-tenant que automatiza o recebimento e o
        processamento de pedidos de compra. A solucao monitora as caixas de e-mail e os numeros
        de WhatsApp cadastrados de cada empresa cliente, usa inteligencia artificial para
        extrair os pedidos de arquivos (PDF e imagem) e de mensagens de texto, aplica um
        de-para inteligente contra o catalogo do proprio cliente e envia o pedido normalizado
        ao ERP, de forma idempotente.
      </Text>
      <Item t="Pedido em PDF — documentos nativos ou escaneados; cada pagina e lida diretamente pela IA multimodal." />
      <Item t="Pedido em imagem — fotos ou prints de pedidos, com pre-processamento/OCR quando a qualidade exige." />
      <Item t="Pedido no corpo do e-mail — texto livre extraido e estruturado." />
      <Item t="Pedido por WhatsApp — mensagens tratadas por um agente de IA que tira o pedido e confirma os dados antes de finalizar." />
      <Item t="Anexos de e-mail — armazenados em bucket privado com deduplicacao por hash; o pedido guarda apenas a referencia ao arquivo." />

      <Text style={estilos.h1}>2. MODELO DE OFERTA</Text>
      <Text style={estilos.p}>A plataforma e ofertada por modulos, contratados de forma independente:</Text>
      <Item t="Modulo E-mail — monitora caixas Gmail (API + Pub/Sub) e Outlook (Microsoft Graph), sem polling. Ingestao por webhook com varredura de reconciliacao de garantia." />
      <Item t="Modulo WhatsApp — numero oficial via WhatsApp Business Cloud API (Meta), com um agente de IA que tira pedidos, tira duvidas e sempre confirma o pedido com os dados cadastrais antes de finalizar." />

      <Text style={estilos.h1}>3. MODELO OPERACIONAL</Text>
      <Text style={estilos.p}>O fluxo de ponta a ponta e idempotente — reprocessar uma mensagem nunca duplica o pedido no ERP:</Text>
      <Item t="Ingestao — o e-mail/WhatsApp de um remetente cadastrado dispara um webhook, tratado por uma Edge Function que deduplica (message-id / wamid) e enfileira." />
      <Item t="Reconciliacao — a cada poucos minutos, uma varredura confere a caixa no provedor e recupera qualquer mensagem que o webhook tenha perdido." />
      <Item t="Extracao por IA — o worker le o documento e extrai itens, cliente, condicoes e datas em JSON estruturado, validado por schema." />
      <Item t="De-para — cada item e casado contra o catalogo por camadas: codigo/EAN/alias exato, fuzzy, semantico e desambiguacao por LLM entre candidatos do catalogo." />
      <Item t="Revisao — itens com confianca abaixo do limite vao para revisao humana no painel; acima do limite seguem automaticamente." />
      <Item t="Envio ao ERP — o pedido normalizado e entregue ao ERP (pull pela API ou push no endpoint), de forma idempotente." />
      <Item t="Notificacao — o comprador recebe e-mails automaticos: pedido recebido e, depois, aprovado ou reprovado com o motivo." />

      <Text style={estilos.h1}>4. ARQUITETURA E INFRAESTRUTURA</Text>
      <View style={estilos.tabela}>
        <View style={estilos.linhaHeader}>
          <Text style={estilos.celulaHeader}>Camada</Text>
          <Text style={[estilos.celulaHeader, { flex: 2, borderRightWidth: 0 }]}>Tecnologia</Text>
        </View>
        {[
          ["Frontend", "React + TypeScript (aplicacao unica com rotas por perfil)"],
          ["Auth · Banco · Storage · Realtime", "Supabase (PostgreSQL) com RLS obrigatorio em todas as tabelas"],
          ["Fila duravel", "Filas nativas do Postgres (pgmq), uma por etapa, particionadas por cliente"],
          ["Workers de processamento", "Node/TypeScript containerizados, escala horizontal, idempotentes"],
          ["Ingestao leve", "Edge Functions (apenas webhooks e enfileiramento)"],
          ["Busca semantica", "pgvector (embeddings do catalogo) no proprio Postgres"],
          ["IA de extracao", "Modelos multimodais de ponta, com fallback entre provedores"],
          ["Cobranca", "Asaas (Pix, boleto e cartao)"],
        ].map(([a, b]) => (
          <View style={estilos.linha} key={a}>
            <Text style={estilos.celula}>{a}</Text>
            <Text style={[estilos.celula, { flex: 2, borderRightWidth: 0 }]}>{b}</Text>
          </View>
        ))}
      </View>

      <Text style={estilos.h1}>5. MODULOS DO PRODUTO</Text>
      <Item t="Painel do Cliente — pedidos por status, dashboard, catalogo, clientes finais, de-para, configuracoes e inboxes." />
      <Item t="Motor de Extracao por IA — leitura multimodal de PDF/imagem/texto com saida estruturada validada." />
      <Item t="Camada de Layout Aprendido — aprende a receita de cada layout e passa a le-lo sem IA, a custo zero." />
      <Item t="Motor de De-para Inteligente — casamento por multiplas camadas contra o catalogo, com aprendizado continuo." />
      <Item t="Conector de ERP — API self-service documentada (pull) e envio Generic REST/Webhook (push)." />
      <Item t="Agente de WhatsApp — atendimento ativo com guardrails e confirmacao obrigatoria do pedido." />
      <Item t="Monitoramento e Eventos — registro de erros, custo de IA e sinal de vida dos processos." />

      <Text style={estilos.h1}>6. SEGURANCA E MULTI-TENANCY</Text>
      <Item t="Isolamento por cliente — tenant_id em toda tabela; RLS filtra por cliente em leitura e escrita." />
      <Item t="Credenciais criptografadas — tokens de ERP e OAuth criptografados em repouso; nunca em texto puro nem no navegador." />
      <Item t="Segredos apenas no backend — chaves vivem nos workers e Edge Functions." />
      <Item t="Idempotencia — reprocessamentos e retentativas nunca duplicam pedidos no ERP." />

      <Text style={estilos.h1}>7. REQUISITOS DO CLIENTE</Text>
      <Text style={estilos.p}>A implantacao e colaborativa. Para o sucesso do projeto, o contratante devera:</Text>
      <Item t="Definir um ponto focal para a execucao do projeto de implantacao." />
      <Item t="Indicar as caixas de e-mail e/ou o numero de WhatsApp a monitorar e conceder as autorizacoes (OAuth / credenciais)." />
      <Item t="Fornecer o catalogo de produtos (SKU, nome, unidade, preco, EAN e aliases) para importacao." />
      <Item t="Fornecer o cadastro dos clientes finais." />
      <Item t="Disponibilizar o acesso e a documentacao da API do ERP (pull) ou o endpoint e as credenciais (push)." />
      <Item t="Programar um periodo de testes para validacao da extracao, do de-para e da integracao." />

      <Text style={estilos.h1}>8. SUPORTE</Text>
      <Text style={estilos.p}>
        O cliente abre e acompanha chamados pelo site institucional (softeum.com.br, aba de
        suporte), com o mesmo e-mail e senha da plataforma: {d.linkSuporte}. Qualquer usuario
        cadastrado tem acesso, sem distincao de perfil. Cada chamado recebe protocolo proprio,
        prioridade (P1/P2/P3) e permite anexos.
      </Text>

      <Rodape d={d} />
    </Page>
  );
}

export function PropostaTecnicaDocument({ d }: { d: DadosProposta }) {
  return (
    <Document title={`Proposta Tecnica ${d.numeroProposta}`}>
      <Capa d={d} />
      <Corpo d={d} />
    </Document>
  );
}

export async function renderPropostaTecnicaPdf(d: DadosProposta): Promise<Buffer> {
  return renderToBuffer(<PropostaTecnicaDocument d={d} />);
}
