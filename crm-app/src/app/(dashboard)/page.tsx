import { createClient } from "@/lib/supabase/server";
import { KanbanPageClient } from "@/components/KanbanPageClient";
import { carregarEtapas, carregarPipeline, recorteDeFunil } from "@/lib/pipelines";
import type { NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, PAPEIS_TIME } from "@/lib/types";

export default async function KanbanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O funil vem antes de tudo porque é ele que recorta as etapas e os
  // negócios: sem esse recorte, a primeira etapa de SDR criada viraria coluna
  // extra aqui no board do vendedor.
  const pipeline = await carregarPipeline(supabase);

  const [etapas, { data: negocios }, { data: usuarios }, { data: usuarioAtual }] = await Promise.all([
    carregarEtapas(supabase, pipeline?.id),
    supabase
      .from("negocios")
      .select(SELECT_NEGOCIO_COMPLETO)
      .eq("pipeline_id", recorteDeFunil(pipeline?.id))
      .order("criado_em", { ascending: false }),
    supabase.from("usuarios").select("*").in("role", PAPEIS_TIME).eq("ativo", true),
    supabase.from("usuarios").select("*").eq("id", user!.id).single(),
  ]);

  return (
    <KanbanPageClient
      pipelineId={pipeline?.id ?? null}
      etapas={etapas}
      negocios={(negocios as unknown as NegocioComRelacoes[]) || []}
      vendedores={usuarios || []}
      usuarioAtual={usuarioAtual!}
    />
  );
}
