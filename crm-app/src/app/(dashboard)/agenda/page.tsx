import { createClient } from "@/lib/supabase/server";
import { AgendaClient, type AtividadeAgenda } from "@/components/AgendaClient";
import { SELECT_AGENDA } from "@/lib/types";

export default async function AgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: atividades }, { data: usuarioAtual }] = await Promise.all([
    supabase
      .from("atividades")
      .select(SELECT_AGENDA)
      .not("data_agendada", "is", null)
      .or("concluida.is.null,concluida.is.false")
      .order("data_agendada", { ascending: true }),
    supabase.from("usuarios").select("*").eq("id", user!.id).single(),
  ]);

  return (
    <AgendaClient
      atividadesIniciais={(atividades as unknown as AtividadeAgenda[]) || []}
      usuarioAtual={usuarioAtual!}
    />
  );
}
