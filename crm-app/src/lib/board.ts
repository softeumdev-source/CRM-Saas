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

export type DadosDoBoard = {
  pipeline: Pipeline | null;
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
  /** Quantos existem de verdade em cada etapa, para o cabeçalho não mentir. */
  totaisPorEtapa: Record<string, number>;
  porEtapa: number;
  responsaveis: Usuario[];
  usuarioAtual: Usuario;
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

  const [etapas, { data: negocios }, { data: totais }, { data: responsaveis }, { data: usuarioAtual }] = await Promise.all([
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
  ]);

  return {
    pipeline,
    etapas,
    negocios: (negocios as unknown as NegocioComRelacoes[]) || [],
    totaisPorEtapa: Object.fromEntries((totais || []).map((t) => [t.etapa_id, Number(t.total)])),
    porEtapa,
    responsaveis: responsaveis || [],
    usuarioAtual: usuarioAtual!,
  };
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
