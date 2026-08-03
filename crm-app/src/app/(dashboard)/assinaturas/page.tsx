import { createClient } from "@/lib/supabase/server";
import { AssinaturasClient } from "@/components/AssinaturasClient";

export default async function AssinaturasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: usuario } = user
    ? await supabase.from("usuarios").select("id, role").eq("id", user.id).single()
    : { data: null };

  const query = supabase
    .from("envelopes")
    .select("*, signatarios(*), proposta:propostas(*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios(*)))")
    .order("criado_em", { ascending: false });

  const { data: envelopes } = await query;

  const envelopesFiltrados =
    usuario?.role === "vendedor"
      ? (envelopes || []).filter((e: any) => e.proposta?.negocio?.responsavel_id === usuario.id)
      : envelopes || [];

  return <AssinaturasClient envelopesIniciais={(envelopesFiltrados as any) || []} usuarioRole={usuario?.role || "vendedor"} usuarioId={usuario?.id || ""} />;
}
