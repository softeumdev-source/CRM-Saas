import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NegocioDetailClient } from "@/components/negocio/NegocioDetailClient";

export default async function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: negocio },
    { data: etapas },
    { data: vendedores },
    { data: planos },
    { data: atividades },
    { data: propostas },
    { data: usuarioAtual },
  ] = await Promise.all([
    supabase
      .from("negocios")
      .select("*, contato:contatos(*), responsavel:usuarios(*), etapa:etapas_pipeline(*)")
      .eq("id", id)
      .single(),
    supabase.from("etapas_pipeline").select("*").order("ordem"),
    supabase.from("usuarios").select("*").eq("role", "vendedor").eq("ativo", true),
    supabase.from("planos").select("*").eq("ativo", true).order("valor_plataforma_base"),
    supabase.from("atividades").select("*, usuario:usuarios(*)").eq("negocio_id", id).order("criado_em", { ascending: false }),
    supabase
      .from("propostas")
      .select("*, plano:planos(*), envelopes(*, signatarios(*))")
      .eq("negocio_id", id)
      .order("criado_em", { ascending: false }),
    supabase.from("usuarios").select("*").eq("id", user!.id).single(),
  ]);

  if (!negocio) notFound();

  return (
    <NegocioDetailClient
      negocioInicial={negocio as any}
      etapas={etapas || []}
      vendedores={vendedores || []}
      planos={planos || []}
      atividadesIniciais={(atividades as any) || []}
      propostasIniciais={(propostas as any) || []}
      usuarioAtual={usuarioAtual!}
    />
  );
}
