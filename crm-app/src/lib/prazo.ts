/**
 * Impõe um prazo a uma promessa.
 *
 * Existe por causa de uma armadilha concreta: rede bloqueada (proxy, captive
 * portal, VPN caindo) frequentemente NÃO rejeita — ela pendura. Um `await` sem
 * prazo, mesmo dentro de try/catch, deixa a tela em "carregando…" para sempre,
 * sem erro para mostrar e sem nada para o usuário fazer. Já aconteceu neste
 * projeto, numa aba que carrega sob demanda.
 *
 * O prazo não cancela o trabalho em andamento (não dá, com fetch já disparado
 * sem AbortController); ele só garante que a interface volte a ter uma resposta.
 */
export const PRAZO_PADRAO_MS = 12_000;

export class PrazoEsgotado extends Error {
  constructor(ms: number) {
    super(`A resposta demorou mais de ${Math.round(ms / 1000)}s.`);
    this.name = "PrazoEsgotado";
  }
}

/**
 * Aceita `PromiseLike`, e não `Promise`, porque o query builder do Supabase é
 * um thenable: ele tem `.then()` mas não `.catch()` nem `.finally()`. Exigir
 * `Promise` obrigaria todo chamador a embrulhar a consulta em
 * `Promise.resolve(...)` — cerimônia que não protege de nada.
 */
export function comPrazo<T>(promessa: PromiseLike<T>, ms: number = PRAZO_PADRAO_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new PrazoEsgotado(ms)), ms);
    promessa.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}
