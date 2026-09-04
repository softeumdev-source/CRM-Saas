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

  const [
    etapas,
    { data: negocios },
    { data: totais },
    { data: responsaveis },
    { data: usuarioAtual },
    inscricoes,
    pendentes,
  ] =
    await Promise.all([
      carregarEtapas(supabase, pipeline?.id),
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
    ]);

  return {
    pipeline,
    etapas,
    negocios: (negocios as unknown as NegocioComRelacoes[]) || [],
    totaisPorEtapa: Object.fromEntries((totais || []).map((t) => [t.etapa_id, Number(t.total)])),
    porEtapa,
    responsaveis: responsaveis || [],
    usuarioAtual: usuarioAtual!,
    cadencias: mapaDeCadencias(inscricoes.data),
    aprovacoes: mapaDeAprovacoes(pendentes.data),
  };
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
    .in("status", ["ativa", "pausada"])
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
