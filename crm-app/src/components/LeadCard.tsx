"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Clock,
  Mail,
  MessageCircle,
} from "lucide-react";
import type { NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda, iniciais } from "@/lib/types";
import { Ponto, Selo } from "@/components/ui";
import {
  descreverPrazo,
  diasSemContato,
  estaAtrasada,
  formatarDataHora,
  proximaAtividade,
  temAtividadeHoje,
} from "@/lib/atividades";

/**
 * O card do board, nas duas variantes.
 *
 * A variante nao e cosmetica: o vendedor e o SDR olham para coisas
 * diferentes. O vendedor precisa de valor, probabilidade e CNPJ; o SDR precisa
 * saber se o lead respondeu e ha quanto tempo esta parado — em prospeccao o
 * valor e quase sempre zero, e um "R$ 0,00" gigante em todo card e ruido.
 *
 * E UM componente com um `if`, e nao dois arquivos, porque duas copias
 * divergem: neste projeto ja aconteceu com `moverEtapa` (uma tinha fallback de
 * probabilidade, a outra nao) e com `ItemNav`.
 */

export type VarianteDoCard = "vendas" | "sdr";

export function LeadCard({
  negocio,
  variante = "vendas",
}: {
  negocio: NegocioComRelacoes;
  variante?: VarianteDoCard;
}) {
  const comAtividadeHoje = temAtividadeHoje(negocio);
  const dias = diasSemContato(negocio);
  const proxima = proximaAtividade(negocio.atividades_pendentes);
  const proximaAtrasada = estaAtrasada(proxima?.data_agendada);
  const emNutricao = negocio.etapa?.funcao === "nutricao";
  const semCnpj = !negocio.contato?.cnpj;

  const naoLidas = negocio.respostas_nao_lidas ?? 0;
  const respondeu = naoLidas > 0;
  const IconeCanal = negocio.ultima_resposta_canal === "whatsapp" ? MessageCircle : Mail;

  const statusContato = comAtividadeHoje
    ? "Atividade registrada hoje"
    : dias === null
      ? "Nenhuma atividade registrada"
      : `${dias} ${dias === 1 ? "dia" : "dias"} sem contato`;

  // Uma resposta nao lida manda no card: e a coisa mais urgente que pode
  // acontecer com um lead, e ganha do atraso e do "trabalhado hoje".
  const borda = respondeu
    ? "border-info hover:border-info"
    : comAtividadeHoje
      ? "border-ok/40 hover:border-ok"
      : proximaAtrasada
        ? "border-risco/40 hover:border-risco"
        : "border-fio hover:border-fio-forte";

  return (
    <Link
      href={`/negocios/${negocio.id}`}
      className={[
        "foco group block rounded-2xl border bg-superficie p-3.5 shadow-cartao",
        "transition-[border-color] duration-150 ease-out",
        borda,
      ].join(" ")}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Ponto
              tom={comAtividadeHoje ? "ok" : dias === null || dias >= 7 ? "alerta" : "neutro"}
            />
            <h3 className="line-clamp-1 text-corpo font-medium text-tinta">
              {negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo}
            </h3>
            {proxima && (
              <Bell
                className={`h-3.5 w-3.5 shrink-0 ${proximaAtrasada ? "text-risco" : "text-acento"}`}
                aria-hidden
              />
            )}
          </div>
          {negocio.contato?.nome ? (
            <p className="mt-0.5 line-clamp-1 pl-3.5 text-rotulo text-tinta-suave">
              {negocio.contato.nome}
              {negocio.contato.cargo ? ` · ${negocio.contato.cargo}` : ""}
            </p>
          ) : null}
        </div>

        {/* "baixa" nao aparece: um selo cinza em todo card era parte do ruido
            que deixava o board denso. Alta e media continuam. */}
        {negocio.prioridade === "alta" || negocio.prioridade === "media" ? (
          <Selo tom={negocio.prioridade === "alta" ? "risco" : "alerta"}>
            {negocio.prioridade === "alta" ? "Alta" : "Média"}
          </Selo>
        ) : null}
      </div>

      <div className="space-y-1 pl-3.5">
        {/* O sinal de resposta vem PRIMEIRO, acima de tudo. */}
        {respondeu && (
          <p className="flex items-center gap-1 text-rotulo font-medium text-info">
            <IconeCanal className="h-3 w-3 shrink-0" aria-hidden />
            {naoLidas === 1 ? "Respondeu" : `${naoLidas} respostas`}
            {negocio.ultima_resposta_em ? ` · ${formatarDataHora(negocio.ultima_resposta_em)}` : ""}
          </p>
        )}

        <p className="flex items-center gap-1 text-rotulo text-tinta-suave">
          <Clock className="h-3 w-3 shrink-0" aria-hidden /> {statusContato}
        </p>

        {proxima && (
          <p
            className={`flex items-center gap-1 text-rotulo ${proximaAtrasada ? "font-medium text-risco" : "text-tinta-suave"}`}
            title={proxima.titulo || undefined}
          >
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
            {proximaAtrasada ? "Atrasado: " : "Próximo: "}
            {formatarDataHora(proxima.data_agendada)} ({descreverPrazo(proxima.data_agendada)})
          </p>
        )}

        {/* Lead parado em nutricao TEM proximo passo: a data em que o sistema o
            devolve. Sem isto ele aparecia como "sem proximo passo", em ambar,
            como se estivesse esquecido — e e o contrario. */}
        {emNutricao && negocio.retomar_em && (
          <p className="flex items-center gap-1 text-rotulo text-tinta-suave">
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden /> Volta em{" "}
            {formatarDataHora(negocio.retomar_em)}
          </p>
        )}
        {emNutricao && !negocio.retomar_em && (
          <p className="flex items-center gap-1 text-rotulo font-medium text-alerta">
            <CircleAlert className="h-3 w-3 shrink-0" aria-hidden /> Em nutrição sem data de retomada
          </p>
        )}
        {!emNutricao && !proxima && !comAtividadeHoje && (
          <p className="flex items-center gap-1 text-rotulo font-medium text-alerta">
            <CircleAlert className="h-3 w-3 shrink-0" aria-hidden /> Sem próximo passo agendado
          </p>
        )}
      </div>

      {/* O bloco do meio e o que separa as duas variantes. */}
      {variante === "vendas" ? (
        <div className="my-3 flex items-center justify-between gap-2 rounded-xl bg-recuo px-3 py-2">
          <span className="text-corpo-lg font-semibold text-tinta tabular">
            {formatarMoeda(negocio.valor)}
          </span>
          {semCnpj && (
            <Selo tom="alerta" icone={AlertTriangle}>
              Falta CNPJ
            </Selo>
          )}
        </div>
      ) : (
        <div className="my-3" />
      )}

      <div className="flex items-center justify-between border-t border-fio pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-acento-fraco text-[0.625rem] font-semibold text-acento"
            aria-hidden
          >
            {negocio.responsavel ? iniciais(negocio.responsavel.nome) : "—"}
          </span>
          <span className="truncate text-rotulo text-tinta-suave">
            {negocio.responsavel?.nome.split(" ")[0] || "Sem dono"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* A probabilidade e copiada da etapa em todo insert e em todo
              movimento, e nunca editada por negocio — ou seja, todos os cards
              de uma coluna mostravam o MESMO numero. No board do SDR ela nao
              diz nada, entao sai. */}
          {variante === "vendas" && (
            <span className="text-rotulo text-tinta-fraca tabular">
              {negocio.probabilidade ?? 0}%
            </span>
          )}
          <ChevronRight
            className="h-4 w-4 text-tinta-fraca transition-transform duration-150 ease-out group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}
