import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NegocioDetailClient } from "@/components/negocio/NegocioDetailClient";
import { carregarEtapas } from "@/lib/pipelines";
import { SELECT_NEGOCIO_COMPLETO, ehAbaValida, PAPEIS_TIME } from "@/lib/types";

export default async function NegocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  // O negócio vem primeiro porque o seletor de etapa tem que oferecer as
  // etapas do funil DELE. Buscar todas as etapas do tenant é o que faria uma
  // etapa de SDR aparecer como destino válido no card do vendedor.
  const [{ data: { user } }, { data: negocio }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("negocios").select(SELECT_NEGOCIO_COMPLETO).eq("id", id).single(),
  ]);

  if (!negocio) notFound();

  const [
    etapas,
    { data: vendedores },
    { data: planos },
    { data: atividades },
    { data: propostas },
    { data: usuarioAtual },
  ] = await Promise.all([
    carregarEtapas(supabase, negocio.pipeline_id),
    supabase.from("usuarios").select("*").in("role", PAPEIS_TIME).eq("ativo", true),
    supabase.from("planos").select("*").eq("ativo", true).order("valor_plataforma_base"),
    supabase.from("atividades").select("*, usuario:usuarios(*)").eq("negocio_id", id).order("criado_em", { ascending: false }),
    supabase
      .from("propostas")
      .select("*, plano:planos(*), envelopes(*, signatarios(*))")
      .eq("negocio_id", id)
      .order("criado_em", { ascending: false }),
    supabase.from("usuarios").select("*").eq("id", user!.id).single(),
  ]);

  return (
    <NegocioDetailClient
      negocioInicial={negocio as never}
      etapas={etapas}
      vendedores={vendedores || []}
      planos={planos || []}
      atividadesIniciais={(atividades as never) || []}
      propostasIniciais={(propostas as never) || []}
      usuarioAtual={usuarioAtual!}
      abaInicial={ehAbaValida(tab) ? tab : "geral"}
    />
  );
}
