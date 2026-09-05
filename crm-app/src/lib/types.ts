import type { Tables } from "@/lib/supabase/types";

/**
 * Um campo de assinatura posicionado no PDF.
 *
 * Mora AQUI, e nao no editor, por dois motivos medidos. Existiam DUAS
 * definicoes deste mesmo formato de fio — uma no `PdfFieldEditor` com
 * `tipo: "assinatura"` e outra dentro da rota `/api/assinar/[token]` com
 * `tipo: string` — e as duas descrevem o que e gravado em
 * `envelopes.campos_assinatura`. Uma escrevia, a outra lia, e nada casava as
 * duas: qualquer divergencia passaria batida.
 *
 * E porque `lib/` nao pode depender de componente: importar daqui um arquivo
 * com `"use client"` e a forma exata do erro que ja derrubou `/admin` e
 * `/negocios/[id]` em producao ("Attempted to call X from the server").
 * `import type` some na compilacao e nao quebra hoje, mas deixa a armadilha
 * armada para quem trocar por um import de valor.
 *
 * `type` e nao `interface`: a coluna e `Json`, e so alias de tipo ganha index
 * signature implicita.
 */
export type CampoAssinatura = {
  id: string;
  signatario_ordem: number;
  tipo: "assinatura";
  documento: "comercial" | "tecnica";
  pagina: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
};

export type Usuario = Tables<"usuarios">;
export type Contato = Tables<"contatos">;
export type EtapaPipeline = Tables<"etapas_pipeline">;
export type Negocio = Tables<"negocios">;
export type Atividade = Tables<"atividades">;
export type Notificacao = Tables<"notificacoes">;
export type Plano = Tables<"planos">;
export type Proposta = Tables<"propostas">;
export type Envelope = Tables<"envelopes">;
export type Signatario = Tables<"signatarios">;
export type Convite = Tables<"convites">;
export type SolicitacaoDesconto = Tables<"solicitacoes_desconto">;

/**
 * `solicitacoes_desconto` com os embeds que a aba de descontos do admin pede.
 *
 * Os embeds NÃO são a linha inteira: o `select` traz de `negocios` só `id` e
 * `titulo`, e de `contatos` só `nome` e `empresa`. Declarar `Negocio` aqui
 * seria mentir para quem lê o tipo — o campo existiria no editor e chegaria
 * `undefined` na tela.
 */
export type SolicitacaoDescontoComRelacoes = SolicitacaoDesconto & {
  negocio: { id: string; titulo: string; contato: { nome: string; empresa: string | null } | null } | null;
  vendedor: { nome: string } | null;
  plano: { nome: string } | null;
};

/** Os dois PDFs assinados que a rota devolve quando o envelope fecha. */
export type DocumentosAssinados = {
  comercial: string;
  tecnica: string;
};

/**
 * O que a RPC `obter_envelope_publico` devolve para quem abre o link de
 * assinatura sem estar logado.
 *
 * A função devolve `json` no banco, então o tipo gerado só sabe dizer `Json` —
 * e por isso a leitura precisa de um cast. O cast em si não é o problema; o
 * problema era ele ser `as any`, que não descreve NADA e deixava a página e a
 * rota lerem campos diferentes da mesma resposta sem ninguém notar. Aqui a
 * forma está escrita uma vez só, e as duas leem dela.
 *
 * Morava dentro de `src/app/assinar/[token]/page.tsx`, onde a rota não
 * alcançava.
 */
export type EnvelopePublico = {
  signatario: { id: string; nome: string; email: string; papel: string; status: string; ordem: number };
  envelope: { id: string; status: string; campos_assinatura: CampoAssinatura[] | null };
  outros_signatarios: { nome: string; papel: string; status: string }[];
  documentos_assinados?: DocumentosAssinados | null;
  proposta: {
    numero: string;
    versao: number;
    aviso_previo_dias: number;
    prazo_contrato_meses: number;
    valor_plataforma: number;
    valor_uso: number;
    valor_excedente_pedido: number;
  };
  negocio: { titulo: string };
  contato: { nome: string; empresa: string; cnpj: string; email: string };
  tenant: { nome: string; cor_primaria: string };
};

/** O que `registrar_assinatura` devolve. Também `json` no banco. */
export type AssinaturaRegistrada = {
  envelope_concluido?: boolean;
};

/**
 * `propostas` com o plano e os envelopes, como a aba de proposta do negócio
 * carrega (`*, plano:planos(*), envelopes(*, signatarios(*))`).
 *
 * Existia como `Record<string, unknown>` dentro do `NegocioDetailClient` — o
 * nome certo sobre forma nenhuma. Quem lia `proposta.envelopes[0].signatarios`
 * não tinha conferência de nada, e a página ainda precisava de um `as never`
 * para entregar os dados.
 */
