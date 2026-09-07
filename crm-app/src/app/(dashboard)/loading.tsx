/**
 * O que aparece entre o clique na navbar e a proxima tela do painel.
 *
 * NAO e o "carregando" das telas que ja se viram sozinhas (a inbox, o kanban, a
 * agenda): essas continuam com o estado delas. Este e o da NAVEGACAO entre
 * paginas — o vao em que, ate agora, a tela anterior ficava congelada sem
 * nenhum sinal de que o clique tinha sido registrado.
 *
 * Sobrio de proposito (DESIGN.md §278: nada roda em laco, nada toca sozinho).
 * Por isso NAO tem spinner nem `animate-pulse`: os dois giram em laco, e um CRM
 * aberto oito horas por dia nao precisa de movimento que chame atencao. Blocos
 * parados na cor de `recuo` dizem "vem conteudo aqui" sem piscar.
 *
 * Tambem nao tem `surge`: uma entrada de 220ms num aviso que costuma durar 150ms
 * atrasaria justamente o sinal que este arquivo existe para dar.
 *
 * Server Component (sem "use client"): nao ha estado nem evento. E, como manda a
 * doc do `loading.js`, ele nao cobre o `(dashboard)/layout.tsx` acima dele —
 * aquele layout le a sessao no Supabase e a primeira carga continua esperando
 * por ela. Este cobre a troca de pagina, que e onde a espera aparece.
 */

const BLOCOS = [0, 1, 2, 3, 4, 5];

export default function CarregandoPainel() {
  return (
    <div
      className="mx-auto w-full max-w-pagina px-4 sm:px-6 py-6"
      role="status"
      aria-live="polite"
    >
      {/* Cor sozinha nao e informacao: quem usa leitor de tela ouve a frase. */}
      <span className="sr-only">Carregando a tela…</span>

      <div aria-hidden>
        <div className="h-6 w-56 max-w-full rounded-lg bg-recuo" />
        <div className="mt-2 h-4 w-80 max-w-full rounded-lg bg-recuo" />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {BLOCOS.map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border border-fio bg-superficie shadow-cartao"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
