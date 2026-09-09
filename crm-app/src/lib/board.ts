import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO } from "@/lib/types";
import { NENHUM_FUNIL, carregarEtapas, carregarPipeline, type ChavePipeline, type Pipeline } from "@/lib/pipelines";

/**
 * Quantos cards vêm de cada coluna. Com o volume de hoje (no máximo 5 por
 * etapa) nenhuma coluna chega perto disso, então o board carrega inteiro como
 * sempre carregou; o teto só passa a valer quando o SDR começar a encher as
 * colunas.
 */
export const CARDS_POR_ETAPA = 50;

/**
 * O andamento da cadência de UM negócio, do jeito que o card precisa ler.
 *
 * Existe porque o card do SDR não tinha como ser diferente do card do
 * vendedor: `negocios_do_board` é `setof negocios`, e passo da cadência e
 * próximo toque simplesmente não chegavam ao board. Não era um `if` dando
 * falso — era um dado que não estava lá.
 */
export type ResumoCadencia = {
  nome: string;
  /** 1-based, como `cadencia_passos.ordem`. */
  passoAtual: number;
  totalPassos: number;
  /** Canal do passo que vem a seguir: "email" | "whatsapp". */
  canalProximo: string | null;
  proximoEnvioEm: string | null;
  status: string;
};

/**
 * O que está parado esperando UMA PESSOA neste negócio.
 *
 * O card mostrava resposta do cliente, atraso e passo da cadência — e não
 * mostrava a única coisa que depende de um clique agora: o e-mail escrito,
 * pronto, esperando alguém aprovar. Ele ficava invisível até abrir o card, e
 * um lead com toque vencido parecia idêntico a um lead em dia.
 *
 * Os dois números são separados porque pedem verbos diferentes: o e-mail se
 * APROVA (o sistema manda em seguida) e o WhatsApp se MANDA (pelo Web, pela
 * pessoa). Somar os dois num "2 pendências" esconderia justamente o que fazer.
 */
export type ResumoDeAprovacao = {
  /** E-mails escritos, esperando "aprovar e enviar". */
  email: number;
  /** Toques de WhatsApp para a pessoa mandar pelo Web. */
  whatsapp: number;
};

/**
 * Há algo esperando uma pessoa neste negócio?
 *
 * Mora junto com o tipo, e não repetido em cada tela, porque o CARD e o FILTRO
 * do board têm que concordar: um card com a borda âmbar que o filtro "Precisa
 * aprovação" não encontra é pior do que não ter filtro nenhum.
 */
export function temPendencia(a: ResumoDeAprovacao | undefined): boolean {
  return !!a && a.email + a.whatsapp > 0;
}

export type DadosDoBoard = {
  pipeline: Pipeline | null;
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
  /** Quantos existem de verdade em cada etapa, para o cabeçalho não mentir. */
  totaisPorEtapa: Record<string, number>;
  porEtapa: number;
  responsaveis: Usuario[];
  usuarioAtual: Usuario;
  /** Vazio no board do vendedor: lá a cadência não é buscada nem mostrada. */
  cadencias: Record<string, ResumoCadencia>;
  /** O que espera um clique, nos DOIS boards — ver `buscarAprovacoesDoBoard`. */
  aprovacoes: Record<string, ResumoDeAprovacao>;
  /**
   * A etapa cuja coluna é substituída pelas quatro colunas de cadência. `null`
   * no board do vendedor — lá o board continua sendo etapa por etapa.
   */
  etapaCadenciaId: string | null;
  /** Quantos existem em cada coluna de cadência, no banco e não na tela. */
  totaisPorCadencia: Record<EstadoCadencia, number>;
};

/**
 * Carrega um board de kanban inteiro a partir da chave do funil.
 *
 * Existe para o board do vendedor e o do SDR serem literalmente a mesma
 * consulta com um argumento diferente — se fossem duas páginas escritas à mão,
 * uma delas acabaria esquecendo o recorte de funil, que é exatamente o bug que
 * a Fase 3.5 fechou.
 */