export type PropostaComRelacoes = Proposta & {
  plano: Plano | null;
  envelopes: (Envelope & { signatarios: Signatario[] })[];
};

/**
 * `envelopes` com os signatários e a proposta inteira, como a tela de
 * assinaturas e a aba de proposta pedem.
 *
 * Aqui os embeds são `*` de verdade, então os tipos das linhas valem inteiros.
 */
export type EnvelopeComRelacoes = Envelope & {
  signatarios: Signatario[];
  proposta:
    | (Proposta & {
        negocio: (Negocio & { contato: Contato | null; responsavel: Usuario | null }) | null;
      })
    | null;
};

export type NegocioComRelacoes = Negocio & {
  contato: Contato | null;
  responsavel: Usuario | null;
  etapa: EtapaPipeline | null;
  atividades_pendentes?:
    | { id: string; titulo: string | null; tipo: string | null; data_agendada: string | null; concluida: boolean | null }[]
    | null;
};

/** Colunas de `atividades` que o card do pipeline precisa. */
export const SELECT_ATIVIDADES_CARD = "atividades_pendentes:atividades(id, titulo, tipo, data_agendada, concluida)";

/**
 * O `!negocios_responsavel_id_fkey` NÃO é enfeite, e eu já paguei por esquecê-lo
 * DUAS vezes nesta base.
 *
 * Existem duas chaves estrangeiras de `negocios` para `usuarios`:
 * `responsavel_id` e `vendedor_origem_id` (esta acrescentada quando a nutrição
 * passou a devolver o lead ao SDR). Com duas, o PostgREST RECUSA o embed por
 * ambiguidade — PGRST201 — em vez de escolher uma.
 *
 * O estrago é mudo e total: a consulta falha, `data` vem nulo, e o Kanban do
 * vendedor desenha ZERO cards. Nenhum erro no log do servidor, porque a recusa
 * é do PostgREST e o cliente a engole. Os 25 negócios continuam intactos no
 * banco o tempo todo — some só a tela.
 *
 * Foi exatamente assim que a Fase 3a derrubou o login (`tenants` ganhou uma FK
 * para `usuarios` e o layout parou de achar o usuário). Nomear a chave prende a
 * consulta ao caminho certo mesmo que apareça uma terceira FK amanhã.
 */
/** Select padrão de um negócio com tudo que o pipeline mostra. */
export const SELECT_NEGOCIO_COMPLETO = `*, contato:contatos(*), responsavel:usuarios!negocios_responsavel_id_fkey(*), etapa:etapas_pipeline(*), ${SELECT_ATIVIDADES_CARD}`;

/** Select da agenda: a atividade com o negócio e o contato para ligar/mandar mensagem. */
export const SELECT_AGENDA =
  "*, negocio:negocios(id, titulo, responsavel_id, contato:contatos(nome, empresa, telefone, whatsapp), responsavel:usuarios!negocios_responsavel_id_fkey(id, nome))";

/**
 * Abas da tela de negócio. Fica aqui, e não no componente, porque a page
 * (server) valida a query string.
 *
 * `ia` virou `conversa`: o id não batia com nada — o rótulo era "Mensagens", o
 * componente se chamava `CopilotoTab`, e não havia IA nenhuma dentro. Agora a
 * aba é a conversa com o cliente, e o nome diz isso.
 */
export type Aba = "geral" | "cadencia" | "proposta" | "email" | "sequencia";

const ABAS_VALIDAS: readonly string[] = ["geral", "cadencia", "proposta", "email", "sequencia"];

/**
 * Apelidos de abas que já existiram.
 *
 * `ia` foi o nome original da aba de mensagens. `conversa` foi o seguinte, e
 * empilhava os dois canais no mesmo lugar — depois e-mail e WhatsApp viraram
 * abas separadas, porque um inbox e um chat não têm a mesma forma.
 *
 * `whatsapp` era uma aba própria enquanto o envio saía pela API da Meta. Com o
 * envio passando a ser manual, pelo WhatsApp Web, ela deixou de ser um canal
 * com vida própria e virou parte da sequência — que é quem diz QUANDO mandar e
 * QUAL texto. O apelido continua valendo: a conversa está lá dentro.
 *
 * Todos continuam aceitos: existem em notificações já enviadas e em favoritos,
 * e quebrá-los levaria a pessoa para a aba errada sem explicação.
 */
const APELIDOS: Record<string, Aba> = { ia: "email", conversa: "email", whatsapp: "sequencia" };

export function normalizarAba(valor: string | undefined): Aba | undefined {
  if (valor && APELIDOS[valor]) return APELIDOS[valor];
  return ehAbaValida(valor) ? valor : undefined;
}

