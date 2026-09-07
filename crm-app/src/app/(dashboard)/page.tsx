import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KanbanPageClient } from "@/components/KanbanPageClient";
import { carregarBoard } from "@/lib/board";

export default async function KanbanPage() {
  const supabase = await createClient();
  const board = await carregarBoard(supabase, "vendas");

  // O SDR nao tem o que fazer neste board, e "/" e a rota inicial de todo
  // mundo — entao o dia dele comecava num kanban que nunca vai ter um card.
  //
  // Nao e opiniao: `negocios_select` so mostra negocio DELE ou sem dono no
  // funil que o PAPEL DELE opera (`pipelines_do_meu_papel`), e o de vendas e
  // operado por `vendedor`. O board carrega vazio, sem uma linha dizendo por
  // que. O trabalho dele esta em /sdr.
  //
  // Isto e o espelho do que /sdr ja faz com o vendedor, pelo mesmo motivo. E
  // nao ha vai-e-vem: /sdr so devolve para "/" quem NAO e sdr nem admin, e o
  // admin nao entra em nenhum dos dois desvios.
  if (board.usuarioAtual.role === "sdr") {
    redirect("/sdr");
  }

  return <KanbanPageClient {...board} />;
}
