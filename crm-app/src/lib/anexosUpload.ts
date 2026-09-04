"use client";

/**
 * Subir um arquivo do navegador DIRETO para o Storage.
 *
 * **Por que não passa pela rota.** Três tetos, todos abaixo do nosso, e
 * qualquer um deles quebra de um jeito ilegível: a Vercel corta o corpo de uma
 * função serverless em ~4,5 MB; o próprio Next clona e bufferiza o corpo em
 * memória com teto padrão de 10 MB (`proxyClientMaxBodySize`, lido em
 * `node_modules/next/dist/docs/`); e o nosso teto por arquivo é 15 MB
 * (`TAMANHO_MAXIMO`). Então nenhum byte de arquivo passa pelo route handler —
 * nem por `formData()`, nem por base64 em JSON. A rota recebe só ids.
 *
 * Isso só é possível porque a RLS já autoriza a pessoa certa: `anexos_insert`
 * delega para `negocios` (igual a `mensagens`), e `documentos_insert` casa por
 * `storage.foldername(name)[2] = negocio.id` **com a cláusula do pool** — o
 * conserto da Fase 3b, sem o qual o SDR não conseguiria anexar nada num lead
 * sem dono, que é o caso normal no funil dele.
 *
 * **A ordem é ARQUIVO primeiro, linha depois** — o inverso do `guardarAnexo` do
 * servidor, e de propósito. Lá a linha vem antes porque os bytes estão no
 * provedor e o link expira: gravar `externo_id` é o que torna a busca
 * retentável. Aqui os bytes estão na mão da pessoa — se falhar, ela escolhe o
 * arquivo de novo. Row-first aqui exigiria um UPDATE para carimbar o `caminho`,
 * e `anexos` **não tem política de UPDATE** (só select/insert/delete); e ainda
 * deixaria um chip "não baixado" no compositor para um arquivo que a pessoa vai
 * reenviar em dois segundos. O id é sorteado aqui para o caminho poder ser
 * calculado antes da linha existir.
 */

import { createClient } from "@/lib/supabase/client";
import { TAMANHO_MAXIMO, caminhoDoAnexo, tamanhoLegivel } from "@/lib/anexos";
import type { Tables } from "@/lib/supabase/types";

export type Anexo = Tables<"anexos">;

export type ResultadoDoUpload = { ok: true; anexo: Anexo } | { ok: false; erro: string };

export { tamanhoLegivel };

export async function subirAnexo(params: {
  tenantId: string | null;
  negocioId: string;
  arquivo: File;
}): Promise<ResultadoDoUpload> {
  const { tenantId, negocioId, arquivo } = params;

  // Recusado ANTES de subir: o bucket também recusaria, mas depois de a pessoa
  // esperar o upload inteiro de um arquivo que nunca teve chance.
  if (arquivo.size > TAMANHO_MAXIMO) {
    return {
      ok: false,
      erro: `${arquivo.name} tem ${tamanhoLegivel(arquivo.size)} e o teto por arquivo é ${tamanhoLegivel(TAMANHO_MAXIMO)}.`,
    };
  }
  if (arquivo.size === 0) {
    return { ok: false, erro: `${arquivo.name} está vazio.` };
  }

  const supabase = createClient();
  const id = crypto.randomUUID();
  // A MESMA função do servidor. Duas implementações do caminho divergiriam, e o
  // arquivo ficaria ilegível sem erro nenhum na subida — o segundo segmento é o
  // que a política do bucket casa.
  const caminho = caminhoDoAnexo(tenantId || "sem-tenant", negocioId, id, arquivo.name);

  const { error: erroUpload } = await supabase.storage
    .from("documentos")
    .upload(caminho, arquivo, {
      contentType: arquivo.type || "application/octet-stream",
      // `false` de propósito: colisão de caminho exige colisão de uuid. Se
      // acontecer, é para dar erro, não para sobrescrever o arquivo de alguém.
      upsert: false,
    });
  if (erroUpload) {
    return { ok: false, erro: `Não foi possível subir ${arquivo.name}: ${erroUpload.message}` };
  }

  const { data: linha, error: erroLinha } = await supabase
    .from("anexos")
    .insert({
      id,
      tenant_id: tenantId,
      negocio_id: negocioId,
      nome: arquivo.name,
      mime: arquivo.type || null,
      tamanho: arquivo.size,
      caminho,
      origem: "upload",
      baixado_em: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (erroLinha || !linha) {
    // O arquivo subiu e a linha não entrou: sem isto ele ficaria no bucket para
    // sempre, invisível para toda a interface — ninguém tem como achá-lo.
    await supabase.storage.from("documentos").remove([caminho]);
    return { ok: false, erro: erroLinha?.message || `Não foi possível registrar ${arquivo.name}.` };
  }

  return { ok: true, anexo: linha };
}

/** Descarta um anexo que a pessoa tirou do rascunho antes de enviar. */
export async function descartarAnexo(anexo: Anexo): Promise<void> {
  const supabase = createClient();
  if (anexo.caminho) await supabase.storage.from("documentos").remove([anexo.caminho]);
  await supabase.from("anexos").delete().eq("id", anexo.id);
}
