"use client";

import { useState } from "react";
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
  Plus,
  X,
  Eye,
  FileSignature,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { NegocioComRelacoes, Plano } from "@/lib/types";
import { AVISOS_PREVIOS_DIAS, formatarMoeda } from "@/lib/types";
import { PdfFieldEditor, type CampoAssinatura } from "@/components/PdfFieldEditor";

const STATUS_COR: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  enviada: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  assinada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  cancelada: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

interface Signatario {
  nome: string;
  email: string;
}

type EtapaEnvio = "signatarios" | "editor" | null;

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

  const [avisoPrevioDias, setAvisoPrevioDias] = useState(180);
  const [prazoContratoMeses, setPrazoContratoMeses] = useState(12);

  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<{
    propostaId: string;
    linkAssinatura: string;
    emailEnviado: boolean;
    emailErro: string | null;
    remetenteTest: boolean;
  } | null>(null);

  const [editandoEnvioId, setEditandoEnvioId] = useState<string | null>(null);
  const [etapaEnvio, setEtapaEnvio] = useState<EtapaEnvio>(null);
  const [signatarios, setSignatarios] = useState<Signatario[]>([]);
  const [copias, setCopias] = useState<string[]>([]);
  const [pdfComercialUrl, setPdfComercialUrl] = useState<string | null>(null);
  const [camposAssinatura, setCamposAssinatura] = useState<CampoAssinatura[]>([]);
  const [documentoEditor, setDocumentoEditor] = useState<"comercial" | "tecnica">("comercial");

  const temCnpj = !!negocio.contato?.cnpj?.trim();
  const valorMensal = (plano?.valor_plataforma_base || 0) + (plano?.valor_uso_base || 0);

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
        valorPlataforma: plano?.valor_plataforma_base,
        valorUso: plano?.valor_uso_base,
        qtdCaixasEmail: 0,
        qtdNumerosWhatsapp: 0,
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
    if (data.urlComercial) window.open(data.urlComercial, "_blank");
  };

  const abrirEnvio = (propostaId: string) => {
    setEditandoEnvioId(propostaId);
    setEtapaEnvio("signatarios");
    setSignatarios([{ nome: negocio.contato?.nome || "", email: negocio.contato?.email || "" }]);
    setCopias([]);
    setCamposAssinatura([]);
    setErro(null);
  };

  const avancarParaEditor = async () => {
    const signatariosValidos = signatarios.filter((s) => s.nome.trim() && s.email.trim());
    if (signatariosValidos.length === 0) {
      setErro("Adicione pelo menos um signatario com nome e e-mail.");
      return;
    }
    setErro(null);

    const proposta = propostas.find((p) => p.id === editandoEnvioId);
    if (!proposta?.pdf_comercial_path) {
      setErro("PDF nao encontrado.");
      return;
    }

    const supabase = createClient();
    const { data } = await supabase.storage.from("documentos").createSignedUrl(proposta.pdf_comercial_path, 60 * 30);
    if (!data?.signedUrl) {
      setErro("Falha ao carregar PDF.");
      return;
    }
    setPdfComercialUrl(data.signedUrl);
    setDocumentoEditor("comercial");
    setEtapaEnvio("editor");
  };

  const handleEnviarComCampos = async (campos: CampoAssinatura[]) => {
    if (!editandoEnvioId) return;
    const signatariosValidos = signatarios.filter((s) => s.nome.trim() && s.email.trim());

    setEnviandoId(editandoEnvioId);
    setErro(null);
    const resp = await fetch(`/api/propostas/${editandoEnvioId}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signatarios: signatariosValidos,
        copias: copias.filter((c) => c.trim()),
        campos_assinatura: campos,
      }),
    });
    const data = await resp.json();
    setEnviandoId(null);
    if (!resp.ok) {
      setErro(data.error || "Erro ao enviar proposta.");
      return;
    }
    setEditandoEnvioId(null);
    setEtapaEnvio(null);
    setUltimoResultado({
      propostaId: editandoEnvioId,
      linkAssinatura: data.linkAssinatura,
      emailEnviado: data.emailEnviado,
      emailErro: data.emailErro || null,
      remetenteTest: data.remetenteTest || false,
    });
    const supabase = createClient();
    const { data: propostaAtualizada } = await supabase
      .from("propostas")
      .select("*, plano:planos(*), envelopes(*, signatarios(*))")
      .eq("id", editandoEnvioId)
      .single();
    if (propostaAtualizada) {
      setPropostas((prev) => prev.map((p) => (p.id === editandoEnvioId ? propostaAtualizada : p)));
    }
  };

  const baixarPdf = async (path: string) => {
    if (path.startsWith("http")) {
      window.open(path, "_blank");
      return;
    }
    const supabase = createClient();
    const { data } = await supabase.storage.from("documentos").createSignedUrl(path, 60 * 5);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
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
          <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold">
            {planos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} — ate {p.franquia_pedidos.toLocaleString("pt-BR")} pedidos/mes</option>
            ))}
          </select>
        </div>

        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
          <p className="text-[11px] font-bold uppercase text-indigo-500 dark:text-indigo-400">Mensalidade do plano</p>
          <p className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-300 mt-1">{formatarMoeda(valorMensal)}<span className="text-sm font-semibold text-slate-500">/mes</span></p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Valor definido pelo plano cadastrado no painel admin. Excedente de {formatarMoeda(plano?.valor_excedente_pedido)} por pedido acima da franquia.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Prazo contrato (meses)</label>
            <input type="number" min={1} value={prazoContratoMeses} onChange={(e) => setPrazoContratoMeses(parseInt(e.target.value) || 12)} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Aviso previo de rescisao</label>
            <select value={avisoPrevioDias} onChange={(e) => setAvisoPrevioDias(parseInt(e.target.value))} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold">
              {AVISOS_PREVIOS_DIAS.map((d) => (
                <option key={d} value={d}>{d} dias {d === 180 ? "(padrao)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        {erro && !editandoEnvioId && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

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
              return (
                <div key={p.id} className="p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        Proposta {p.numero} v{p.versao} — {p.plano?.nome}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatarMoeda((p.valor_plataforma || 0) + (p.valor_uso || 0))}/mes · aviso previo {p.aviso_previo_dias} dias
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full capitalize ${STATUS_COR[p.status]}`}>
                      {p.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {p.pdf_comercial_path && (
                      <button onClick={() => baixarPdf(p.pdf_comercial_path)} className="text-[11px] flex items-center gap-1 text-slate-500 hover:text-indigo-600 font-semibold">
                        <Eye className="h-3 w-3" /> Comercial
                      </button>
                    )}
                    {p.pdf_tecnica_path && (
                      <button onClick={() => baixarPdf(p.pdf_tecnica_path)} className="text-[11px] flex items-center gap-1 text-slate-500 hover:text-indigo-600 font-semibold">
                        <Eye className="h-3 w-3" /> Tecnica
                      </button>
                    )}
                    {p.pdf_assinado_comercial_path && (
                      <button onClick={() => baixarPdf(p.pdf_assinado_comercial_path)} className="text-[11px] flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-bold">
                        <Download className="h-3 w-3" /> Assinado (comercial)
                      </button>
                    )}
                    {p.pdf_assinado_tecnica_path && (
                      <button onClick={() => baixarPdf(p.pdf_assinado_tecnica_path)} className="text-[11px] flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-bold">
                        <Download className="h-3 w-3" /> Assinado (tecnica)
                      </button>
                    )}
                    {p.status === "rascunho" && editandoEnvioId !== p.id && (
                      <button
                        onClick={() => abrirEnvio(p.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                      >
                        <Send className="h-3.5 w-3.5" /> Enviar para assinatura
                      </button>
                    )}
                  </div>

                  {/* Etapa 1: Signatarios */}
                  {editandoEnvioId === p.id && etapaEnvio === "signatarios" && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Quem vai assinar?</p>
                      </div>
                      {signatarios.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={s.nome}
                            onChange={(e) => setSignatarios((prev) => prev.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                            placeholder="Nome completo"
                            className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                          <input
                            value={s.email}
                            onChange={(e) => setSignatarios((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                            placeholder="email@empresa.com"
                            className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                          {signatarios.length > 1 && (
                            <button onClick={() => setSignatarios((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600">
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setSignatarios((prev) => [...prev, { nome: "", email: "" }])}
                        className="text-[11px] font-bold text-indigo-600 flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Adicionar signatario
                      </button>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">Enviar copia para (opcional)</p>
                        {copias.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 mb-2">
                            <input
                              value={c}
                              onChange={(e) => setCopias((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                              placeholder="email@empresa.com"
                              className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                            />
                            <button onClick={() => setCopias((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setCopias((prev) => [...prev, ""])}
                          className="text-[11px] font-bold text-indigo-600 flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" /> Adicionar copia
                        </button>
                      </div>

                      {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={avancarParaEditor}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                        >
                          <FileSignature className="h-3.5 w-3.5" /> Preparar documento
                        </button>
                        <button onClick={() => { setEditandoEnvioId(null); setEtapaEnvio(null); }} className="px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Etapa 2: Editor de campos */}
                  {editandoEnvioId === p.id && etapaEnvio === "editor" && pdfComercialUrl && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Posicione os campos de assinatura no documento</p>
                        <button
                          onClick={() => setEtapaEnvio("signatarios")}
                          className="ml-auto text-[11px] text-slate-500 hover:text-indigo-600 font-semibold"
                        >
                          Voltar
                        </button>
                      </div>

                      {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

                      <PdfFieldEditor
                        pdfUrl={pdfComercialUrl}
                        documento={documentoEditor}
                        signatarios={signatarios
                          .filter((s) => s.nome.trim() && s.email.trim())
                          .map((s, i) => ({ nome: s.nome, email: s.email, ordem: i + 2 }))}
                        camposIniciais={camposAssinatura}
                        onSalvar={(campos) => {
                          setCamposAssinatura(campos);
                          handleEnviarComCampos(campos);
                        }}
                        onCancelar={() => setEtapaEnvio("signatarios")}
                        enviando={!!enviandoId}
                      />
                    </div>
                  )}

                  {envelope && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Status da assinatura (tempo real)</p>
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
                    <div className={`rounded-xl p-3 text-xs ${ultimoResultado.emailEnviado ? "bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800" : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"}`}>
                      <p className={`font-bold ${ultimoResultado.emailEnviado ? "text-indigo-800 dark:text-indigo-300" : "text-amber-800 dark:text-amber-300"}`}>
                        {ultimoResultado.emailEnviado
                          ? ultimoResultado.remetenteTest
                            ? "E-mail enviado (remetente de teste — so chega no e-mail da conta Resend)."
                            : "E-mail de assinatura enviado aos envolvidos."
                          : ultimoResultado.emailErro
                            ? `Falha ao enviar e-mail: ${ultimoResultado.emailErro}`
                            : "RESEND_API_KEY nao configurada — copie e envie o link manualmente:"}
                      </p>
                      {!ultimoResultado.emailEnviado && (
                        <p className="text-amber-700 dark:text-amber-400 mt-1">
                          Configure RESEND_API_KEY e RESEND_FROM_EMAIL (dominio verificado) no Vercel.
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <code className="flex-1 truncate bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
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
