import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NegocioDetailClient } from "@/components/negocio/NegocioDetailClient";
import { SELECT_NEGOCIO_COMPLETO, normalizarAba } from "@/lib/types";
import type { NegocioComRelacoes } from "@/lib/types";

export default async function NegocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Propostas e planos NÃO entram aqui: são o join mais pesado da tela
  // (proposta → plano → envelope → signatários) e só a aba Proposta usa.
  // Ela carrega os dois sozinha ao abrir.
  const [{ data: negocio }, { data: etapas }, { data: vendedores }, { data: atividades }, { data: usuarioAtual }] =
    await Promise.all([
      supabase.from("negocios").select(SELECT_NEGOCIO_COMPLETO).eq("id", id).single(),
      supabase.from("etapas_pipeline").select("*").order("ordem"),
      supabase.from("usuarios").select("*").eq("role", "vendedor").eq("ativo", true),
      supabase
        .from("atividades")
        .select("*, usuario:usuarios(*)")
        .eq("negocio_id", id)
        .order("criado_em", { ascending: false }),
      supabase.from("usuarios").select("*").eq("id", user!.id).single(),
    ]);

  if (!negocio) notFound();

  // A fila da etapa: os vizinhos do negócio no mesmo ponto do funil. É o que
  // faz esta tela não perder o contexto do board — dá para pular de um lead
  // para o outro sem voltar. O RLS já limita ao que a pessoa pode ver.
  const etapaId = (negocio as unknown as NegocioComRelacoes).etapa_id;
  const { data: fila } = etapaId
    ? await supabase
        .from("negocios")
        .select(SELECT_NEGOCIO_COMPLETO)
        .eq("etapa_id", etapaId)
        .order("criado_em", { ascending: false })
    : { data: [] };

  return (
    <NegocioDetailClient
      negocioInicial={negocio as never}
      filaInicial={(fila as never) || []}
      etapas={etapas || []}
      vendedores={vendedores || []}
      atividadesIniciais={(atividades as never) || []}
      usuarioAtual={usuarioAtual!}
      abaInicial={normalizarAba(tab) ?? "cadencia"}
    />
  );
}
