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

  // O `!usuarios_tenant_id_fkey` NÃO é enfeite: existem DUAS chaves
  // estrangeiras entre `usuarios` e `tenants` — `usuarios.tenant_id → tenants`
  // e `tenants.caixa_email_usuario_id → usuarios` (esta última acrescentada na
  // Fase 3a, para a caixa de e-mail do tenant). Com duas, o PostgREST recusa o
  // embed por ambiguidade (PGRST201) em vez de escolher uma.
  //
  // O estrago era total e mudo: `usuario` vinha nulo, o layout redirecionava
  // para `/login`, o middleware via a sessão VÁLIDA e devolvia para `/`, e o
  // navegador desistia com ERR_TOO_MANY_REDIRECTS. Nenhum erro em log nenhum —
  // `redirect()` não é exceção, e a autenticação estava perfeita o tempo todo.
  //
  // Nomear a chave desfaz a ambiguidade e prende esta consulta ao caminho certo
  // mesmo que apareça uma terceira FK amanhã.
  const { data: usuario, error: erroUsuario } = await supabase
    .from("usuarios")
    .select("*, tenant:tenants!usuarios_tenant_id_fkey(*)")
    .eq("id", user.id)
    .single();

  // O erro vai para o log do servidor antes do redirect. Sem isto, qualquer
  // falha nesta consulta vira "vá para o login" sem deixar rastro — que é
  // exatamente o que tornou este bug tão caro de achar.
  if (erroUsuario) {
    console.error("[layout] não foi possível carregar o usuário:", erroUsuario.message, erroUsuario.code);
  }

  if (!usuario) {
    redirect("/login");
  }

  return (
    <div className="h-screen overflow-hidden bg-fundo text-tinta flex flex-col font-sans">
      <Navbar usuario={usuario} />
      <main className="flex-1 min-h-0 flex flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
