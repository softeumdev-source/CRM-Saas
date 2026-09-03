import { createClient } from "@/lib/supabase/server";
import { ListaClient } from "@/components/ListaClient";
import { carregarEtapas, carregarPipeline, recorteDeFunil } from "@/lib/pipelines";
import type { NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO } from "@/lib/types";

/**
 * Teto da primeira carga. A consulta era ilimitada: no volume alvo de 500-2000
 * leads/mês ela passaria a trazer milhares de linhas com relações completas
 * toda vez que a tela abre. A tela diz quantos existem e oferece carregar mais,
 * em vez de fingir que o que veio é tudo.
 */
export const LOTE_LISTA = 200;

export default async function ListaPage() {
  const supabase = await createClient();
  const pipeline = await carregarPipeline(supabase);

  const [{ data: negocios, count }, etapas] = await Promise.all([
    supabase
      .from("negocios")
      .select(SELECT_NEGOCIO_COMPLETO, { count: "exact" })
      .eq("pipeline_id", recorteDeFunil(pipeline?.id))
      .order("criado_em", { ascending: false })
      .range(0, LOTE_LISTA - 1),
    carregarEtapas(supabase, pipeline?.id),
  ]);

  return (
    <ListaClient
      pipelineId={pipeline?.id ?? null}
      negocios={(negocios as unknown as NegocioComRelacoes[]) || []}
      total={count ?? 0}
      lote={LOTE_LISTA}
      etapas={etapas}
    />
  );
}