export async function carregarBoard(
  supabase: SupabaseClient<Database>,
  chave: ChavePipeline,
  porEtapa: number = CARDS_POR_ETAPA,
): Promise<DadosDoBoard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pipeline = await carregarPipeline(supabase, chave);

  // A cadência só é buscada no board que a mostra. O do vendedor não paga um
  // round-trip por um dado que ele não desenha.
  const mostraCadencia = chave === "sdr";

  // As etapas saíram do `Promise.all` porque as colunas de cadência precisam do
  // id da etapa de ENTRADA antes de consultar — e é uma ida a mais ao banco só
  // no servidor, num componente que já espera o funil.
  //
  // É a etapa de entrada, e não "todas as etapas", de propósito: a cadência
  // roda ali (216 dos 220 leads do funil), e é aquela coluna que está
  // impossível de trabalhar. Espalhar as colunas de cadência por todas as
  // etapas faria um lead sumir de "Nutrição / Futuro" para reaparecer numa
  // coluna de cadência — o card deixaria de estar onde a pessoa o pôs.
  const etapas = await carregarEtapas(supabase, pipeline?.id);
  const etapaCadenciaId = mostraCadencia
    ? (etapas.find((e) => e.funcao === "entrada")?.id ?? null)
    : null;

  const [
    { data: negocios },
    { data: totais },
    { data: responsaveis },
    { data: usuarioAtual },
    inscricoes,
    pendentes,
    porCadencia,
    totaisCadencia,
  ] =
    await Promise.all([
      // `negocios_do_board` devolve as N primeiras de CADA etapa numa consulta
      // só; como ela retorna `setof negocios`, o PostgREST embute contato,
      // responsável, etapa e atividades exatamente como no select direto.
      buscarNegociosDoBoard(supabase, pipeline?.id, porEtapa),
      contarPorEtapa(supabase, pipeline?.id),
      // Quem pode ser dono de um card DESTE funil sai do próprio funil
      // (`role_operador`): o board do vendedor oferece vendedores, o do SDR
      // oferece SDRs.
      supabase
        .from("usuarios")
        .select("*")
        .eq("role", pipeline?.role_operador ?? "vendedor")
        .eq("ativo", true),
      supabase.from("usuarios").select("*").eq("id", user!.id).single(),
      mostraCadencia ? buscarCadenciaDoBoard(supabase) : Promise.resolve({ data: null }),
      // Nos DOIS boards, diferente da cadência: um lead entregue ao vendedor
      // pode chegar lá com um toque ainda na fila, e some-lo do card do
      // vendedor seria escondê-lo de quem passou a ser dono dele.
      buscarAprovacoesDoBoard(supabase),
      // A fatia por COLUNA DE CADÊNCIA, e a contagem real de cada uma. Só no
      // board do SDR, e só quando o funil tem etapa de entrada.
      etapaCadenciaId
        ? buscarNegociosPorCadencia(supabase, pipeline?.id, etapaCadenciaId, porEtapa)
        : Promise.resolve({ data: null }),
      etapaCadenciaId
        ? contarPorCadencia(supabase, pipeline?.id, etapaCadenciaId)
        : Promise.resolve({ data: null }),
    ]);

  const totaisPorEtapa = Object.fromEntries((totais || []).map((t) => [t.etapa_id, Number(t.total)]));

  return {
    pipeline,
    // ─────────────────────────────────────────────────────────────────────
    // AQUI, E SÓ AQUI, AS COLUNAS SOMEM.
    //
    // O filtro é do KANBAN, não das etapas. `carregarEtapas` continua devolvendo
    // tudo, e precisa continuar: é ela que alimenta a prop `entrega` da tela do
    // negócio, o seletor de etapa dentro do card, a lista, o admin e o
    // "mover de funil". Filtrar lá derrubaria o botão "Agendar e entregar ao
    // vendedor" — a etapa de entrega do SDR é justamente uma das escondidas.
    //
    // A conta usa `totaisPorEtapa`, que é a contagem REAL da etapa, e não os
    // cards carregados: uma coluna com mais de `porEtapa` negócios, ou um
    // negócio filtrado na tela, não pode fazer a coluna sumir com card dentro.
    // ─────────────────────────────────────────────────────────────────────
    etapas: etapas.filter((e) => !e.oculta_quando_vazia || (totaisPorEtapa[e.id] ?? 0) > 0),
    negocios: unirFatias(
      (negocios as unknown as NegocioComRelacoes[]) || [],
      porCadencia.data as unknown as NegocioComRelacoes[] | null,
      etapaCadenciaId,
    ),
    totaisPorEtapa,
    porEtapa,
    responsaveis: responsaveis || [],
    usuarioAtual: usuarioAtual!,
    cadencias: mapaDeCadencias(inscricoes.data),
    aprovacoes: mapaDeAprovacoes(pendentes.data),
    etapaCadenciaId,
    totaisPorCadencia: mapaDeTotaisPorCadencia(
      totaisCadencia.data as { estado: string; total: number }[] | null,
    ),
  };
}

