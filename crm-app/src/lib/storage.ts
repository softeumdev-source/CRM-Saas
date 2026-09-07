import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Os dois buckets, e por que deixou de ser um.
 *
 * `documentos` guarda a proposta gerada; `assinatura-publica` guarda o que vai
 * para o cliente assinar e o resultado assinado. O nome do segundo mente desde
 * que ele fechou — era público, deixou de ser —, e o nome fica porque renomear
 * bucket é mover objeto, não é renomear.
 *
 * Isto era um `const BUCKET = "documentos"` só. Enquanto os PDFs assinados eram
 * gravados como URL ABSOLUTA, a distinção não aparecia: `urlAssinada` caía no
 * ramo de URL e devolvia a string. Com o caminho relativo, assinar no bucket
 * errado devolve URL que dá 404 — e os botões "Baixar assinada" do vendedor
 * quebrariam em silêncio.
 */
export type BucketDeDocumento = "documentos" | "assinatura-publica";
const BUCKET_PADRAO: BucketDeDocumento = "documentos";

/**
 * Abre um PDF do Storage numa aba nova.
 *
 * O banco guarda o CAMINHO dentro do bucket, nao uma URL — e o bucket e
 * privado, entao a URL precisa ser assinada na hora. A tela de Assinaturas
 * usava o caminho cru no href e os links de "baixar assinada" davam 404.
 *
 * Aceita URL completa tambem: propostas antigas guardaram links absolutos
 * antes de o bucket existir.
 */
export async function abrirPdf(
  caminho: string | null | undefined,
  bucket: BucketDeDocumento = BUCKET_PADRAO,
): Promise<boolean> {
  if (!caminho) return false;
  const url = await urlAssinada(caminho, bucket);
  if (!url) return false;
  window.open(url, "_blank", "noopener");
  return true;
}

/**
 * A URL assinada de um arquivo do bucket, sem abrir nada.
 *
 * Existe separada de `abrirPdf` porque a lista de anexos precisa da URL para
 * decidir o que fazer (abrir aba, mostrar erro), e não de um efeito colateral
 * que devolve `boolean`. `abrirPdf` passou a usar esta — duas implementações da
 * mesma assinatura acabariam divergindo no tempo de expiração.
 *
 * Cinco minutos é de propósito: tempo de clicar e ver, não de virar link
 * compartilhável.
 */
/**
 * O prefixo do Storage deste projeto. Um caminho absoluto só é aceito se
 * começar por aqui.
 *
 * O ATALHO DE LEGADO ERA `caminho.startsWith("http")` — QUALQUER endereço
 * passava e ia direto para o `window.open`. Combinado com a
 * `salvar_pdf_assinado`, que era SECURITY DEFINER aberta a `anon` e gravava a
 * string que recebesse, dava isto: quem tivesse um token de assinatura fazia o
 * botão "Baixar assinada" DO CRM abrir a página que quisesse, com cara de
 * contrato, dentro da sessão de quem clicou. A função no banco já foi fechada
 * (migration 20260906140000); esta é a segunda tranca, do lado de cá, para o
 * que já está gravado.
 */
const PREFIXO_STORAGE = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/`;

export async function urlAssinada(
  caminho: string | null | undefined,
  bucket: BucketDeDocumento = BUCKET_PADRAO,
): Promise<string | null> {
  if (!caminho) return null;

  // Propostas antigas guardaram URL absoluta antes de o bucket existir — mas
  // só as do Storage deste projeto continuam valendo.
  if (/^[a-z][a-z0-9+.-]*:/i.test(caminho)) {
    return caminho.startsWith(PREFIXO_STORAGE) ? caminho : null;
  }

  const { data } = await createClient().storage.from(bucket).createSignedUrl(caminho, 60 * 5);
  return data?.signedUrl ?? null;
}