export function ehAbaValida(valor: string | undefined): valor is Aba {
  return valor !== undefined && ABAS_VALIDAS.includes(valor);
}

/**
 * Ganho/perda da etapa. `null` = etapa em aberto. É o que alimenta
 * `fechado_em` e, por consequência, as métricas de conversão.
 *
 * Lê a coluna `etapas_pipeline.resultado`. Antes era adivinhado pelo NOME
 * ("contém ganho" / "contém perdid") — uma coluna de SDR chamada
 * "Perdido/Descartado" fecharia negócios sozinha.
 *
 * O fallback pelo nome continua aqui só para etapas criadas antes da coluna
 * existir e que ainda não tenham sido classificadas.
 */
export function resultadoDaEtapa(
  etapa: { nome?: string | null; resultado?: string | null } | null | undefined,
): boolean | null {
  if (etapa?.resultado === "ganho") return true;
  if (etapa?.resultado === "perdido") return false;
  if (etapa?.resultado === null || etapa?.resultado === undefined) {
    const nome = (etapa?.nome || "").toLowerCase();
    if (nome.includes("ganho")) return true;
    if (nome.includes("perdid")) return false;
  }
  return null;
}

/** A etapa que encerra o negócio como perda — não mais "a de maior ordem". */
export function ehEtapaDePerda(etapa: { resultado?: string | null } | null | undefined): boolean {
  return etapa?.resultado === "perdido";
}

/**
 * Etapa que NÃO é um degrau do funil de conversão: a de perda e a de nutrição.
 *
 * Nutrição é um estacionamento, não um avanço — o lead fica lá esperando uma
 * data de retomada. Sem esta função ela entraria no funil como último degrau e
 * faria duas coisas erradas: criaria uma linha final sem sentido no gráfico e,
 * pior, todo negócio estacionado contaria como tendo ALCANÇADO "Fechado
 * (Ganho)", porque o funil mede avanço por `ordem` e a nutrição vem depois.
 */
export function foraDoFunil(
  etapa: { resultado?: string | null; funcao?: string | null } | null | undefined,
): boolean {
  return ehEtapaDePerda(etapa) || etapa?.funcao === "nutricao";
}

/**
 * Papeis de usuario. Espelha o CHECK do banco (usuarios_role_check e
 * convites_role_check). Existe para o papel nao ficar cravado como literal
 * espalhado pelo codigo.
 */
export const PAPEIS = ["admin", "vendedor", "sdr"] as const;
export type Papel = (typeof PAPEIS)[number];

export const ROTULO_PAPEL: Record<string, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  sdr: "SDR",
};

export const DESCRICAO_PAPEL: Record<string, string> = {
  admin: "Ve tudo, gere o time, os planos e as metas.",
  vendedor: "Trabalha o funil de vendas e fecha negocio.",
  sdr: "Prospecta, qualifica, agenda a reuniao e entrega ao vendedor.",
};

/**
 * Quem forma o time MEDIDO no painel: metas, ranking e funil por pessoa.
 *
 * O SDR nao entra: ele opera negocio, mas o funil dele e outro, com outras
 * metricas. Se entrasse aqui apareceria no ranking de vendas com zero, que e
 * pior do que nao aparecer. O admin tambem fica de fora — ele gere, nao e
 * medido —, mas os dois continuam podendo ser donos de negocio.
 */
export const PAPEIS_TIME: readonly string[] = ["vendedor"];

export function ehDoTime(usuario: { role?: string | null } | null | undefined): boolean {
  return !!usuario?.role && PAPEIS_TIME.includes(usuario.role);
}

/**
 * Quem pode ser dono de um negocio. Quem opera um funil especifico sai de
 * `pipelines.role_operador`, nao daqui: esta lista e so o "e gente que trabalha
 * negocio", usada quando nao ha um funil no contexto.
 */
export const PAPEIS_OPERADORES: readonly string[] = ["vendedor", "sdr"];

export function operaNegocios(usuario: { role?: string | null } | null | undefined): boolean {
  return !!usuario?.role && PAPEIS_OPERADORES.includes(usuario.role);
}

export function ehPapelValido(valor: unknown): valor is Papel {
  return typeof valor === "string" && (PAPEIS as readonly string[]).includes(valor);
}

export const PRIORIDADES = ["alta", "media", "baixa"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const AVISOS_PREVIOS_DIAS = [30, 60, 90, 120, 150, 180] as const;

export const TIPOS_ATIVIDADE = [
  "ligacao",
  "email",
  "demo",
  "proposta",
  "nota",
  "whatsapp",
  "reuniao",
  "mudanca_etapa",
] as const;
export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number];

export function formatarMoeda(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function iniciais(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
