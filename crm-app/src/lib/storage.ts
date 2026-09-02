import { createClient } from "@/lib/supabase/client";

/** Bucket unico dos documentos gerados (propostas, contratos assinados). */
const BUCKET = "documentos";

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
export async function abrirPdf(caminho: string | null | undefined): Promise<boolean> {
  if (!caminho) return false;

  if (caminho.startsWith("http")) {
    window.open(caminho, "_blank", "noopener");
    return true;
  }

  const { data } = await createClient().storage.from(BUCKET).createSignedUrl(caminho, 60 * 5);
  if (!data?.signedUrl) return false;
  window.open(data.signedUrl, "_blank", "noopener");
  return true;
}
