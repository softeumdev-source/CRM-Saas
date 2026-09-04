import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "@/components/admin/AdminClient";
// De `abas.ts`, e NÃO de `AdminClient`: aquele é `"use client"`, e chamar do
// servidor uma função que vive no cliente derruba a rota com 500.
import { ehAbaAdmin } from "@/components/admin/abas";
import { carregarEtapas, carregarPipeline, recorteDeFunil } from "@/lib/pipelines";

/**
 * Teto explicito: a consulta era ilimitada e, no volume alvo de 500-2000
 * leads/mes, derrubava a pagina. A tela avisa quando bate no teto, para
 * "distribuir todos" nao mentir sobre o que alcancou.
 */
const TETO_LEADS_SEM_DONO = 500;

/**
 * Teto do historico de etapas. A consulta era ILIMITADA, e e a mesma classe de
 * problema que ja derrubou esta pagina uma vez: sao 42 linhas hoje, mas o
 * historico cresce a cada movimento de card e nunca e podado. No volume alvo
 * (500-2000 leads/mes, varios movimentos por lead) isso vira dezenas de
 * milhares de linhas trazidas para calcular taxa de conversao.
 *
 * As linhas mais RECENTES sao as que interessam ao funil, entao o corte e por
 * `entrou_em` desc — cortar sem ordenar traria um recorte arbitrario do banco.
 *
 * `entrou_em`, e nao `criado_em`: esta tabela NAO tem `criado_em`. Ordenar por
 * uma coluna inexistente faria o PostgREST devolver erro, `historicoEtapas`
 * viraria `[]` pelo fallback logo abaixo, e o funil mostraria zero em tudo —
 * sem quebrar nada e sem ninguem notar. Conferido contra o schema vivo.
 */
const TETO_HISTORICO = 5000;

export default async function AdminPage({
  searchParams,
}: {
  // Nesta versao do Next `searchParams` e uma Promise.
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: usuarioAtual } = await supabase.from("usuarios").select("*").eq("id", user!.id).single();

  if (!usuarioAtual || usuarioAtual.role !== "admin") {
    redirect("/");
  }

  // Os números do admin são os do funil de vendas. Quando o board do SDR
  // existir (Fase 4) ele terá as métricas dele; misturar os dois aqui mudaria
  // toda taxa de conversão do vendedor sem ninguém pedir.
  const pipeline = await carregarPipeline(supabase);

  const [{ data: usuarios }, { data: convites }, { data: planos }, { data: negocios }, etapas, { data: contatosSemDono }, { data: contatosComDono }, { data: historicoEtapas }, { data: solicitacoesDesconto }] = await Promise.all([
    supabase.from("usuarios").select("*").order("criado_em"),
    supabase.from("convites").select("*").order("entrou_em", { ascending: false }),
    supabase.from("planos").select("*").order("valor_plataforma_base"),
    supabase
      .from("negocios")
      .select("*, contato:contatos(*), responsavel:usuarios!negocios_responsavel_id_fkey(*), etapa:etapas_pipeline(*)")
      .eq("pipeline_id", recorteDeFunil(pipeline?.id)),
    carregarEtapas(supabase, pipeline?.id),
    supabase.from("contatos").select("*").is("responsavel_id", null).order("criado_em", { ascending: false }).limit(TETO_LEADS_SEM_DONO),
    supabase.from("contatos").select("*, responsavel:usuarios(id, nome)").not("responsavel_id", "is", null).order("criado_em", { ascending: false }).limit(1000),
    supabase
      .from("negocio_etapa_historico")
      .select("negocio_id, etapa_id")
      .order("criado_em", { ascending: false })
      .limit(TETO_HISTORICO),
    supabase
      .from("solicitacoes_desconto")
      .select("*, negocio:negocios(id, titulo, contato:contatos(nome, empresa)), vendedor:usuarios!solicitacoes_desconto_vendedor_id_fkey(nome), plano:planos(nome)")
      .order("criado_em", { ascending: false }),
  ]);

  return (
    <AdminClient
      usuarios={usuarios || []}
      convites={convites || []}
      planos={planos || []}
      negocios={(negocios as any) || []}
      etapas={etapas}
      contatosSemDono={contatosSemDono || []}
      tetoLeadsSemDono={TETO_LEADS_SEM_DONO}
      contatosComDono={(contatosComDono as any) || []}
      historicoEtapas={historicoEtapas || []}
      solicitacoesDesconto={(solicitacoesDesconto as any) || []}
      usuarioAtual={usuarioAtual}
      abaInicial={ehAbaAdmin(tab) ? tab : "desempenho"}
    />
  );
}