/**
 * Junta as DUAS fatias que o board do SDR carrega.
 *
 * `negocios_do_board` traz as N primeiras de cada ETAPA — é ela que enche
 * "Qualificação", "Perdido" e "Nutrição / Futuro". `negocios_por_cadencia` traz
 * as N primeiras de cada ESTADO dentro da etapa de entrada — é ela que enche as
 * quatro colunas novas.
 *
 * Os cards da etapa de entrada que vieram pela primeira são DESCARTADOS: aquela
 * etapa agora é desenhada pelas colunas de cadência, e misturar as duas fatias
 * juntaria duas ordenações diferentes na mesma coluna (uma por último contato,
 * outra pelo relógio de cada estado).
 *
 * O `Set` não é redundância: entre as duas consultas — que são paralelas — um
 * card pode ter mudado de etapa e aparecer nas duas listas. Um `key` duplicado
 * no React quebra a coluna inteira.
 */
export function unirFatias(
  doBoard: NegocioComRelacoes[],
  porCadencia: NegocioComRelacoes[] | null,
  etapaCadenciaId: string | null,
): NegocioComRelacoes[] {
  if (!porCadencia || !etapaCadenciaId) return doBoard;
  const naFatiaDeCadencia = new Set(porCadencia.map((n) => n.id));
  const resto = doBoard.filter(
    (n) => n.etapa_id !== etapaCadenciaId && !naFatiaDeCadencia.has(n.id),
  );
  return [...resto, ...porCadencia];
}

/**
 * As mensagens paradas esperando uma pessoa, de todos os negócios visíveis.
 *
 * PostgREST direto pelo mesmo motivo de `buscarCadenciaDoBoard`: a RLS de
 * `mensagens` é `exists (select 1 from negocios n where n.id = negocio_id)`,
 * ou seja, delega inteiramente para `negocios` — que é a autorização do board.
 *
 * O índice `mensagens_aprovacao_idx` é parcial em
 * `status = 'aguardando_aprovacao'`, então esta consulta lê só as linhas que
 * interessam, e não a tabela.
 */
export function buscarAprovacoesDoBoard(supabase: SupabaseClient<Database>) {
  return supabase
    .from("mensagens")
    .select("negocio_id, canal, envio_manual")
    .eq("status", "aguardando_aprovacao")
    .not("negocio_id", "is", null);
}

type LinhaPendente = { negocio_id: string | null; canal: string; envio_manual: boolean };

/** Conta por negócio, separando o que se aprova do que se manda na mão. */
export function mapaDeAprovacoes(linhas: unknown): Record<string, ResumoDeAprovacao> {
  const mapa: Record<string, ResumoDeAprovacao> = {};
  for (const linha of (linhas as LinhaPendente[] | null) || []) {
    if (!linha.negocio_id) continue;
    const atual = (mapa[linha.negocio_id] ??= { email: 0, whatsapp: 0 });
    // `envio_manual` manda mais que o canal: um WhatsApp com template aprovado
    // na Meta sairia sozinho depois de aprovado, e aí ele se aprova como o
    // e-mail. É o `envio_manual` que diz "esta aqui sai pela sua mão".
    if (linha.envio_manual) atual.whatsapp += 1;
    else atual.email += 1;
  }
  return mapa;
}

