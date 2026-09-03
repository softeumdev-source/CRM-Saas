import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/supabase/types";
import type { EtapaPipeline } from "@/lib/types";

export type Pipeline = Tables<"pipelines">;

/**
 * A chave é imutável no banco (CHECK em `pipelines.chave`) justamente para o
 * código poder referenciá-la: o nome exibido pode ser trocado pelo admin sem
 * quebrar nada.
 */
export const CHAVES_PIPELINE = ["vendas", "sdr"] as const;
export type ChavePipeline = (typeof CHAVES_PIPELINE)[number];

/** O funil do vendedor. É o único que existe até a Fase 4. */
export const PIPELINE_VENDAS: ChavePipeline = "vendas";

type Cliente = SupabaseClient<Database>;

/**
 * Este módulo é o caminho EXCLUSIVO para ler etapas.
 *
 * O motivo é a armadilha nº 2 do projeto: `etapas_pipeline` era consultada sem
 * filtro em quatro lugares, então a primeira etapa de SDR criada apareceria
 * como coluna extra no board do vendedor, na lista e no seletor de etapa do
 * negócio — em produção, sem aviso. Com a leitura concentrada aqui, "consulta
 * sem filtro" deixa de ser uma questão de disciplina: o ESLint recusa
 * `from("etapas_pipeline")` em qualquer outro arquivo (regra
 * `no-restricted-syntax` em `eslint.config.mjs`).
 */
export async function carregarPipeline(
  supabase: Cliente,
  chave: ChavePipeline = PIPELINE_VENDAS,
): Promise<Pipeline | null> {
  const { data } = await supabase.from("pipelines").select("*").eq("chave", chave).maybeSingle();
  return data ?? null;
}

/**
 * Valor para `.eq("pipeline_id", …)` quando o funil não existe. É um UUID
 * válido que não casa com nada: passar string vazia faria o Postgres recusar o
 * cast e a consulta voltaria com erro em vez de lista vazia, o que na prática
 * vira tela quebrada em vez de board vazio.
 */
export const NENHUM_FUNIL = "00000000-0000-0000-0000-000000000000";

/** Recorte de funil para consultas de `negocios`. */
export function recorteDeFunil(pipelineId: string | null | undefined): string {
  return pipelineId || NENHUM_FUNIL;
}

/** O funil de um negócio, quando já se tem o id dele. */
export async function carregarPipelinePorId(
  supabase: Cliente,
  pipelineId: string | null | undefined,
): Promise<Pipeline | null> {
  if (!pipelineId) return null;
  const { data } = await supabase.from("pipelines").select("*").eq("id", pipelineId).maybeSingle();
  return data ?? null;
}

/** Etapas de um único funil, na ordem em que aparecem no board. */
export async function carregarEtapas(
  supabase: Cliente,
  pipelineId: string | null | undefined,
): Promise<EtapaPipeline[]> {
  if (!pipelineId) return [];
  const { data } = await supabase
    .from("etapas_pipeline")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .order("ordem");
  return data ?? [];
}

/**
 * Papel de uma etapa dentro do fluxo do funil. Espelha o CHECK de
 * `etapas_pipeline.funcao`.
 *
 * `resultado` diz o que a etapa significa para o NEGÓCIO (ganho/perda);
 * `funcao` diz o que ela significa para o FLUXO — de onde o lead entra, ao
 * chegar onde ele passa sozinho para o outro funil, para onde o no-show volta,
 * onde ele fica parado esperando data.
 *
 * É `funcao`, e não o nome da etapa, que decide o fluxo: com os dois funis
 * usando a MESMA lista de nomes, decidir por nome entregaria também o card do
 * vendedor ao chegar em "Demonstração Agendada".
 */
export type FuncaoEtapa = "entrada" | "retorno" | "nutricao" | "entrega";

export function etapaComFuncao(
  etapas: EtapaPipeline[],
  funcao: FuncaoEtapa,
): EtapaPipeline | undefined {
  return etapas.find((e) => e.funcao === funcao);
}

/**
 * O outro lado de uma entrega: o funil para onde este aponta, e a etapa de
 * MESMA ORDEM dentro dele.
 *
 * Casar por `ordem` só é honesto porque os dois funis compartilham o começo da
 * lista — é o que as migrations `20260903170000` e `…210000` garantem: o funil
 * do SDR é o prefixo do de vendas até a etapa de entrega, na ordem 3. Casar por
 * nome quebraria assim que um admin renomeasse uma etapa; casar por posição no
 * array quebraria se um funil ganhasse uma etapa antes do outro.
 *
 * `etapaDaEntrega` acima é esta mesma regra sem ida ao banco. As duas têm que
 * continuar concordando.
 */
export async function destinoDaEntrega(
  supabase: Cliente,
  pipelineOrigemId: string | null | undefined,
  ordem: number,
): Promise<{ pipeline: Pipeline; etapa: EtapaPipeline } | null> {
  if (!pipelineOrigemId) return null;

  const { data: origem } = await supabase
    .from("pipelines")
    .select("*")
    .eq("id", pipelineOrigemId)
    .maybeSingle();
  if (!origem?.pipeline_destino_id) return null;

  const [{ data: destino }, { data: etapa }] = await Promise.all([
    supabase.from("pipelines").select("*").eq("id", origem.pipeline_destino_id).maybeSingle(),
    supabase
      .from("etapas_pipeline")
      .select("*")
      .eq("pipeline_id", origem.pipeline_destino_id)
      .eq("ordem", ordem)
      .maybeSingle(),
  ]);

  if (!destino || !etapa) return null;
  return { pipeline: destino, etapa };
}

/**
 * A MESMA regra de `destinoDaEntrega`, para quem já tem as duas listas de
 * etapas na mão e não precisa ir ao banco de novo.
 *
 * Existe porque os dois caminhos da entrega divergiram: arrastar o card usava
 * `destinoDaEntrega` (etapa de mesma ordem, "Demonstração Agendada") e o botão
 * "Entregar ao vendedor" usava `etapaComFuncao(…, "entrada")` ("Novo Lead").
 * Mesma intenção, duas colunas diferentes. Vale a de mesma ordem: o lead chega
 * ao vendedor COM reunião marcada, não como lead novo.
 */
export function etapaDaEntrega(
  etapasOrigem: EtapaPipeline[],
  etapasDestino: EtapaPipeline[],
): EtapaPipeline | undefined {
  const entrega = etapaComFuncao(etapasOrigem, "entrega");
  if (!entrega) return undefined;
  return etapasDestino.find((e) => e.ordem === entrega.ordem);
}

/** O funil de onde vêm os leads deste aqui — o outro lado do handoff. */
export async function carregarFunilDeOrigem(
  supabase: Cliente,
  pipelineId: string | null | undefined,
): Promise<Pipeline | null> {
  if (!pipelineId) return null;
  const { data } = await supabase
    .from("pipelines")
    .select("*")
    .eq("pipeline_destino_id", pipelineId)
    .maybeSingle();
  return data ?? null;
}

/**
 * O par que quase toda tela precisa: o funil e as etapas dele, numa ida só ao
 * banco por vez. Devolve `pipeline: null` quando o tenant ainda não tem aquele
 * funil — é o que a Fase 4 usa para esconder o board do SDR de quem não o tem.
 */
export async function carregarFunil(
  supabase: Cliente,
  chave: ChavePipeline = PIPELINE_VENDAS,
): Promise<{ pipeline: Pipeline | null; etapas: EtapaPipeline[] }> {
  const pipeline = await carregarPipeline(supabase, chave);
  return { pipeline, etapas: await carregarEtapas(supabase, pipeline?.id) };
}
