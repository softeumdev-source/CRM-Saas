import { createClient } from "@/lib/supabase/server";
import { ListaClient } from "@/components/ListaClient";
import type { NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO } from "@/lib/types";

export default async function ListaPage() {
  const supabase = await createClient();
  const [{ data: negocios }, { data: etapas }] = await Promise.all([
    supabase.from("negocios").select(SELECT_NEGOCIO_COMPLETO).order("criado_em", { ascending: false }),
    supabase.from("etapas_pipeline").select("*").order("ordem"),
  ]);

  return <ListaClient negocios={(negocios as unknown as NegocioComRelacoes[]) || []} etapas={etapas || []} />;
}