/**
 * O andamento da cadência dos negócios de um funil, numa consulta só.
 *
 * Vai por PostgREST direto, e não por uma RPC nova, porque a RLS de
 * `cadencia_inscricoes` é `exists (select 1 from negocios n where n.id =
 * negocio_id)` — ela delega inteiramente para `negocios`, que é exatamente a
 * autorização do board. Uma função nova só repetiria essa regra num lugar a
 * mais.
 *
 * Os passos vêm embutidos porque resolvem de graça as duas coisas que o card
 * precisa e que a inscrição sozinha não tem: quantos passos a cadência tem no
 * total, e por qual canal é o próximo toque.
 *
 * Não há recorte por funil aqui, e é de propósito. O recorte natural seria um
 * filtro sobre a coluna do recurso EMBUTIDO (`cadencia.pipeline_id`), que é
 * sintaxe que eu não consigo exercitar neste ambiente — a saída para o
 * Supabase está bloqueada. Sem recorte, a consulta é PostgREST trivial, o
 * resultado é o mesmo (o mapa é lido por id de negócio, e só os cards deste
 * board se procuram nele) e o volume continua pequeno: a RLS já limita às
 * inscrições dos negócios visíveis, e o filtro de status às cadências que
 * estão de fato rodando.
 */
export function buscarCadenciaDoBoard(supabase: SupabaseClient<Database>) {
  return supabase
    .from("cadencia_inscricoes")
    .select(
      "negocio_id, passo_atual, status, proximo_envio_em, " +
        "cadencia:cadencias(nome, passos:cadencia_passos(ordem, canal))",
    )
    // O `.in("status", ["ativa", "pausada"])` que morava aqui virou dívida no
    // instante em que a cadência virou COLUNA.
    //
    // A coluna "Cadência parada" existe justamente para `respondeu`,
    // `concluida` e `cancelada`. Com o filtro, essas inscrições não chegavam ao
    // cliente e `estadoDeCadencia` classificaria o lead como "sem cadência" —
    // enquanto `contagem_por_cadencia`, que lê o banco, o contaria em "parada".
    // O card cairia numa coluna e o cabeçalho da outra o contaria. As duas
    // regras TÊM que ver o mesmo dado.
    //
    // O volume não muda de ordem de grandeza: a RLS já limita às inscrições dos
    // negócios visíveis, e são 216 leads com no máximo uma inscrição viva cada.
    // Um negocio pode ter sido inscrito mais de uma vez ao longo da vida. Sem
    // ordem, qual das inscricoes o card mostraria dependeria do plano do
    // Postgres; com ela, `mapaDeCadencias` sobrescreve ate sobrar a mais nova.
    .order("criado_em", { ascending: true });
}

type LinhaDeInscricao = {
  negocio_id: string;
  passo_atual: number;
  status: string;
  proximo_envio_em: string | null;
  cadencia: { nome: string; passos: { ordem: number; canal: string }[] } | null;
};

/** Casa as inscrições com os cards por `negocio_id`. */
export function mapaDeCadencias(linhas: unknown): Record<string, ResumoCadencia> {
  const mapa: Record<string, ResumoCadencia> = {};
  for (const linha of (linhas as LinhaDeInscricao[] | null) || []) {
    const passos = linha.cadencia?.passos || [];
    mapa[linha.negocio_id] = {
      nome: linha.cadencia?.nome || "Cadência",
      passoAtual: linha.passo_atual,
      totalPassos: passos.length,
      // O passo "atual" é o que ainda vai sair — é assim que
      // `reservar_mensagens` o trata —, então o canal do próximo toque é o
      // dele, e não o do seguinte.
      canalProximo: passos.find((p) => p.ordem === linha.passo_atual)?.canal ?? null,
      proximoEnvioEm: linha.proximo_envio_em,
      status: linha.status,
    };
  }
  return mapa;
}

// ───────────────────────────────────────────────────────────────────────────
// AS COLUNAS DE CADÊNCIA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Os quatro estados em que um lead de prospecção pode estar, e que no board do
 * SDR viram COLUNA.
 *
 * O que motivou: 216 leads numa única coluna ("Novo Lead"), 181 deles com um
 * toque pronto esperando um clique. A informação existia — o filtro "Precisa
 * aprovação" já a lia —, mas um filtro é um recorte que a pessoa precisa
 * lembrar de ligar. Coluna é o contrário: está lá, com o número no cabeçalho,
 * antes de alguém procurar.
 *
 * O lead NÃO muda de etapa ao mudar de estado. `etapa_id` continua sendo o que
 * era, e é `processar_cadencias()` — não a tela — quem manda no relógio.
 */
