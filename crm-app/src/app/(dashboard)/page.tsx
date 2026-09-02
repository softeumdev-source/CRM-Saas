import { createClient } from "@/lib/supabase/server";
import { KanbanPageClient } from "@/components/KanbanPageClient";
import type { NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, PAPEIS_TIME } from "@/lib/types";

export default async function KanbanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: etapas }, { data: negocios }, { data: usuarios }, { data: usuarioAtual }] = await Promise.all([
    supabase.from("etapas_pipeline").select("*").order("ordem"),
    supabase.from("negocios").select(SELECT_NEGOCIO_COMPLETO).order("criado_em", { ascending: false }),
    supabase.from("usuarios").select("*").in("role", PAPEIS_TIME).eq("ativo", true),
    supabase.from("usuarios").select("*").eq("id", user!.id).single(),
  ]);

  return (
    <KanbanPageClient
      etapas={etapas || []}
      negocios={(negocios as unknown as NegocioComRelacoes[]) || []}
      vendedores={usuarios || []}
      usuarioAtual={usuarioAtual!}
    />
  );
}
