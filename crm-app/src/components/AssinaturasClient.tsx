"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle, FileSignature, Download, Search, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { assinarRealtime } from "@/lib/supabase/realtime";
import { abrirPdf } from "@/lib/storage";
import type { EnvelopeComRelacoes } from "@/lib/types";

export function AssinaturasClient({ envelopesIniciais }: { envelopesIniciais: EnvelopeComRelacoes[] }) {
  const [envelopes, setEnvelopes] = useState(envelopesIniciais);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    const recarregar = () => {
      createClient()
        .from("envelopes")
        .select("*, signatarios(*), proposta:propostas(*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios!negocios_responsavel_id_fkey(*)))")
        .order("criado_em", { ascending: false })
        .then(({ data }) => data && setEnvelopes(data as EnvelopeComRelacoes[]));
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
          ...(env.signatarios || []).flatMap((s) => [s.nome, s.email]),
        ];
        return campos.some((v) => v && String(v).toLowerCase().includes(termo));
      });

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <FileSignature className="h-5 w-5 text-acento" />
        <h1 className="text-titulo font-semibold text-tinta">Assinaturas</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-superficie p-4 rounded-2xl border border-fio text-center">
          <p className="text-display font-semibold text-alerta">{contadores.acaoNecessaria}</p>
          <p className="text-rotulo font-semibold text-tinta-suave uppercase">Aguardando assinatura</p>
        </div>
        <div className="bg-superficie p-4 rounded-2xl border border-fio text-center">
          <p className="text-display font-semibold text-ok">{contadores.concluido}</p>
          <p className="text-rotulo font-semibold text-tinta-suave uppercase">Concluídas</p>
        </div>
        <div className="bg-superficie p-4 rounded-2xl border border-fio text-center">
          <p className="text-display font-semibold text-tinta-fraca">{contadores.cancelado}</p>
          <p className="text-rotulo font-semibold text-tinta-suave uppercase">Canceladas</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tinta-fraca" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por empresa, nome, CNPJ, e-mail, nº da proposta ou signatário..."
          className="w-full pl-10 pr-4 py-2.5 text-corpo bg-superficie border border-fio rounded-2xl focus:border-acento focus:ring-1 focus:ring-acento outline-hidden"
        />
      </div>

      <div className="bg-superficie rounded-2xl border border-fio shadow-xs divide-y divide-fio">
        {envelopes.length === 0 && <p className="p-6 text-rotulo text-tinta-fraca text-center">Nenhum envelope de assinatura ainda.</p>}
        {envelopes.length > 0 && envelopesFiltrados.length === 0 && (
          <p className="p-6 text-rotulo text-tinta-fraca text-center">Nenhum contrato encontrado para &quot;{busca}&quot;.</p>
        )}
        {envelopesFiltrados.map((env) => {
          const negocio = env.proposta?.negocio;
          const assinadoComercial = env.proposta?.pdf_assinado_comercial_path;
          const assinadoTecnica = env.proposta?.pdf_assinado_tecnica_path;
          return (
            <div key={env.id} className="p-4 hover:bg-recuo">
              <Link href={negocio ? `/negocios/${negocio.id}` : "#"} className="block">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-corpo text-tinta">
                      {negocio?.contato?.empresa || negocio?.contato?.nome} — Proposta {env.proposta?.numero}
                    </p>
                    <p className="text-rotulo text-tinta-suave">Vendedor: {negocio?.responsavel?.nome || "—"}</p>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 px-3 py-1 text-rotulo font-semibold rounded-full ${
                      env.status === "concluido"
                        ? "bg-ok-fraco text-ok"
                        : env.status === "cancelado"
                          ? "bg-recuo text-tinta-suave"
                          : "bg-alerta-fraco text-alerta"
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
                    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
                    .map((s) => (
                      <span
                        key={s.id}
                        title={
                          s.status === "assinado" && s.assinado_em
                            ? `Assinado em ${new Date(s.assinado_em).toLocaleString("pt-BR")}`
                            : s.status === "visualizado" && s.visualizado_em
                              ? `Visualizou em ${new Date(s.visualizado_em).toLocaleString("pt-BR")}`
                              : "Ainda não visualizou o documento"
                        }
                        className={`text-rotulo px-2 py-1 rounded-lg font-medium flex items-center gap-1 ${
                          s.status === "assinado"
                            ? "bg-ok-fraco text-ok"
                            : s.status === "visualizado"
                              ? "bg-info-fraco text-info"
                              : "bg-recuo text-tinta-suave"
                        }`}
                      >
                        {s.status === "visualizado" && <Eye className="h-3 w-3" />}
                        {s.nome} ({s.papel}): {s.status === "assinado" ? "assinado" : s.status === "visualizado" ? "visualizou" : "aguardando"}
                      </span>
                    ))}
                </div>
              </Link>
              {(assinadoComercial || assinadoTecnica) && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-fio">
                  {/* Botao, e nao <a href>: o banco guarda o caminho no bucket
                      privado, entao a URL tem de ser assinada na hora. Com o
                      caminho cru no href, estes links davam 404. */}
                  {assinadoComercial && (
                    <button
                      type="button"
                      onClick={() => void abrirPdf(assinadoComercial)}
                      className="flex items-center gap-1 text-rotulo font-semibold text-ok hover:text-ok"
                    >
                      <Download className="h-3.5 w-3.5" /> Baixar comercial assinada
                    </button>
                  )}
                  {assinadoTecnica && (
                    <button
                      type="button"
                      onClick={() => void abrirPdf(assinadoTecnica)}
                      className="flex items-center gap-1 text-rotulo font-semibold text-ok hover:text-ok"
                    >
                      <Download className="h-3.5 w-3.5" /> Baixar técnica assinada
                    </button>
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
