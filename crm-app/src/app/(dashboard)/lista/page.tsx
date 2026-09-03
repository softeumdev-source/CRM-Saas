import { createClient } from "@/lib/supabase/server";
import { ListaClient } from "@/components/ListaClient";
import { carregarEtapas, carregarPipeline, recorteDeFunil } from "@/lib/pipelines";
import type { NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO } from "@/lib/types";

export default async function ListaPage() {
  const supabase = await createClient();
  const pipeline = await carregarPipeline(supabase);

  const [{ data: negocios }, etapas] = await Promise.all([
    supabase
      .from("negocios")
      .select(SELECT_NEGOCIO_COMPLETO)
      .eq("pipeline_id", recorteDeFunil(pipeline?.id))
      .order("criado_em", { ascending: false }),
    carregarEtapas(supabase, pipeline?.id),
  ]);

  return (
    <ListaClient
      pipelineId={pipeline?.id ?? null}
      negocios={(negocios as unknown as NegocioComRelacoes[]) || []}
      etapas={etapas}
    />
  );
}
