"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Send,
  CheckCircle2,
  Clock,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { NegocioComRelacoes, Plano } from "@/lib/types";
import { AVISOS_PREVIOS_DIAS, formatarMoeda } from "@/lib/types";

const STATUS_COR: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  enviada: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  assinada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  cancelada: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export function PropostaTab({
  negocio,
  planos,
  propostasIniciais,
}: {
  negocio: NegocioComRelacoes;
  planos: Plano[];
  propostasIniciais: any[];
}) {
  const [propostas, setPropostas] = useState(propostasIniciais);
  const [planoId, setPlanoId] = useState(planos[0]?.id || "");
  const plano = planos.find((p) => p.id === planoId);

  const [valorPlataforma, setValorPlataforma] = useState(plano?.valor_plataforma_base || 0);
  const [valorUso, setValorUso] = useState(plano?.valor_uso_base || 0);
  const [avisoPrevioDias, setAvisoPrevioDias] = useState(180);
  const [qtdCaixasEmail, setQtdCaixasEmail] = useState(1);
  const [qtdNumerosWhatsapp, setQtdNumerosWhatsapp] = useState(0);
  const [prazoContratoMeses, setPrazoContratoMeses] = useState(12);

  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<{ propostaId: string; linkAssinatura: string; emailEnviado: boolean } | null>(null);

  const temCnpj = !!negocio.contato?.cnpj?.trim();

  const trocarPlano = (id: string) => {
    setPlanoId(id);
    const p = planos.find((pl) => pl.id === id);
    setValorPlataforma(p?.valor_plataforma_base || 0);
    setValorUso(p?.valor_uso_base || 0);
  };

  const handleGerar = async () => {
    setErro(null);
    setGerando(true);
    const resp = await fetch("/api/propostas/gerar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        negocioId: negocio.id,
        planoId,
        avisoPrevioDias,
        valorPlataforma,
        valorUso,
        qtdCaixasEmail,
        valorModuloEmail: 150,
        qtdNumerosWhatsapp,
        valorModuloWhatsapp: 250,
        prazoContratoMeses,
      }),
    });
    const data = await resp.json();
    setGerando(false);
    if (!resp.ok) {
      setErro(data.error || "Erro ao gerar proposta.");
      return;
    }
    setPropostas((prev) => [{ ...data.proposta, plano, envelopes: [] }, ...prev]);
    window.open(data.urlComercial, "_blank");
  };

  const handleEnviar = async (propostaId: string) => {
    setEnviandoId(propostaId);
    setErro(null);
    const resp = await fetch(`/api/propostas/${propostaId}/enviar`, { method: "POST" });
    const data = await resp.json();
    setEnviandoId(null);
    if (!resp.ok) {
      setErro(data.error || "Erro ao enviar proposta.");
      return;
    }
    setUltimoResultado({ propostaId, linkAssinatura: data.linkAssinatura, emailEnviado: data.emailEnviado });
    const supabase = createClient();
    const { data: propostaAtualizada } = await supabase
      .from("propostas")
      .select("*, plano:planos(*), envelopes(*, signatarios(*))")
      .eq("id", propostaId)
      .single();
    if (propostaAtualizada) {
      setPropostas((prev) => prev.map((p) => (p.id === propostaId ? propostaAtualizada : p)));
    }
  };

  const copiarLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setLinkCopiado(link);
    setTimeout(() => setLinkCopiado(null), 2000);
  };

  return (
    <div className="space-y-5">
      {!temCnpj && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">CNPJ obrigatorio</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Este contato ainda nao tem CNPJ cadastrado. Preencha o CNPJ na aba "Visao Geral" antes de gerar a proposta.
            </p>
          </div>
        </div>
      )}

      <div className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4 ${!temCnpj ? "opacity-50 pointer-events-none" : ""}`}>
        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Gerar nova proposta</h3>

        <div>
          <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Plano</label>
          <select value={planoId} onChange={(e) => trocarPlano(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold">
            {planos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} — ate {p.franquia_pedidos.toLocaleString("pt-BR")} pedidos/mes</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
              Mensalidade plataforma (min. {formatarMoeda(plano?.valor_plataforma_base)})
            </label>
            <input
              type="number"
              min={plano?.valor_plataforma_base || 0}
              value={valorPlataforma}
              onChange={(e) => setValorPlataforma(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-indigo-600"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
              Mensalidade de uso (min. {formatarMoeda(plano?.valor_uso_base)})
            </label>
            <input
              type="number"
              min={plano?.valor_uso_base || 0}
              value={valorUso}
              onChange={(e) => setValorUso(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-indigo-600"
            />
          </div>
          <p className="col-span-2 text-[11px] text-slate-400 -mt-1">
            Voce pode colocar qualquer valor igual ou acima do minimo cadastrado pelo admin. Nunca abaixo.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Caixas de e-mail</label>
            <input type="number" min={0} value={qtdCaixasEmail} onChange={(e) => setQtdCaixasEmail(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Numeros WhatsApp</label>
            <input type="number" min={0} value={qtdNumerosWhatsapp} onChange={(e) => setQtdNumerosWhatsapp(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Prazo contrato (meses)</label>
            <input type="number" min={1} value={prazoContratoMeses} onChange={(e) => setPrazoContratoMeses(parseInt(e.target.value) || 12)} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Aviso previo de rescisao</label>
          <div className="flex flex-wrap gap-1.5">
            {AVISOS_PREVIOS_DIAS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setAvisoPrevioDias(d)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${
                  avisoPrevioDias === d
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                {d} dias {d === 180 && "(padrao)"}
              </button>
            ))}
          </div>
        </div>

        {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

        <button
          onClick={handleGerar}
          disabled={gerando || !temCnpj}
          className="w-full py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Gerar proposta (Comercial + Tecnica)
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Propostas geradas ({propostas.length})</h3>
        </div>
        {propostas.length === 0 ? (
          <p className="p-5 text-xs text-slate-400">Nenhuma proposta gerada ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {propostas.map((p) => {
              const envelope = p.envelopes?.[0];
              const cliente = envelope?.signatarios?.find((s: any) => s.papel === "cliente");
              return (
                <div key={p.id} className="p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        Proposta {p.numero} v{p.versao} — {p.plano?.nome}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatarMoeda(p.valor_plataforma + p.valor_uso)}/mes · aviso previo {p.aviso_previo_dias} dias
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full capitalize ${STATUS_COR[p.status]}`}>
                      {p.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {p.pdf_comercial_path && (
                      <span className="text-[11px] flex items-center gap-1 text-slate-500">
                        <Download className="h-3 w-3" /> PDFs gerados
                      </span>
                    )}
                    {p.status === "rascunho" && (
                      <button
                        onClick={() => handleEnviar(p.id)}
                        disabled={enviandoId === p.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-60"
                      >
                        {enviandoId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Enviar para assinatura
                      </button>
                    )}
                  </div>

                  {envelope && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-1.5">
                      {envelope.signatarios?.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{s.nome} <span className="text-slate-400">({s.papel})</span></span>
                          <span className={`flex items-center gap-1 font-bold ${s.status === "assinado" ? "text-emerald-600" : "text-amber-600"}`}>
                            {s.status === "assinado" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                            {s.status === "assinado" ? `Assinado em ${new Date(s.assinado_em).toLocaleDateString("pt-BR")}` : "Aguardando"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {ultimoResultado && ultimoResultado.propostaId === p.id && (
                    <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 text-xs">
                      <p className="font-bold text-indigo-800 dark:text-indigo-300">
                        {ultimoResultado.emailEnviado ? "E-mail de assinatura enviado ao cliente." : "Resend nao configurado — copie e envie o link manualmente:"}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <code className="flex-1 truncate bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                          {ultimoResultado.linkAssinatura}
                        </code>
                        <button onClick={() => copiarLink(ultimoResultado!.linkAssinatura)} className="text-indigo-600 hover:text-indigo-800">
                          {linkCopiado === ultimoResultado.linkAssinatura ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
