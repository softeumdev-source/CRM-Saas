"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle, Download, FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function DocumentosAssinadosTab({ envelopesIniciais }: { envelopesIniciais: any[] }) {
  const [envelopes, setEnvelopes] = useState(envelopesIniciais);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "concluido" | "aguardando">("todos");

  useEffect(() => {
    const supabase = createClient();

    const recarregar = async () => {
      const { data } = await supabase
        .from("envelopes")
        .select("*, signatarios(*), proposta:propostas(*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios(*)))")
        .order("criado_em", { ascending: false });
      if (data) setEnvelopes(data);
    };

    const channel = supabase
      .channel("admin-docs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "envelopes" }, recarregar)
      .on("postgres_changes", { event: "*", schema: "public", table: "signatarios" }, recarregar)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtrados = envelopes.filter((e) => {
    if (filtroStatus === "concluido") return e.status === "concluido";
    if (filtroStatus === "aguardando") return e.status === "enviado" || e.status === "aguardando";
    return true;
  });

  const contadores = {
    todos: envelopes.length,
    aguardando: envelopes.filter((e) => e.status === "enviado" || e.status === "aguardando").length,
    concluido: envelopes.filter((e) => e.status === "concluido").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-5 w-5 text-indigo-600" />
        <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">Documentos Assinados — Todos os Vendedores</h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {([
          { key: "todos", label: "Total", cor: "text-indigo-600", valor: contadores.todos },
          { key: "aguardando", label: "Aguardando", cor: "text-amber-600", valor: contadores.aguardando },
          { key: "concluido", label: "Concluidas", cor: "text-emerald-600", valor: contadores.concluido },
        ] as const).map((c) => (
          <button
            key={c.key}
            onClick={() => setFiltroStatus(c.key)}
            className={`bg-white dark:bg-slate-900 p-4 rounded-2xl border text-center transition-all ${
              filtroStatus === c.key
                ? "border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900"
                : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
            }`}
          >
            <p className={`text-2xl font-extrabold ${c.cor}`}>{c.valor}</p>
            <p className="text-[11px] font-bold text-slate-500 uppercase">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
        {filtrados.length === 0 && <p className="p-6 text-xs text-slate-400 text-center">Nenhum envelope encontrado.</p>}
        {filtrados.map((env) => {
          const negocio = env.proposta?.negocio;
          const assinadoComercial = env.proposta?.pdf_assinado_comercial_path;
          const assinadoTecnica = env.proposta?.pdf_assinado_tecnica_path;
          return (
            <div key={env.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <Link href={negocio ? `/negocios/${negocio.id}` : "#"} className="block">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {negocio?.contato?.empresa || negocio?.contato?.nome} — Proposta {env.proposta?.numero}
                    </p>
                    <p className="text-xs text-slate-500">
                      Vendedor: {negocio?.responsavel?.nome || "—"}
                      {env.criado_em && <> · Enviado em {new Date(env.criado_em).toLocaleDateString("pt-BR")}</>}
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${
                      env.status === "concluido"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : env.status === "cancelado"
                          ? "bg-slate-100 text-slate-500 dark:bg-slate-800"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {env.status === "concluido" ? <CheckCircle2 className="h-3.5 w-3.5" /> : env.status === "cancelado" ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    {env.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {env.signatarios?.map((s: any) => (
                    <span
                      key={s.id}
                      className={`text-[11px] px-2 py-1 rounded-lg font-semibold ${
                        s.status === "assinado" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                      }`}
                    >
                      {s.nome} ({s.papel}): {s.status}
                    </span>
                  ))}
                </div>
              </Link>
              {(assinadoComercial || assinadoTecnica) && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {assinadoComercial && (
                    <a href={assinadoComercial} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-800">
                      <Download className="h-3.5 w-3.5" /> Baixar comercial assinada
                    </a>
                  )}
                  {assinadoTecnica && (
                    <a href={assinadoTecnica} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-800">
                      <Download className="h-3.5 w-3.5" /> Baixar tecnica assinada
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
