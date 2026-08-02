"use client";

import { useState } from "react";
import { Sparkles, Loader2, Send, MessageCircle, Copy, Check, TrendingUp } from "lucide-react";
import type { NegocioComRelacoes } from "@/lib/types";

export function CopilotoTab({ negocio }: { negocio: NegocioComRelacoes }) {
  const [qualificando, setQualificando] = useState(false);
  const [qualificacao, setQualificacao] = useState<any>(null);
  const [erroQualificacao, setErroQualificacao] = useState<string | null>(null);

  const [objetivoEmail, setObjetivoEmail] = useState("Pos-demonstracao");
  const [tomEmail, setTomEmail] = useState("Consultivo e focado em ROI");
  const [gerandoEmail, setGerandoEmail] = useState(false);
  const [email, setEmail] = useState<any>(null);
  const [erroEmail, setErroEmail] = useState<string | null>(null);

  const [objetivoWhats, setObjetivoWhats] = useState("Retomar contato");
  const [gerandoWhats, setGerandoWhats] = useState(false);
  const [whatsapp, setWhatsapp] = useState<any>(null);
  const [erroWhats, setErroWhats] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const qualificar = async () => {
    setQualificando(true);
    setErroQualificacao(null);
    const resp = await fetch("/api/ai/qualificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ negocioId: negocio.id }),
    });
    const data = await resp.json();
    setQualificando(false);
    if (!resp.ok) return setErroQualificacao(data.error);
    setQualificacao(data);
  };

  const gerarEmail = async (enviar: boolean) => {
    setGerandoEmail(true);
    setErroEmail(null);
    const resp = await fetch("/api/ai/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ negocioId: negocio.id, objetivo: objetivoEmail, tom: tomEmail, enviar }),
    });
    const data = await resp.json();
    setGerandoEmail(false);
    if (!resp.ok) return setErroEmail(data.error);
    setEmail(data);
  };

  const gerarWhatsapp = async () => {
    setGerandoWhats(true);
    setErroWhats(null);
    const resp = await fetch("/api/ai/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ negocioId: negocio.id, objetivo: objetivoWhats }),
    });
    const data = await resp.json();
    setGerandoWhats(false);
    if (!resp.ok) return setErroWhats(data.error);
    setWhatsapp(data);
  };

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-indigo-50 to-sky-50 dark:from-indigo-950/40 dark:to-sky-950/20 p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-indigo-600" /> Qualificacao com IA
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Fit score, pontos fortes, riscos e pitch sugerido.</p>
        </div>
        <button onClick={qualificar} disabled={qualificando} className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50">
          {qualificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {qualificacao ? "Re-analisar" : "Qualificar com IA"}
        </button>
      </div>
      {erroQualificacao && <p className="text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">{erroQualificacao}</p>}
      {qualificacao && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold">Fit Score</p>
              <p className="text-3xl font-extrabold text-indigo-600">{qualificacao.fitScore}%</p>
            </div>
            <TrendingUp className="h-8 w-8 text-indigo-200" />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">{qualificacao.resumo}</p>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-xs text-slate-700 dark:text-slate-300">
            <strong>Pitch sugerido:</strong> {qualificacao.pitchSugerido}
          </div>
          {qualificacao.objecoes?.map((o: any, i: number) => (
            <div key={i} className="text-xs p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
              <p className="font-bold text-rose-600">"{o.objecao}"</p>
              <p className="text-slate-600 dark:text-slate-300">{o.resposta}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><Send className="h-4 w-4 text-indigo-600" /> Gerador de e-mail</h3>
          <input value={objetivoEmail} onChange={(e) => setObjetivoEmail(e.target.value)} placeholder="Objetivo" className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
          <input value={tomEmail} onChange={(e) => setTomEmail(e.target.value)} placeholder="Tom de voz" className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
          <div className="flex gap-2">
            <button onClick={() => gerarEmail(false)} disabled={gerandoEmail} className="flex-1 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 dark:bg-indigo-950 rounded-xl disabled:opacity-50">
              {gerandoEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Gerar rascunho"}
            </button>
            <button onClick={() => gerarEmail(true)} disabled={gerandoEmail} className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50">
              Gerar e enviar
            </button>
          </div>
          {erroEmail && <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2 py-1.5">{erroEmail}</p>}
          {email && (
            <div className="text-xs bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-1">
              <p className="font-bold">{email.assunto}</p>
              <div className="text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: email.corpo }} />
              {email.enviado && <p className="text-emerald-600 font-bold">Enviado ao contato!</p>}
              {!email.resendConfigurado && <p className="text-slate-400">(Resend nao configurado — apenas rascunho)</p>}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><MessageCircle className="h-4 w-4 text-emerald-600" /> Mensagem de WhatsApp</h3>
          <input value={objetivoWhats} onChange={(e) => setObjetivoWhats(e.target.value)} placeholder="Objetivo" className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
          <button onClick={gerarWhatsapp} disabled={gerandoWhats} className="w-full py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50">
            {gerandoWhats ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Gerar mensagem"}
          </button>
          {erroWhats && <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2 py-1.5">{erroWhats}</p>}
          {whatsapp && (
            <div className="text-xs bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2">
              <p className="text-slate-700 dark:text-slate-300">{whatsapp.mensagem}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(whatsapp.mensagem);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 1500);
                  }}
                  className="flex items-center gap-1 text-slate-500 font-semibold"
                >
                  {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copiar
                </button>
                {whatsapp.temTelefone && (
                  <a href={whatsapp.linkWhatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-600 font-bold">
                    <MessageCircle className="h-3.5 w-3.5" /> Abrir no WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
