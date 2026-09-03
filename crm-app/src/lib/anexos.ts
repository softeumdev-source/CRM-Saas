/**
 * Guardar o arquivo que o cliente mandou.
 *
 * Até agora o CRM destruía todo anexo na entrada: o e-mail pulava qualquer
 * parte com `filename`, e o WhatsApp virava a string "[documento: x.pdf]" sem
 * o id da mídia — e como o link da Meta expira, o arquivo ficava
 * irrecuperável.
 *
 * A regra que decide o desenho: **a linha é gravada mesmo quando o download
 * falha**. Guardar `externo_id` com o erro deixa a busca retentável; devolver
 * um erro e não gravar nada perderia o arquivo para sempre, porque o webhook da
 * Meta não reentrega o que já respondeu 200.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** Teto por arquivo. O bucket para em 20 MB; a folga é para o base64 do caminho. */
export const TAMANHO_MAXIMO = 15 * 1024 * 1024;

/** Teto por mensagem, contra um e-mail com cinquenta imagens de assinatura. */
export const ANEXOS_POR_MENSAGEM = 10;

export type AnexoParaGuardar = {
  tenantId: string | null;
  negocioId: string;
  mensagemId: string | null;
  nome: string;
  mime: string | null;
  origem: "gmail" | "whatsapp" | "upload" | "proposta";
  externoId: string | null;
  /** Devolve os bytes. Só é chamada se o anexo passar nos tetos. */
  baixar: () => Promise<Buffer>;
  /** Quando o provedor já informa; evita baixar o que vai ser recusado. */
  tamanhoDeclarado?: number | null;
};

/**
 * Caminho no bucket `documentos`.
 *
 * O segundo segmento TEM que ser o id do negócio: as políticas do bucket casam
 * por `storage.foldername(name)[2]`. Mudar a forma daqui torna o arquivo
 * ilegível para todo mundo, sem erro nenhum na subida.
 */
export function caminhoDoAnexo(tenantId: string, negocioId: string, anexoId: string, nome: string): string {
  // Nome de arquivo do cliente é entrada não confiável. Três limpezas, e as
  // três apareceram numa passada de teste:
  //
  // - o que não é seguro vira `_` (barra some, então não dá para criar pasta);
  // - `..` colapsa, senão `../../../etc/passwd` sobrevive como `.._.._..` — sem
  //   escapar de nada, mas feio e capaz de confundir ferramenta que leia o nome;
  // - `!!!` virava `_`, que é truthy, e o `|| "arquivo"` nunca disparava. Por
  //   isso o teste é "sobrou alguma letra?", e não "a string está vazia?".
  const limpo = nome
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._\- ]+/, "")
    .slice(0, 120)
    .trim();
  return `${tenantId}/${negocioId}/anexos/${anexoId}-${/\w/.test(limpo) ? limpo : "arquivo"}`;
}

export type ResultadoDoAnexo = "guardado" | "duplicado" | "grande_demais" | "falhou";

export async function guardarAnexo(
  admin: SupabaseClient<Database>,
  a: AnexoParaGuardar,
): Promise<ResultadoDoAnexo> {
  // A linha primeiro, o arquivo depois: é ela que segura o `externo_id` para a
  // retentativa, e o índice único é o que impede a reentrega do provedor
  // gravar o mesmo anexo duas vezes.
  const { data: linha, error: erroLinha } = await admin
    .from("anexos")
    .insert({
      tenant_id: a.tenantId,
      negocio_id: a.negocioId,
      mensagem_id: a.mensagemId,
      nome: a.nome,
      mime: a.mime,
      tamanho: a.tamanhoDeclarado ?? null,
      origem: a.origem,
      externo_id: a.externoId,
    })
    .select("id")
    .single();

  if (erroLinha) {
    if (erroLinha.code === "23505") return "duplicado";
    return "falhou";
  }

  if (a.tamanhoDeclarado != null && a.tamanhoDeclarado > TAMANHO_MAXIMO) {
    await admin
      .from("anexos")
      .update({ erro: `arquivo de ${Math.round(a.tamanhoDeclarado / 1024 / 1024)} MB acima do teto` })
      .eq("id", linha.id);
    return "grande_demais";
  }

  try {
    const bytes = await a.baixar();
    if (bytes.byteLength > TAMANHO_MAXIMO) {
      await admin.from("anexos").update({ erro: "arquivo acima do teto" }).eq("id", linha.id);
      return "grande_demais";
    }

    const caminho = caminhoDoAnexo(a.tenantId || "sem-tenant", a.negocioId, linha.id, a.nome);
    const { error: erroUpload } = await admin.storage
      .from("documentos")
      .upload(caminho, bytes, { contentType: a.mime || "application/octet-stream", upsert: true });
    if (erroUpload) throw new Error(erroUpload.message);

    await admin
      .from("anexos")
      .update({ caminho, tamanho: bytes.byteLength, baixado_em: new Date().toISOString(), erro: null })
      .eq("id", linha.id);
    return "guardado";
  } catch (e) {
    // Sem `throw`: a mensagem já foi gravada, e derrubar o webhook por causa do
    // arquivo faria a Meta reentregar a mensagem inteira.
    await admin
      .from("anexos")
      .update({ erro: e instanceof Error ? e.message : "falha ao baixar o anexo" })
      .eq("id", linha.id);
    return "falhou";
  }
}
