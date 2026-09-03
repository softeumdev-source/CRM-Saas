import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO } from "@/lib/types";
import { carregarEtapas, carregarPipeline, recorteDeFunil, type ChavePipeline, type Pipeline } from "@/lib/pipelines";

export type DadosDoBoard = {
  pipeline: Pipeline | null;
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
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
): Promise<DadosDoBoard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pipeline = await carregarPipeline(supabase, chave);

  const [etapas, { data: negocios }, { data: responsaveis }, { data: usuarioAtual }] = await Promise.all([
    carregarEtapas(supabase, pipeline?.id),
    supabase
      .from("negocios")
      .select(SELECT_NEGOCIO_COMPLETO)
      .eq("pipeline_id", recorteDeFunil(pipeline?.id))
      .order("criado_em", { ascending: false }),
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
    responsaveis: responsaveis || [],
    usuarioAtual: usuarioAtual!,
  };
}
