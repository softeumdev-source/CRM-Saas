import { Document, Page, Text, View, Link, renderToBuffer } from "@react-pdf/renderer";
import { estilos } from "./estilos";
import { formatarBRL, type DadosProposta } from "./dados";

function Capa({ d }: { d: DadosProposta }) {
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={estilos.capa}>
        <View>
          <Text style={estilos.capaMarca}>SOFTEUM</Text>
          <Text style={estilos.capaTag}>Automação inteligente de pedidos</Text>
        </View>
        <View>
          <Text style={estilos.capaTitulo}>Proposta Comercial</Text>
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
      <Text>Softeum · CNPJ {d.softeumCnpj} · Proposta {d.numeroProposta} v{d.versao}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function LinhaTabela({ item, unidade, quantidade, valor, header }: { item: string; unidade: string; quantidade: string; valor: string; header?: boolean }) {
  const celula = header ? estilos.celulaHeader : estilos.celula;
  return (
    <View style={header ? estilos.linhaHeader : estilos.linha}>
      <Text style={[celula, { flex: 3 }]}>{item}</Text>
      <Text style={[celula, { flex: 1 }]}>{unidade}</Text>
      <Text style={[celula, { flex: 1 }]}>{quantidade}</Text>
      <Text style={[celula, { flex: 1.3, borderRightWidth: 0 }]}>{valor}</Text>
    </View>
  );
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
      <Text style={estilos.h1}>1. INTRODUÇÃO</Text>
      <Text style={estilos.p}>
        Este documento apresenta os valores totais e condições comerciais a serem investidos na
        contratação da plataforma Softeum — solução de automação do recebimento e processamento
        de pedidos de compra por e-mail e WhatsApp, com extração automatizada e integração ao
        ERP. O detalhamento de escopo da contratação está descrito na Proposta Técnica. Ao dar
        aceite à presente Proposta Comercial, {d.clienteRazaoSocial} aceita todos os termos da
        referida Proposta Técnica.
      </Text>

      <Text style={estilos.h1}>2. INVESTIMENTO</Text>
      <Text style={estilos.h2}>2.1 Investimento mensal (recorrente)</Text>
      <View style={estilos.tabela}>
        <LinhaTabela header item="Item" unidade="Unidade" quantidade="Qtd" valor="Valor Total" />
        <LinhaTabela item={`Plano ${d.planoNome} — até ${d.tetoPedidos.toLocaleString("pt-BR")} pedidos/mês`} unidade="Mensal" quantidade="1" valor={formatarBRL(d.valorMensalTotal)} />
        <LinhaTabela item="Total mensal" unidade="" quantidade="" valor={formatarBRL(d.valorMensalTotal)} />
      </View>
      <Text style={estilos.small}>
        * O excedente de pedidos processados além da franquia contratada será cobrado a {formatarBRL(d.valorExcedentePedido)} por
        pedido processado adicional, apurado e faturado mensalmente.
      </Text>

      {d.valorSetupTotal > 0 && (
        <>
          <Text style={estilos.h2}>2.2 Investimento único (setup)</Text>
          <View style={estilos.tabela}>
            <LinhaTabela header item="Item" unidade="Unidade" quantidade="Qtd" valor="Valor Total" />
            <LinhaTabela item="Setup de implantação" unidade="Único" quantidade="1" valor={formatarBRL(d.valorSetupTotal)} />
            <LinhaTabela item="Total único" unidade="" quantidade="" valor={formatarBRL(d.valorSetupTotal)} />
          </View>
          <Text style={estilos.small}>
            * Investimento cobrado uma única vez, {d.condicaoSetup}, com vencimento em {d.vencimentoSetup}.
          </Text>
        </>
      )}

      <Text style={estilos.h1}>3. CONDIÇÕES COMERCIAIS</Text>
      <Text style={estilos.li}>a) Todos os valores apresentados nesta proposta já estão acrescidos de impostos, taxas, contribuições e quaisquer outros tributos incidentes.</Text>
      <Text style={estilos.li}>b) A presente contratação entra em vigor na data de sua assinatura ou da sua aceitação, inclusive por meio de emissão de pedido de compra por parte de {d.clienteRazaoSocial}.</Text>
      <Text style={estilos.li}>c) O prazo de contratação é de {d.prazoContratoMeses} meses. As Partes poderão rescindir esta contratação sem justa causa, a qualquer tempo, bastando informar a outra parte por escrito com {d.diasAviso} dias de antecedência.</Text>
      <Text style={estilos.li}>d) O Investimento Mensal (item 2.1) será cobrado a partir do momento em que for liberado o acesso à plataforma, com prazo de vencimento de {d.vencimentoMensal} via {d.formaPagamento}, a contar da data de emissão da nota fiscal.</Text>
      <Text style={estilos.li}>e) O Investimento Único de setup (item 2.2) será cobrado {d.condicaoSetup}, com vencimento em {d.vencimentoSetup}, via {d.formaPagamento}.</Text>
      <Text style={estilos.li}>f) A cobrança dos investimentos acordados na presente proposta ocorrerá independentemente da formalização ou aprovação de outros documentos.</Text>
      <Text style={estilos.li}>g) Os valores recorrentes serão reajustados anualmente pelo índice {d.indiceReajuste}, ou o que vier a substituí-lo.</Text>
      <Text style={estilos.li}>h) O excedente de pedidos processados além da franquia contratada será cobrado a {formatarBRL(d.valorExcedentePedido)} por pedido processado adicional, apurado e faturado mensalmente junto com a mensalidade.</Text>

      <Text style={estilos.h1}>4. CONDIÇÕES GERAIS</Text>
      <Text style={estilos.li}>a) As condições desta proposta são válidas para aceite em até {d.validadeDias} dias após a data de emissão. A partir de sua expiração, as condições poderão ser revistas.</Text>
      <Text style={estilos.li}>b) {d.clienteRazaoSocial} declara que todos os dados cadastrais contidos nesta Proposta Comercial são verdadeiros e válidos, tendo ciência de que a Softeum procederá com o faturamento nos termos e condições indicados nesta Proposta Comercial.</Text>
      <Text style={estilos.li}>c) O contratante é responsável por manter válidas as credenciais de acesso às caixas de e-mail, aos números de WhatsApp e ao ERP, incluindo as autorizações OAuth necessárias à ingestão sem interrupção.</Text>
      <Text style={estilos.li}>d) A integração ao ERP é realizada pelo contratante no modelo self-service, consumindo a API documentada e a chave gerada no próprio painel (Admin de TI); eventuais desenvolvimentos no ERP são de responsabilidade de {d.clienteRazaoSocial}. Alternativamente, a Softeum pode entregar o pedido diretamente no endpoint do ERP (push/webhook), conforme configuração. Os dois modos são excludentes.</Text>
      <Text style={estilos.li}>e) A Softeum extrai, normaliza e entrega os pedidos; nenhum item de pedido é criado fora do catálogo cadastrado pelo contratante. O de-para valida de forma determinística contra o catálogo.</Text>
      <Text style={estilos.li}>f) Proteção de dados (LGPD): os dados são tratados conforme a legislação aplicável, com isolamento por cliente (tenant) e criptografia das credenciais em repouso. Segredos e chaves nunca são expostos ao navegador.</Text>
      <Text style={estilos.li}>g) A presente documentação é de propriedade da Softeum, tem caráter confidencial e não poderá ser objeto de reprodução total ou parcial, nem de cessão de uso, sem o consentimento prévio por escrito da Softeum.</Text>
      <Text style={estilos.li}>h) Nível de serviço e disponibilidade conforme {d.sla}. Indisponibilidades de provedores de terceiros (Gmail, Microsoft, Meta, ERP do cliente e gateways de pagamento) não constituem indisponibilidade da Softeum.</Text>
      <Text style={estilos.li}>i) Dúvidas, chamados e suporte técnico:</Text>
      <LinkAzul url={d.linkSuporte} />

      <Text style={estilos.h1}>5. ACEITE DA PROPOSTA</Text>
      <Text style={estilos.p}>
        Aceitamos as condições da proposta comercial {d.numeroProposta} versão {d.versao} da
        Softeum e estamos de acordo com as condições, premissas do projeto, investimentos e
        custos requeridos para a plena execução desta contratação.
      </Text>
      <Text style={estilos.p}>
        Nos termos do art. 10, §2º da Medida Provisória nº 2.200-2/2001, as Partes, neste ato,
        admitem como válida e aceita esta Proposta Comercial assinada eletronicamente,
        declarando a autenticidade da autoria das assinaturas e a integridade deste documento.
      </Text>
      <Text style={estilos.small}>{d.data}</Text>

      <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 28, marginBottom: 44 }}>
        <View style={estilos.assinaturaLinha}>
          <Text style={estilos.assinaturaNome}>{d.softeumAssinante}</Text>
          <Text style={estilos.assinaturaSub}>Softeum Tecnologia</Text>
        </View>
        <View style={estilos.assinaturaLinha}>
          <Text style={estilos.assinaturaNome}>{d.clienteAssinante}</Text>
          <Text style={estilos.assinaturaSub}>{d.clienteRazaoSocial}</Text>
        </View>
      </View>

      <Text style={[estilos.h2, { marginTop: 10 }]}>Informações para faturamento</Text>
      <View style={estilos.tabela}>
        <View style={estilos.linha}><Text style={estilos.celula}>Razão Social</Text><Text style={[estilos.celula, { borderRightWidth: 0 }]}>{d.clienteRazaoSocial}</Text></View>
        <View style={estilos.linha}><Text style={estilos.celula}>CNPJ</Text><Text style={[estilos.celula, { borderRightWidth: 0 }]}>{d.clienteCnpj}</Text></View>
        <View style={estilos.linha}><Text style={estilos.celula}>E-mail para faturamento</Text><Text style={[estilos.celula, { borderRightWidth: 0, color: "#94a3b8" }]}>Preenchido na assinatura</Text></View>
      </View>

      <Rodape d={d} />
    </Page>
  );
}

export function PropostaComercialDocument({ d }: { d: DadosProposta }) {
  return (
    <Document title={`Proposta Comercial ${d.numeroProposta}`}>
      <Capa d={d} />
      <Corpo d={d} />
    </Document>
  );
}

export async function renderPropostaComercialPdf(d: DadosProposta): Promise<Buffer> {
  return renderToBuffer(<PropostaComercialDocument d={d} />);
}
