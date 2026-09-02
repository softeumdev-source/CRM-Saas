"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle, FileSignature, Download, Search, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { assinarRealtime } from "@/lib/supabase/realtime";

export function AssinaturasClient({ envelopesIniciais }: { envelopesIniciais: any[] }) {
  const [envelopes, setEnvelopes] = useState(envelopesIniciais);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    const recarregar = () => {
      createClient()
        .from("envelopes")
        .select("*, signatarios(*), proposta:propostas(*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios(*)))")
        .order("criado_em", { ascending: false })
        .then(({ data }) => data && setEnvelopes(data));
    };
    return assinarRealtime("envelopes-realtime", (canal) =>
      canal
        .on("postgres_changes", { event: "*", schema: "public", table: "envelopes" }, recarregar)
        .on("postgres_changes", { event: "*", schema: "public", table: "signatarios" }, recarregar)
        .on("postgres_changes", { event: "*", schema: "public", table: "propostas" }, recarregar)
    );
  }, []);

  const contadores = {
    acaoNecessaria: envelopes.filter((e) => e.status === "enviado" || e.status === "aguardando").length,
    concluido: envelopes.filter((e) => e.status === "concluido").length,
    cancelado: envelopes.filter((e) => e.status === "cancelado").length,
  };

  const termo = busca.trim().toLowerCase();
  const termoDigitos = termo.replace(/\D/g, "");
  const envelopesFiltrados = !termo
    ? envelopes
    : envelopes.filter((env) => {
        const contato = env.proposta?.negocio?.contato;
        const cnpjDigitos = (contato?.cnpj || "").replace(/\D/g, "");
        if (termoDigitos.length >= 3 && cnpjDigitos.includes(termoDigitos)) return true;
        const campos = [
          contato?.empresa,
          contato?.nome,
          contato?.cnpj,
          contato?.email,
          env.proposta?.numero,
          env.proposta?.negocio?.responsavel?.nome,
          ...(env.signatarios || []).flatMap((s: any) => [s.nome, s.email]),
        ];
        return campos.some((v) => v && String(v).toLowerCase().includes(termo));
      });

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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por empresa, nome, CNPJ, e-mail, nº da proposta ou signatário..."
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-hidden"
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
        {envelopes.length === 0 && <p className="p-6 text-xs text-slate-400 text-center">Nenhum envelope de assinatura ainda.</p>}
        {envelopes.length > 0 && envelopesFiltrados.length === 0 && (
          <p className="p-6 text-xs text-slate-400 text-center">Nenhum contrato encontrado para &quot;{busca}&quot;.</p>
        )}
        {envelopesFiltrados.map((env) => {
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
                    {env.status === "concluido" ? <CheckCircle2 className="h-3.5 w-3.5" /> : env.status === "cancelado" ? <XCircle className="h-3.5 w-3.5" /> : env.status === "aguardando" ? <Eye className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    {env.status === "concluido"
                      ? "concluído"
                      : env.status === "cancelado"
                        ? "cancelado"
                        : env.status === "aguardando"
                          ? "cliente visualizou"
                          : "enviado"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[...(env.signatarios || [])]
                    .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
                    .map((s: any) => (
                      <span
                        key={s.id}
                        title={
                          s.status === "assinado" && s.assinado_em
                            ? `Assinado em ${new Date(s.assinado_em).toLocaleString("pt-BR")}`
                            : s.status === "visualizado" && s.visualizado_em
                              ? `Visualizou em ${new Date(s.visualizado_em).toLocaleString("pt-BR")}`
                              : "Ainda não visualizou o documento"
                        }
                        className={`text-[11px] px-2 py-1 rounded-lg font-semibold flex items-center gap-1 ${
                          s.status === "assinado"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
                            : s.status === "visualizado"
                              ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                        }`}
                      >
                        {s.status === "visualizado" && <Eye className="h-3 w-3" />}
                        {s.nome} ({s.papel}): {s.status === "assinado" ? "assinado" : s.status === "visualizado" ? "visualizou" : "aguardando"}
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
