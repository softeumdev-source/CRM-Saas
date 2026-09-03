import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NegocioDetailClient } from "@/components/negocio/NegocioDetailClient";
import {
  carregarEtapas,
  carregarFunilDeOrigem,
  carregarPipelinePorId,
  etapaComFuncao,
  etapaDaEntrega,
} from "@/lib/pipelines";
import { SELECT_NEGOCIO_COMPLETO, normalizarAba } from "@/lib/types";

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

  const pipeline = await carregarPipelinePorId(supabase, negocio.pipeline_id);
  // Os dois lados da passagem de funil: para onde este negócio pode ser
  // entregue (SDR → vendedor) e de onde ele veio, que é para onde um no-show
  // volta (vendedor → SDR).
  const [destino, origem] = await Promise.all([
    carregarPipelinePorId(supabase, pipeline?.pipeline_destino_id),
    carregarFunilDeOrigem(supabase, pipeline?.id),
  ]);

  const [
    etapas,
    etapasDestino,
    etapasOrigem,
    { data: responsaveis },
    { data: responsaveisDestino },
    { data: planos },
    { data: atividades },
    { data: propostas },
    { data: usuarioAtual },
  ] = await Promise.all([
    carregarEtapas(supabase, negocio.pipeline_id),
    carregarEtapas(supabase, destino?.id),
    carregarEtapas(supabase, origem?.id),
    // Mesma regra do board: os donos possíveis saem do `role_operador` do
    // funil em que o negócio está.
    supabase.from("usuarios").select("*").eq("role", pipeline?.role_operador ?? "vendedor").eq("ativo", true),
    supabase.from("usuarios").select("*").eq("role", destino?.role_operador ?? "vendedor").eq("ativo", true),
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
      pipeline={pipeline}
      etapas={etapas}
      entrega={
        // Mesmo destino do arrasto: a etapa de mesma ordem da de entrega, que
        // hoje é "Demonstração Agendada". Antes aqui era a etapa de ENTRADA do
        // funil de destino, então o mesmo lead caía em "Novo Lead" pelo botão e
        // em "Demonstração Agendada" pelo arrasto.
        destino && etapaDaEntrega(etapas, etapasDestino)
          ? {
              funil: destino,
              etapa: etapaDaEntrega(etapas, etapasDestino)!,
              responsaveis: responsaveisDestino || [],
            }
          : null
      }
      devolucao={
        origem && etapaComFuncao(etapasOrigem, "retorno")
          ? { funil: origem, etapa: etapaComFuncao(etapasOrigem, "retorno")! }
          : null
      }
      responsaveis={responsaveis || []}
      planos={planos || []}
      atividadesIniciais={(atividades as never) || []}
      propostasIniciais={(propostas as never) || []}
      usuarioAtual={usuarioAtual!}
      abaInicial={normalizarAba(tab) ?? "geral"}
    />
  );
}
