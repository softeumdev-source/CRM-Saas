import { createClient } from "@/lib/supabase/server";
import { ListaClient } from "@/components/ListaClient";
import {
  CHAVES_PIPELINE,
  NENHUM_FUNIL,
  carregarEtapas,
  carregarPipeline,
  type Pipeline,
} from "@/lib/pipelines";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO } from "@/lib/types";

/**
 * Teto da primeira carga. A consulta era ilimitada: no volume alvo de 500-2000
 * leads/mês ela passaria a trazer milhares de linhas com relações completas
 * toda vez que a tela abre. A tela diz quantos existem e oferece carregar mais,
 * em vez de fingir que o que veio é tudo.
 */
export const LOTE_LISTA = 200;

/**
 * A LISTA DE LEADS PASSA A VER OS DOIS FUNIS.
 *
 * O BUG QUE ISTO FECHA: esta página chamava `carregarPipeline(supabase)` sem
 * chave, e o padrão dessa função é `vendas`. A tela se chama "Lista de Leads" na
 * navegação, mas o recorte era o funil do VENDEDOR — 17 negócios. Os 216 leads
 * de prospecção vivem no funil `sdr` e simplesmente não estavam aqui: procurar
 * qualquer um deles pelo nome devolvia "nenhum negócio encontrado", que não é
 * uma lista vazia, é uma resposta errada.
 *
 * Não há risco de alguém ver o que não podia: quem recorta continua sendo a RLS
 * de `negocios` (`negocios_select`), que já é "sou admin, OU o negócio é meu, OU
 * ele está sem dono num funil que o meu papel opera". Passar os dois funis aqui
 * só deixa de ESTREITAR o que a RLS já permitia — um vendedor com um lead de
 * prospecção no nome dele passa a achá-lo, e continua sem ver os dos outros.
 */
export default async function ListaPage() {
  const supabase = await createClient();

  const funis = (
    await Promise.all(CHAVES_PIPELINE.map((chave) => carregarPipeline(supabase, chave)))
  ).filter((p): p is Pipeline => p !== null);

  // `NENHUM_FUNIL` pelo mesmo motivo de sempre: um `.in()` com array vazio é
  // sintaxe inválida no PostgREST e derrubaria a tela em vez de mostrá-la vazia.
  const idsDosFunis = funis.length ? funis.map((f) => f.id) : [NENHUM_FUNIL];

  const [{ data: negocios, count }, etapasDeCadaFunil] = await Promise.all([
    supabase
      .from("negocios")
      .select(SELECT_NEGOCIO_COMPLETO, { count: "exact" })
      .in("pipeline_id", idsDosFunis)
      .order("criado_em", { ascending: false })
      .range(0, LOTE_LISTA - 1),
    Promise.all(funis.map((f) => carregarEtapas(supabase, f.id))),
  ]);

  return (
    <ListaClient
      funis={funis}
      negocios={(negocios as unknown as NegocioComRelacoes[]) || []}
      total={count ?? 0}
      lote={LOTE_LISTA}
      etapas={etapasDeCadaFunil.flat() as EtapaPipeline[]}
    />
  );
}