export const ESTADOS_DE_CADENCIA = [
  "toque_pronto",
  "aguardando_data",
  "parada",
  "sem_cadencia",
] as const;

export type EstadoCadencia = (typeof ESTADOS_DE_CADENCIA)[number];

/**
 * Nome, cor e texto de coluna vazia de cada estado.
 *
 * As cores não são decoração e seguem o tom que o resto do board já usa: âmbar
 * é "fila nossa esperando um clique" (o mesmo tom do contador "Precisa
 * aprovação"), índigo é "está andando sozinho", cinza é "parou", e o vazio é o
 * fio neutro. Repetir o âmbar aqui é o que faz a coluna e o selo do card
 * dizerem a mesma coisa.
 */
export const COLUNAS_DE_CADENCIA: {
  chave: EstadoCadencia;
  nome: string;
  cor: string;
  vazio: string;
}[] = [
  {
    chave: "toque_pronto",
    nome: "Toque pronto p/ enviar",
    cor: "#f59e0b",
    vazio: "Nenhum toque esperando — a fila está limpa",
  },
  {
    chave: "aguardando_data",
    nome: "Em cadência — aguardando data",
    cor: "#6366f1",
    vazio: "Nenhum lead com toque agendado",
  },
];

/**
 * OS ESTADOS QUE NÃO TÊM COLUNA PRÓPRIA — e o que impede que eles sumam.
 *
 * "Cadência parada" e "Sem cadência" saíram do board: hoje as duas estão
 * vazias (medido: 172 em "toque pronto" e 40 em "aguardando data", zero nas
 * outras) e duas colunas permanentemente vazias são ruído numa esteira.
 *
 * Mas os dois estados CONTINUAM ACONTECENDO, e é por isso que esta lista
 * existe em vez de o código simplesmente esquecê-los:
 *
 *   parada        a inscrição virou 'pausada' (o contato não tem e-mail,
 *                 WhatsApp nem telefone), 'cancelada' (revogou consentimento)
 *                 ou 'respondeu';
 *   sem_cadencia  o lead entrou sem inscrição — a cadência do funil está
 *                 inativa ou sem passos, e o gatilho desiste em silêncio.
 *
 * Um lead nesses estados fica na etapa de entrada, cuja coluna foi SUBSTITUÍDA
 * pelas de cadência (`unirFatias` descarta os cards dela vindos de
 * `negocios_do_board`). Sem esta lista, ele não apareceria em coluna nenhuma —
 * existiria no banco e não na tela. É o mesmo desfecho de esconder uma coluna
 * atrás da rolagem, só que pior, porque nem rolando se acha.
 *
 * Derivada de `COLUNAS_DE_CADENCIA`, e não escrita à mão: devolver uma coluna
 * ao board tira o estado daqui sozinho, sem ninguém precisar lembrar.
 */
export const ESTADOS_SEM_COLUNA: EstadoCadencia[] = ESTADOS_DE_CADENCIA.filter(
  (e) => !COLUNAS_DE_CADENCIA.some((c) => c.chave === e),
);

/**
 * ESPELHO, NO CLIENTE, DO `case` DA MIGRATION 20260908200000.
 *
 * O banco decide QUAIS leads vêm em cada coluna e QUANTOS existem; esta função
 * decide em qual coluna cada card CARREGADO aparece. Se as duas divergirem, o
 * card cai numa coluna e o cabeçalho da outra o conta — que é pior do que não
 * ter as colunas, porque parece certo.
 *
 * A ordem dos testes é a regra, e é a mesma dos dois lados: a pendência ganha
 * do status da inscrição, porque uma cadência pausada também pode ter um toque
 * parado na fila, e o que importa para quem olha o board é o clique que falta.
 */
export function estadoDeCadencia(
  negocioId: string,
  cadencias: Record<string, ResumoCadencia> | undefined,
  aprovacoes: Record<string, ResumoDeAprovacao> | undefined,
): EstadoCadencia {
  if (temPendencia(aprovacoes?.[negocioId])) return "toque_pronto";
  const inscricao = cadencias?.[negocioId];
  if (!inscricao) return "sem_cadencia";
  return inscricao.status === "ativa" ? "aguardando_data" : "parada";
}

