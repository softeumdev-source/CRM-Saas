"use client";

import Link from "next/link";
import { Building2, Clock, ChevronRight, Flame, Bell, CalendarClock } from "lucide-react";
import type { NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda, iniciais } from "@/lib/types";

const PRIORIDADE_COR: Record<string, string> = {
  alta: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  media: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  baixa: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

export function LeadCard({ negocio }: { negocio: NegocioComRelacoes }) {
  const hoje = new Date().toDateString();
  const comAtividadeHoje = negocio.ultima_atividade_em ? new Date(negocio.ultima_atividade_em).toDateString() === hoje : false;
  const proximaAtividade = (negocio.atividades_pendentes || [])
    .filter((a) => !a.concluida && a.data_agendada)
    .sort((a, b) => new Date(a.data_agendada!).getTime() - new Date(b.data_agendada!).getTime())[0];

  return (
    <Link
      href={`/negocios/${negocio.id}`}
      className="group block bg-white dark:bg-slate-800/90 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-xs hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-200 relative overflow-hidden"
    >
      {negocio.prioridade === "alta" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-rose-500" />
      )}

      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${comAtividadeHoje ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
              {negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo}
            </h3>
            {proximaAtividade && <Bell className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium pl-5 mt-0.5 line-clamp-1">
            {negocio.contato?.nome} {negocio.contato?.cargo ? `• ${negocio.contato.cargo}` : ""}
          </p>
          {proximaAtividade && (
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold pl-5 mt-0.5 flex items-center gap-1">
              <CalendarClock className="h-3 w-3" /> {new Date(proximaAtividade.data_agendada!).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
        {negocio.prioridade && (
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border shrink-0 capitalize ${PRIORIDADE_COR[negocio.prioridade]}`}>
            {negocio.prioridade}
          </span>
        )}
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2.5 my-3 flex items-center justify-between border border-slate-100 dark:border-slate-800">
        <div>
          <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Valor</p>
          <p className="text-base font-extrabold text-slate-900 dark:text-slate-100">
            {formatarMoeda(negocio.valor)}
          </p>
        </div>
        {!negocio.contato?.cnpj && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800">
            <Flame className="h-3 w-3" />
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
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
  );
}
