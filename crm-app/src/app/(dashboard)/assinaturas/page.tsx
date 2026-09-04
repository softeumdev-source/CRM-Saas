import { createClient } from "@/lib/supabase/server";
import { AssinaturasClient } from "@/components/AssinaturasClient";

export default async function AssinaturasPage() {
  const supabase = await createClient();
  const { data: envelopes } = await supabase
    .from("envelopes")
    .select("*, signatarios(*), proposta:propostas(*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios!negocios_responsavel_id_fkey(*)))")
    .order("criado_em", { ascending: false });

  return <AssinaturasClient envelopesIniciais={(envelopes as any) || []} />;
}
