import { createClient } from "@/lib/supabase/server";
import { KanbanPageClient } from "@/components/KanbanPageClient";
import { carregarEtapas, carregarPipeline, recorteDeFunil } from "@/lib/pipelines";
import type { NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO } from "@/lib/types";

export default async function KanbanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O funil vem antes de tudo porque é ele que recorta as etapas e os
  // negócios: sem esse recorte, a primeira etapa de SDR criada viraria coluna
  // extra aqui no board do vendedor.
  const pipeline = await carregarPipeline(supabase);

  const [etapas, { data: negocios }, { data: responsaveis }, { data: usuarioAtual }] = await Promise.all([
    carregarEtapas(supabase, pipeline?.id),
    supabase
      .from("negocios")
      .select(SELECT_NEGOCIO_COMPLETO)
      .eq("pipeline_id", recorteDeFunil(pipeline?.id))
      .order("criado_em", { ascending: false }),
    // Quem pode ser dono de um card DESTE funil sai do proprio funil
    // (`role_operador`): o board do vendedor oferece vendedores, o do SDR
    // oferece SDRs. Antes era a lista fixa de "quem e do time".
    supabase.from("usuarios").select("*").eq("role", pipeline?.role_operador ?? "vendedor").eq("ativo", true),
    supabase.from("usuarios").select("*").eq("id", user!.id).single(),
  ]);

  return (
    <KanbanPageClient
      pipelineId={pipeline?.id ?? null}
      etapas={etapas}
      negocios={(negocios as unknown as NegocioComRelacoes[]) || []}
      responsaveis={responsaveis || []}
      usuarioAtual={usuarioAtual!}
    />
  );
}
