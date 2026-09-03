import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KanbanPageClient } from "@/components/KanbanPageClient";
import { carregarBoard } from "@/lib/board";

export default async function SdrPage() {
  const supabase = await createClient();
  const board = await carregarBoard(supabase, "sdr");

  // Vendedor não tem o que fazer aqui: a RLS já não lhe mostra nenhum lead do
  // SDR, então a página seria um board vazio sem explicação. Melhor devolver
  // ao board dele.
  if (board.usuarioAtual.role !== "sdr" && board.usuarioAtual.role !== "admin") {
    redirect("/");
  }

  return <KanbanPageClient {...board} />;
}
