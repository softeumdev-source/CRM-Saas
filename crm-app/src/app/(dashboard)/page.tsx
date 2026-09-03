import { createClient } from "@/lib/supabase/server";
import { KanbanPageClient } from "@/components/KanbanPageClient";
import { carregarBoard } from "@/lib/board";

export default async function KanbanPage() {
  const supabase = await createClient();
  const board = await carregarBoard(supabase, "vendas");
  return <KanbanPageClient {...board} />;
}
