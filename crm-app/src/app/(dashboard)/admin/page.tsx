import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "@/components/admin/AdminClient";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: usuarioAtual } = await supabase.from("usuarios").select("*").eq("id", user!.id).single();

  if (!usuarioAtual || usuarioAtual.role !== "admin") {
    redirect("/");
  }

  const [{ data: usuarios }, { data: convites }, { data: planos }, { data: negocios }, { data: etapas }, { data: contatosSemDono }, { data: contatosComDono }] = await Promise.all([
    supabase.from("usuarios").select("*").order("criado_em"),
    supabase.from("convites").select("*").order("criado_em", { ascending: false }),
    supabase.from("planos").select("*").order("valor_plataforma_base"),
    supabase.from("negocios").select("*, contato:contatos(*), responsavel:usuarios(*), etapa:etapas_pipeline(*)"),
    supabase.from("etapas_pipeline").select("*").order("ordem"),
    supabase.from("contatos").select("*").is("responsavel_id", null).order("criado_em", { ascending: false }),
    supabase.from("contatos").select("*, responsavel:usuarios(id, nome)").not("responsavel_id", "is", null).order("criado_em", { ascending: false }).limit(1000),
  ]);

  return (
    <AdminClient
      usuarios={usuarios || []}
      convites={convites || []}
      planos={planos || []}
      negocios={(negocios as any) || []}
      etapas={etapas || []}
      contatosSemDono={contatosSemDono || []}
      contatosComDono={(contatosComDono as any) || []}
      usuarioAtual={usuarioAtual}
    />
  );
}
