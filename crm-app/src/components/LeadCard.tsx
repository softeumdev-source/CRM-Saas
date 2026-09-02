"use client";

import Link from "next/link";
import clsx from "clsx";
import type { NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda, iniciais } from "@/lib/types";
import { situacaoDoNegocio, type TomSituacao } from "@/lib/atividades";
import { Badge, ROTULO_PRIORIDADE, TOM_PRIORIDADE } from "@/components/ui";

/**
 * O card no estilo Papel: branco sem contorno sobre a coluna rebaixada, com o
 * valor no serif. Tres blocos, nao sete — quem, quanto, e o que fazer.
 *
 * O que saiu e por que:
 * - a porcentagem de probabilidade e copiada da etapa em todo insert e em todo
 *   movimento (nunca editada por negocio), entao TODO card de uma coluna
 *   mostrava o mesmo numero. Foi para o cabecalho da coluna, que e onde ela
 *   descreve alguma coisa.
 * - a bolinha de status, "N dias sem contato" e "Proximo: ..." diziam a mesma
 *   coisa em tres lugares, as vezes se contradizendo. Viraram uma frase so
 *   (situacaoDoNegocio).
 * - o selo de prioridade "baixa" some: prioridade e um pedido de atencao, e
 *   um selo cinza em todo card e exatamente o ruido que deixava o board denso.
 *   Alta e media continuam aparecendo.
 */

const TOM_TEXTO: Record<TomSituacao, string> = {
  ok: "text-emerald-700",
  neutro: "text-tinta-suave",
  atencao: "text-amber-700",
  perigo: "text-rose-700",
};

export function LeadCard({ negocio }: { negocio: NegocioComRelacoes }) {
  const situacao = situacaoDoNegocio(negocio);
  const contato = negocio.contato;
  const linhaContato = [contato?.nome, contato?.cargo].filter(Boolean).join(" · ");
  const dono = negocio.responsavel;
  const prioridade = negocio.prioridade;

  return (
    <Link
      href={`/negocios/${negocio.id}`}
      className={clsx(
        "flex flex-col gap-2.5 rounded-xl bg-cartao px-4 py-3.5 shadow-cartao",
        // transicoes nomeadas: transform e sombra, nunca transition-all
        "transition-[transform,box-shadow] duration-150 ease-out",
        "hover:-translate-y-px hover:shadow-erguido",
        "focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-acento",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-titulo line-clamp-2 text-tinta">
            {contato?.empresa || contato?.nome || negocio.titulo}
          </span>
          {linhaContato && (
            <span className="text-corpo line-clamp-1 text-tinta-suave">{linhaContato}</span>
          )}
        </div>
        {prioridade && prioridade !== "baixa" && (
          <Badge tom={TOM_PRIORIDADE[prioridade]} className="shrink-0">
            {ROTULO_PRIORIDADE[prioridade] ?? prioridade}
          </Badge>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-serif text-xl leading-none tracking-[-0.008em] tabular-nums text-tinta">
          {formatarMoeda(negocio.valor)}
        </span>
        {!contato?.cnpj && (
          // Sem CNPJ a proposta nao pode ser gerada: e um bloqueio, nao enfeite.
          <span className="text-corpo font-medium text-amber-700">falta CNPJ</span>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-fio pt-2.5">
        <span
          title={situacao.detalhe}
          className={clsx("text-corpo min-w-0 flex-1 truncate font-medium", TOM_TEXTO[situacao.tom])}
        >
          {situacao.texto}
        </span>
        <span
          title={dono ? dono.nome : "Sem dono — está no pool"}
          className={clsx(
            "flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold",
            dono
              ? "bg-stone-100 text-stone-600"
              : "border border-dashed border-tinta-fraca text-tinta-fraca",
          )}
        >
          {dono ? iniciais(dono.nome) : "?"}
        </span>
      </div>
    </Link>
  );
}
