"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle, FileSignature, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AssinaturasClient({ envelopesIniciais }: { envelopesIniciais: any[] }) {
  const [envelopes, setEnvelopes] = useState(envelopesIniciais);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("envelopes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "envelopes" }, () => {
        supabase
          .from("envelopes")
          .select("*, signatarios(*), proposta:propostas(*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios(*)))")
          .order("criado_em", { ascending: false })
          .then(({ data }) => data && setEnvelopes(data));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "signatarios" }, () => {
        supabase
          .from("envelopes")
          .select("*, signatarios(*), proposta:propostas(*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios(*)))")
          .order("criado_em", { ascending: false })
          .then(({ data }) => data && setEnvelopes(data));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const contadores = {
    acaoNecessaria: envelopes.filter((e) => e.status === "enviado" || e.status === "aguardando").length,
    concluido: envelopes.filter((e) => e.status === "concluido").length,
    cancelado: envelopes.filter((e) => e.status === "cancelado").length,
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <FileSignature className="h-5 w-5 text-indigo-600" />
        <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Assinaturas</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-2xl font-extrabold text-amber-600">{contadores.acaoNecessaria}</p>
          <p className="text-[11px] font-bold text-slate-500 uppercase">Aguardando assinatura</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-2xl font-extrabold text-emerald-600">{contadores.concluido}</p>
          <p className="text-[11px] font-bold text-slate-500 uppercase">Concluídas</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-2xl font-extrabold text-slate-400">{contadores.cancelado}</p>
          <p className="text-[11px] font-bold text-slate-500 uppercase">Canceladas</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
        {envelopes.length === 0 && <p className="p-6 text-xs text-slate-400 text-center">Nenhum envelope de assinatura ainda.</p>}
        {envelopes.map((env) => {
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
                    <p className="text-xs text-slate-500">Vendedor: {negocio?.responsavel?.nome || "—"}</p>
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
                      <Download className="h-3.5 w-3.5" /> Baixar técnica assinada
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
