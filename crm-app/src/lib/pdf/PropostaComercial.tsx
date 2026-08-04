import { Document, Page, Text, View, Link, renderToBuffer } from "@react-pdf/renderer";
import { estilos } from "./estilos";
import { formatarBRL, type DadosProposta } from "./dados";

function Capa({ d }: { d: DadosProposta }) {
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={estilos.capa}>
        <View>
          <Text style={estilos.capaMarca}>SOFTEUM</Text>
          <Text style={estilos.capaTag}>Automacao inteligente de pedidos</Text>
        </View>
        <View>
          <Text style={estilos.capaTitulo}>Proposta Comercial</Text>
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
      <Text style={estilos.h1}>1. INTRODUCAO</Text>
      <Text style={estilos.p}>
        Este documento apresenta os valores totais e condicoes comerciais a serem investidos na
        contratacao da plataforma Softeum — solucao de automacao do recebimento e processamento
        de pedidos de compra por e-mail e WhatsApp, com extracao automatizada e integracao ao
        ERP. O detalhamento de escopo da contratacao esta descrito na Proposta Tecnica. Ao dar
        aceite a presente Proposta Comercial, {d.clienteRazaoSocial} aceita todos os termos da
        referida Proposta Tecnica.
      </Text>

      <Text style={estilos.h1}>2. INVESTIMENTO</Text>
      <Text style={estilos.h2}>2.1 Investimento mensal (recorrente)</Text>
      <View style={estilos.tabela}>
        <LinhaTabela header item="Item" unidade="Unidade" quantidade="Qtd" valor="Valor Total" />
        <LinhaTabela item={`Plano ${d.planoNome} — ate ${d.tetoPedidos.toLocaleString("pt-BR")} pedidos/mes`} unidade="Mensal" quantidade="1" valor={formatarBRL(d.valorMensalTotal)} />
        <LinhaTabela item="Total mensal" unidade="" quantidade="" valor={formatarBRL(d.valorMensalTotal)} />
      </View>
      <Text style={estilos.small}>
        * O excedente de pedidos processados alem da franquia contratada sera cobrado a {formatarBRL(d.valorExcedentePedido)} por
        pedido processado adicional, apurado e faturado mensalmente.
      </Text>

      {d.valorSetupTotal > 0 && (
        <>
          <Text style={estilos.h2}>2.2 Investimento unico (setup)</Text>
          <View style={estilos.tabela}>
            <LinhaTabela header item="Item" unidade="Unidade" quantidade="Qtd" valor="Valor Total" />
            <LinhaTabela item="Setup de implantacao" unidade="Unico" quantidade="1" valor={formatarBRL(d.valorSetupTotal)} />
            <LinhaTabela item="Total unico" unidade="" quantidade="" valor={formatarBRL(d.valorSetupTotal)} />
          </View>
          <Text style={estilos.small}>
            * Investimento cobrado uma unica vez, {d.condicaoSetup}, com vencimento em {d.vencimentoSetup}.
          </Text>
        </>
      )}

      <Text style={estilos.h1}>3. CONDICOES COMERCIAIS</Text>
      <Text style={estilos.li}>a) Todos os valores apresentados nesta proposta ja estao acrescidos de impostos, taxas, contribuicoes e quaisquer outros tributos incidentes.</Text>
      <Text style={estilos.li}>b) A presente contratacao entra em vigor na data de sua assinatura ou da sua aceitacao, inclusive por meio de emissao de pedido de compra por parte de {d.clienteRazaoSocial}.</Text>
      <Text style={estilos.li}>c) O prazo de contratacao e de {d.prazoContratoMeses} meses. As Partes poderao rescindir esta contratacao sem justa causa, a qualquer tempo, bastando informar a outra parte por escrito com {d.diasAviso} dias de antecedencia.</Text>
      <Text style={estilos.li}>d) O Investimento Mensal (item 2.1) sera cobrado a partir do momento em que for liberado o acesso a plataforma, com prazo de vencimento de {d.vencimentoMensal} via {d.formaPagamento}, a contar da data de emissao da nota fiscal.</Text>
      <Text style={estilos.li}>e) O Investimento Unico de setup (item 2.2) sera cobrado {d.condicaoSetup}, com vencimento em {d.vencimentoSetup}, via {d.formaPagamento}.</Text>
      <Text style={estilos.li}>f) A cobranca dos investimentos acordados na presente proposta ocorrera independentemente da formalizacao ou aprovacao de outros documentos.</Text>
      <Text style={estilos.li}>g) Os valores recorrentes serao reajustados anualmente pelo indice {d.indiceReajuste}, ou o que vier a substitui-lo.</Text>
      <Text style={estilos.li}>h) O excedente de pedidos processados alem da franquia contratada sera cobrado a {formatarBRL(d.valorExcedentePedido)} por pedido processado adicional, apurado e faturado mensalmente junto com a mensalidade.</Text>

      <Text style={estilos.h1}>4. CONDICOES GERAIS</Text>
      <Text style={estilos.li}>a) As condicoes desta proposta sao validas para aceite em ate {d.validadeDias} dias apos a data de emissao. A partir de sua expiracao, as condicoes poderao ser revistas.</Text>
      <Text style={estilos.li}>b) {d.clienteRazaoSocial} declara que todos os dados cadastrais contidos nesta Proposta Comercial sao verdadeiros e validos, tendo ciencia de que a Softeum procedera com o faturamento nos termos e condicoes indicados nesta Proposta Comercial.</Text>
      <Text style={estilos.li}>c) O contratante e responsavel por manter validas as credenciais de acesso as caixas de e-mail, aos numeros de WhatsApp e ao ERP, incluindo as autorizacoes OAuth necessarias a ingestao sem interrupcao.</Text>
      <Text style={estilos.li}>d) A integracao ao ERP e realizada pelo contratante no modelo self-service, consumindo a API documentada e a chave gerada no proprio painel (Admin de TI); eventuais desenvolvimentos no ERP sao de responsabilidade de {d.clienteRazaoSocial}. Alternativamente, a Softeum pode entregar o pedido diretamente no endpoint do ERP (push/webhook), conforme configuracao. Os dois modos sao excludentes.</Text>
      <Text style={estilos.li}>e) A Softeum extrai, normaliza e entrega os pedidos; nenhum item de pedido e criado fora do catalogo cadastrado pelo contratante. O de-para valida de forma deterministica contra o catalogo.</Text>
      <Text style={estilos.li}>f) Protecao de dados (LGPD): os dados sao tratados conforme a legislacao aplicavel, com isolamento por cliente (tenant) e criptografia das credenciais em repouso. Segredos e chaves nunca sao expostos ao navegador.</Text>
      <Text style={estilos.li}>g) A presente documentacao e de propriedade da Softeum, tem carater confidencial e nao podera ser objeto de reproducao total ou parcial, nem de cessao de uso, sem o consentimento previo por escrito da Softeum.</Text>
      <Text style={estilos.li}>h) Nivel de servico e disponibilidade conforme {d.sla}. Indisponibilidades de provedores de terceiros (Gmail, Microsoft, Meta, ERP do cliente e gateways de pagamento) nao constituem indisponibilidade da Softeum.</Text>
      <Text style={estilos.li}>i) Duvidas, chamados e suporte tecnico:</Text>
      <LinkAzul url={d.linkSuporte} />

      <Text style={estilos.h1}>5. ACEITE DA PROPOSTA</Text>
      <Text style={estilos.p}>
        Aceitamos as condicoes da proposta comercial {d.numeroProposta} versao {d.versao} da
        Softeum e estamos de acordo com as condicoes, premissas do projeto, investimentos e
        custos requeridos para a plena execucao desta contratacao.
      </Text>
      <Text style={estilos.p}>
        Nos termos do art. 10, par. 2 da Medida Provisoria no 2.200-2/2001, as Partes, neste ato,
        admitem como valida e aceita esta Proposta Comercial assinada eletronicamente,
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

      <Text style={[estilos.h2, { marginTop: 10 }]}>Informacoes para faturamento</Text>
      <View style={estilos.tabela}>
        <View style={estilos.linha}><Text style={estilos.celula}>Razao Social</Text><Text style={[estilos.celula, { borderRightWidth: 0 }]}>{d.clienteRazaoSocial}</Text></View>
        <View style={estilos.linha}><Text style={estilos.celula}>CNPJ</Text><Text style={[estilos.celula, { borderRightWidth: 0 }]}>{d.clienteCnpj}</Text></View>
        <View style={estilos.linha}><Text style={estilos.celula}>Email para faturamento</Text><Text style={[estilos.celula, { borderRightWidth: 0, color: "#94a3b8" }]}>Preenchido na assinatura</Text></View>
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
