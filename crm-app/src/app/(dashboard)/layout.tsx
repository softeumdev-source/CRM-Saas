import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BarraLateral } from "@/components/shell/BarraLateral";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("*, tenant:tenants(*)")
    .eq("id", user.id)
    .single();

  if (!usuario) {
    redirect("/login");
  }

  return (
    // A cadeia min-h-0 e o que faz as colunas do kanban rolarem por dentro em
    // vez de esticar a pagina. min-w-0 entrou junto com o trilho: sem ele o
    // scroll horizontal do board empurra a barra lateral para fora da tela.
    <div className="flex h-screen flex-col overflow-hidden bg-superficie font-sans md:flex-row">
      <BarraLateral usuario={usuario} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
