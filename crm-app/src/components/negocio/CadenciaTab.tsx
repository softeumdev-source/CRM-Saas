"use client";

import { useState } from "react";
import {
  PhoneCall,
  Mail,
  Video,
  FileText,
  MessageSquare,
  Users,
  CheckCircle2,
  Bell,
  BellOff,
  Plus,
  Clock,
  ArrowLeftRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Atividade, TipoAtividade, Usuario } from "@/lib/types";
import { TIPOS_ATIVIDADE } from "@/lib/types";

const ICONES: Record<string, any> = {
  ligacao: PhoneCall,
  email: Mail,
  demo: Video,
  proposta: FileText,
  nota: MessageSquare,
  whatsapp: MessageSquare,
  reuniao: Users,
  mudanca_etapa: ArrowLeftRight,
};

const ROTULOS: Record<string, string> = {
  ligacao: "Ligacao",
  email: "E-mail",
  demo: "Demonstracao",
  proposta: "Proposta",
  nota: "Nota interna",
  whatsapp: "WhatsApp",
  reuniao: "Reuniao",
  mudanca_etapa: "Mudanca de etapa",
};

type AtividadeComUsuario = Atividade & { usuario: Usuario | null };

export function CadenciaTab({
  negocioId,
  atividadesIniciais,
  usuarioAtual,
}: {
  negocioId: string;
  atividadesIniciais: AtividadeComUsuario[];
  usuarioAtual: Usuario;
}) {
  const [atividades, setAtividades] = useState(atividadesIniciais);
  const [tipo, setTipo] = useState<TipoAtividade>("ligacao");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataAgendada, setDataAgendada] = useState("");
  const [lembreteAtivo, setLembreteAtivo] = useState(false);
  const [lembreteData, setLembreteData] = useState("");
  const [salvando, setSalvando] = useState(false);

  const proximosPassos = atividades.filter((a) => !a.concluida && a.data_agendada);
  const historico = atividades.filter((a) => a.concluida || !a.data_agendada);

  const handleAdicionar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSalvando(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("atividades")
      .insert({
        negocio_id: negocioId,
        usuario_id: usuarioAtual.id,
        tipo,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        data_agendada: dataAgendada ? new Date(dataAgendada).toISOString() : null,
        lembrete_data: lembreteAtivo && lembreteData ? new Date(lembreteData).toISOString() : null,
      })
      .select("*, usuario:usuarios(*)")
      .single();
    setSalvando(false);
    if (!error && data) {
      setAtividades((prev) => [data as AtividadeComUsuario, ...prev]);
      setTitulo("");
      setDescricao("");
      setDataAgendada("");
      setLembreteAtivo(false);
      setLembreteData("");
    }
  };

  const marcarConcluida = async (id: string) => {
    setAtividades((prev) => prev.map((a) => (a.id === id ? { ...a, concluida: true } : a)));
    const supabase = createClient();
    await supabase.from("atividades").update({ concluida: true }).eq("id", id);
  };

  return (
    <div className="grid lg:grid-cols-[1.1fr_1.6fr] gap-5">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4 h-fit">
        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Registrar passo de cadencia</h3>
        <form onSubmit={handleAdicionar} className="space-y-3">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoAtividade)}
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
          >
            {TIPOS_ATIVIDADE.filter((t) => t !== "mudanca_etapa").map((t) => (
              <option key={t} value={t}>{ROTULOS[t]}</option>
            ))}
          </select>
          <input
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Titulo (ex: Ligar para follow-up)"
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
          />
          <textarea
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Detalhes, contexto ou resultado..."
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
          />
          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">Proxima acao agendada para</label>
            <input
              type="datetime-local"
              value={dataAgendada}
              onChange={(e) => setDataAgendada(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          <div className="p-3 rounded-xl border border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
              <input
                type="checkbox"
                checked={lembreteAtivo}
                onChange={(e) => setLembreteAtivo(e.target.checked)}
              />
              {lembreteAtivo ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              Me notificar com alerta nesta data/hora
            </label>
            {lembreteAtivo && (
              <input
                type="datetime-local"
                value={lembreteData}
                onChange={(e) => setLembreteData(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> Registrar na cadencia
          </button>
        </form>
      </div>

      <div className="space-y-5">
        {proximosPassos.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3">Proximos passos</h3>
            <div className="space-y-2">
              {proximosPassos.map((a) => {
                const Icon = ICONES[a.tipo] || MessageSquare;
                return (
                  <div key={a.id} className="flex items-start gap-3 p-3 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900">
                    <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{a.titulo}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {a.data_agendada && new Date(a.data_agendada).toLocaleString("pt-BR")}
                        {a.lembrete_data && (
                          <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold ml-2">
                            <Bell className="h-3 w-3" /> alerta configurado
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => marcarConcluida(a.id)}
                      className="text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 px-2.5 py-1.5 rounded-lg"
                    >
                      Concluir
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3">Historico ({historico.length})</h3>
          <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {historico.map((a) => {
              const Icon = ICONES[a.tipo] || MessageSquare;
              return (
                <div key={a.id} className="relative pl-9">
                  <div className="absolute left-1 top-1 h-5 w-5 rounded-full bg-slate-400 text-white flex items-center justify-center ring-4 ring-white dark:ring-slate-900">
                    {a.concluida ? <CheckCircle2 className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{a.titulo}</span>
                      <span className="text-[10px] text-slate-400">
                        {a.criado_em && new Date(a.criado_em).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {a.descricao && <p className="text-xs text-slate-600 dark:text-slate-300">{a.descricao}</p>}
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">Por {a.usuario?.nome || "Sistema"}</p>
                  </div>
                </div>
              );
            })}
            {historico.length === 0 && <p className="text-xs text-slate-400">Nenhum registro ainda.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