/**
 * A fatia do board agrupada por estado de cadência: as N primeiras de CADA
 * estado, dentro de uma etapa.
 *
 * Não dá para reaproveitar `negocios_do_board` aqui, e a razão é de dado, não
 * de gosto: ela traz as 50 primeiras da ETAPA, ordenadas por último contato.
 * Com 216 leads em "Novo Lead", as 50 que chegam não são as 181 que têm toque
 * pendente — a coluna "Toque pronto" mostraria um punhado e a pessoa teria que
 * clicar "ver mais" até o fim para achar o resto. Aqui a fatia é por coluna, e
 * cada coluna vem cheia desde o primeiro render.
 */
export function buscarNegociosPorCadencia(
  supabase: SupabaseClient<Database>,
  pipelineId: string | null | undefined,
  etapaId: string | null | undefined,
  porEstado: number,
) {
  return supabase
    .rpc("negocios_por_cadencia", {
      p_pipeline_id: pipelineId ?? NENHUM_FUNIL,
      p_etapa_id: etapaId ?? null,
      p_por_estado: porEstado,
    })
    .select(SELECT_NEGOCIO_COMPLETO);
}

/** O par de contagem: o cabeçalho da coluna sai daqui, não do que carregou. */
export function contarPorCadencia(
  supabase: SupabaseClient<Database>,
  pipelineId: string | null | undefined,
  etapaId: string | null | undefined,
) {
  return supabase.rpc("contagem_por_cadencia", {
    p_pipeline_id: pipelineId ?? NENHUM_FUNIL,
    p_etapa_id: etapaId ?? null,
  });
}

export function mapaDeTotaisPorCadencia(
  linhas: { estado: string; total: number }[] | null,
): Record<EstadoCadencia, number> {
  const mapa = { toque_pronto: 0, aguardando_data: 0, parada: 0, sem_cadencia: 0 };
  for (const linha of linhas || []) {
    if (linha.estado in mapa) mapa[linha.estado as EstadoCadencia] = Number(linha.total);
  }
  return mapa;
}

// ───────────────────────────────────────────────────────────────────────────
// A BUSCA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Quantos caracteres já valem uma ida ao banco. Uma letra só casaria com quase
 * tudo e gastaria uma consulta para devolver um resultado inútil.
 */
export const MINIMO_PARA_BUSCAR = 2;

/** Teto de resultados. Quem precisa de mais que isto está filtrando, não procurando. */
export const LIMITE_DA_BUSCA = 100;

/**
 * Procura no BANCO, e não no que a tela carregou.
 *
 * `pipelineId` nulo procura nos dois funis — é o que a tela de leads usa, onde
 * quem digita um nome quer achar a pessoa e não saber em que funil ela mora. O
 * board passa o funil dele, porque ali a pergunta é "onde está este card".
 */
export function buscarNegociosPorTermo(
  supabase: SupabaseClient<Database>,
  termo: string,
  pipelineId: string | null | undefined,
  limite: number = LIMITE_DA_BUSCA,
) {
  return supabase
    .rpc("buscar_negocios", {
      p_termo: termo,
      p_pipeline_id: pipelineId ?? null,
      p_limite: limite,
    })
    .select(SELECT_NEGOCIO_COMPLETO);
}

/** Usada pelo servidor e pelo refetch do cliente — a mesma fatia nos dois. */
export function buscarNegociosDoBoard(
  supabase: SupabaseClient<Database>,
  pipelineId: string | null | undefined,
  porEtapa: number,
) {
  return supabase
    .rpc("negocios_do_board", { p_pipeline_id: pipelineId ?? NENHUM_FUNIL, p_por_etapa: porEtapa })
    .select(SELECT_NEGOCIO_COMPLETO);
}

export function contarPorEtapa(
  supabase: SupabaseClient<Database>,
  pipelineId: string | null | undefined,
) {
  return supabase.rpc("contagem_negocios_por_etapa", { p_pipeline_id: pipelineId ?? NENHUM_FUNIL });
}
