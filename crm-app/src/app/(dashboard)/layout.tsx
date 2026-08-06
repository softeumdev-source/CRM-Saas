import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";

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
    <div className="h-screen overflow-hidden bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Navbar usuario={usuario} />
      <main className="flex-1 min-h-0 flex flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
