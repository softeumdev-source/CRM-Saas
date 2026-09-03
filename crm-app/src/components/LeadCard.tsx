"use client";

import Link from "next/link";
import { Building2, Clock, ChevronRight, Bell, CalendarClock, AlertTriangle, CircleAlert } from "lucide-react";
import type { NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda, iniciais } from "@/lib/types";
import {
  descreverPrazo,
  diasSemContato,
  estaAtrasada,
  formatarDataHora,
  proximaAtividade,
  temAtividadeHoje,
} from "@/lib/atividades";

const PRIORIDADE_COR: Record<string, string> = {
  alta: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  media: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  baixa: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

export function LeadCard({ negocio }: { negocio: NegocioComRelacoes }) {
  const comAtividadeHoje = temAtividadeHoje(negocio);
  const dias = diasSemContato(negocio);
  const proxima = proximaAtividade(negocio.atividades_pendentes);
  const proximaAtrasada = estaAtrasada(proxima?.data_agendada);
  const emNutricao = negocio.etapa?.funcao === "nutricao";

  const semCnpj = !negocio.contato?.cnpj;
  const statusContato = comAtividadeHoje
    ? "Atividade registrada hoje"
    : dias === null
      ? "Nenhuma atividade registrada"
      : `${dias} ${dias === 1 ? "dia" : "dias"} sem contato`;

  return (
    <Link
      href={`/negocios/${negocio.id}`}
      className={`group block bg-white dark:bg-slate-800/90 rounded-2xl p-4 border shadow-xs hover:shadow-md transition-colors duration-150 ease-out duration-200 relative overflow-hidden ${
        comAtividadeHoje
          ? "border-emerald-200/90 dark:border-emerald-900/70 hover:border-emerald-300"
          : proximaAtrasada
            ? "border-rose-200 dark:border-rose-900/70 hover:border-rose-300"
            : "border-slate-200/90 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-700"
      }`}
    >
      {negocio.prioridade === "alta" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-rose-500" />
      )}

      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              title={statusContato}
              className={`h-2.5 w-2.5 rounded-full shrink-0 ring-2 ${
                comAtividadeHoje
                  ? "bg-emerald-500 ring-emerald-100 dark:ring-emerald-950"
                  : "bg-amber-500 ring-amber-100 dark:ring-amber-950"
              }`}
            />
            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
              {negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo}
            </h3>
            {proxima && <Bell className={`h-3.5 w-3.5 shrink-0 ${proximaAtrasada ? "text-rose-500" : "text-indigo-500"}`} />}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium pl-6 mt-0.5 line-clamp-1">
            {negocio.contato?.nome} {negocio.contato?.cargo ? `• ${negocio.contato.cargo}` : ""}
          </p>
        </div>
        {negocio.prioridade && (
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border shrink-0 capitalize ${PRIORIDADE_COR[negocio.prioridade]}`}>
            {negocio.prioridade}
          </span>
        )}
      </div>

      <div className="pl-6 space-y-1">
        <p
          className={`text-[11px] font-semibold flex items-center gap-1 ${
            comAtividadeHoje
              ? "text-emerald-600 dark:text-emerald-400"
              : dias === null || dias >= 7
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-500 dark:text-slate-400"
          }`}
        >
          <Clock className="h-3 w-3" /> {statusContato}
        </p>
        {proxima && (
          <p
            className={`text-[11px] font-semibold flex items-center gap-1 ${
              proximaAtrasada ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400"
            }`}
            title={proxima.titulo || undefined}
          >
            <CalendarClock className="h-3 w-3" />
            {proximaAtrasada ? "Atrasado: " : "Próximo: "}
            {formatarDataHora(proxima.data_agendada)} ({descreverPrazo(proxima.data_agendada)})
          </p>
        )}
        {/* Lead parado em nutrição TEM próximo passo: a data em que o
            sistema o devolve. Sem isto ele aparecia como "sem próximo passo",
            em âmbar, como se estivesse esquecido — e é o contrário. */}
        {emNutricao && negocio.retomar_em && (
          <p className="text-[11px] font-semibold flex items-center gap-1 text-violet-600 dark:text-violet-400">
            <CalendarClock className="h-3 w-3" /> Volta em {formatarDataHora(negocio.retomar_em)}
          </p>
        )}
        {emNutricao && !negocio.retomar_em && (
          <p className="text-[11px] font-semibold flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <CircleAlert className="h-3 w-3" /> Em nutrição sem data de retomada
          </p>
        )}
        {!emNutricao && !proxima && !comAtividadeHoje && (
          <p className="text-[11px] font-semibold flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <CircleAlert className="h-3 w-3" /> Sem próximo passo agendado
          </p>
        )}
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2.5 my-3 flex items-center justify-between border border-slate-100 dark:border-slate-800">
        <div>
          <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Valor</p>
          <p className="text-base font-extrabold text-slate-900 dark:text-slate-100">
            {formatarMoeda(negocio.valor)}
          </p>
        </div>
        {semCnpj && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-3 w-3" />
            Falta CNPJ
          </span>
        )}
      </div>

      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-extrabold ring-2 ring-white dark:ring-slate-800">
            {negocio.responsavel ? iniciais(negocio.responsavel.nome) : <Clock className="h-3 w-3" />}
          </div>
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate max-w-[100px]">
            {negocio.responsavel?.nome.split(" ")[0] || "Sem dono"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {negocio.probabilidade ?? 0}% Prob.
          </span>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-colors duration-150 ease-out" />
        </div>
      </div>
    </Link>
  );
}
