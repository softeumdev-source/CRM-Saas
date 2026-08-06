"use client";

import { use, useEffect, useState } from "react";
import { createAnonClient } from "@/lib/supabase/anon";
import { SignaturePad } from "@/components/SignaturePad";
import { PdfSignViewer } from "@/components/PdfSignViewer";
import type { CampoAssinatura } from "@/components/PdfFieldEditor";
import {
  FileSignature,
  CheckCircle2,
  Loader2,
  FileText,
  ShieldCheck,
  Building2,
  Mail,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface EnvelopePublico {
  signatario: { id: string; nome: string; email: string; papel: string; status: string; ordem: number };
  envelope: { id: string; status: string; campos_assinatura: CampoAssinatura[] | null };
  outros_signatarios: { nome: string; papel: string; status: string }[];
  proposta: {
    numero: string;
    versao: number;
    aviso_previo_dias: number;
    prazo_contrato_meses: number;
    valor_plataforma: number;
    valor_uso: number;
    valor_excedente_pedido: number;
  };
  negocio: { titulo: string };
  contato: { nome: string; empresa: string; cnpj: string; email: string };
  tenant: { nome: string; cor_primaria: string };
}

export default function AssinarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [dados, setDados] = useState<EnvelopePublico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modoAssinatura, setModoAssinatura] = useState<"desenhada" | "digitada">("digitada");
  const [nomeDigitado, setNomeDigitado] = useState("");
  const [assinaturaDesenhada, setAssinaturaDesenhada] = useState<string | null>(null);
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [modalAssinatura, setModalAssinatura] = useState(false);
  const [emailFaturamento, setEmailFaturamento] = useState("");
  const [tecnicaAberta, setTecnicaAberta] = useState(false);

  useEffect(() => {
    const supabase = createAnonClient();
    supabase
      .rpc("obter_envelope_publico", { p_token: token })
      .then(({ data, error }: any) => {
        setCarregando(false);
        if (error || !data) {
          setErro(error?.message || "Link inválido ou expirado.");
          return;
        }
        setDados(data as EnvelopePublico);
        setNomeDigitado(data.signatario.nome);
        setEmailFaturamento("");
        if (data.signatario.status === "assinado") setConcluido(true);
      });
  }, [token]);

  const handleAssinar = async () => {
    if (!aceite) return;
    const assinaturaDados = modoAssinatura === "digitada" ? nomeDigitado.trim() : assinaturaDesenhada;
    if (!assinaturaDados) return;

    setErro(null);
    setEnviando(true);
    try {
      const resp = await fetch(`/api/assinar/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: modoAssinatura,
          dados: assinaturaDados,
          email_faturamento: emailFaturamento.trim() || undefined,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro de conexão." }));
        setErro(err.error || "Falha ao registrar assinatura.");
        setEnviando(false);
        return;
      }
      setModalAssinatura(false);
      setConcluido(true);
    } catch (e: any) {
      setErro("Erro de conexão. Verifique sua internet e tente novamente.");
    }
    setEnviando(false);
  };

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (erro && !dados) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md text-center shadow-lg">
          <ShieldCheck className="h-10 w-10 text-rose-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-800">{erro}</p>
        </div>
      </div>
    );
  }

  if (!dados) return null;

  const comercialUrl = `/api/pdf-publico/${token}/comercial.pdf`;
  const tecnicaUrl = `/api/pdf-publico/${token}/tecnica.pdf`;
  const campos: CampoAssinatura[] = dados.envelope.campos_assinatura || [];
  const temCamposPosicionados = campos.length > 0;
  const signatarioOrdem = dados.signatario.ordem ?? 2;

  const painelAssinatura = (
    <>
      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setModoAssinatura("digitada")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${modoAssinatura === "digitada" ? "bg-white shadow-xs text-indigo-600" : "text-slate-500"}`}
        >
          Digitar nome
        </button>
        <button
          onClick={() => setModoAssinatura("desenhada")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${modoAssinatura === "desenhada" ? "bg-white shadow-xs text-indigo-600" : "text-slate-500"}`}
        >
          Desenhar assinatura
        </button>
      </div>

      {modoAssinatura === "digitada" ? (
        <input
          value={nomeDigitado}
          onChange={(e) => setNomeDigitado(e.target.value)}
          className="w-full px-4 py-3 text-2xl border-b-2 border-slate-300 focus:border-indigo-500 outline-hidden"
          style={{ fontFamily: "cursive" }}
        />
      ) : (
        <SignaturePad onChange={setAssinaturaDesenhada} />
      )}

      <div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-1">
          <Mail className="h-3.5 w-3.5 text-indigo-600" />
          E-mail de faturamento
        </label>
        <input
          type="email"
          value={emailFaturamento}
          onChange={(e) => setEmailFaturamento(e.target.value)}
          placeholder="email@empresa.com.br"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-hidden"
        />
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5" />
        <span>
          Declaro que li e concordo com os termos das propostas Comercial e Técnica acima, e que esta
          assinatura eletrônica tem validade jurídica nos termos do art. 10, §2º da Medida Provisória
          nº 2.200-2/2001.
        </span>
      </label>

      {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{erro}</p>}

      <button
        onClick={handleAssinar}
        disabled={!aceite || enviando}
        className="w-full py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        Assinar documento
      </button>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3">
        <FileSignature className="h-5 w-5 text-indigo-400" />
        <div>
          <p className="font-extrabold text-sm">SOFTEUM · Assinatura Eletrônica</p>
          <p className="text-[11px] text-slate-400">Proposta {dados.proposta.numero} · v{dados.proposta.versao}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {concluido ? (
          <div className="bg-white rounded-3xl border border-emerald-200 shadow-lg p-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-lg font-extrabold text-slate-900">Assinatura registrada com sucesso!</h1>
            <p className="text-sm text-slate-500 mt-2">
              Obrigado, {dados.signatario.nome}. A Softeum e o vendedor responsável foram notificados.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-indigo-600" />
                <h1 className="font-extrabold text-slate-900">{dados.contato.empresa || dados.contato.nome}</h1>
              </div>
              <p className="text-xs text-slate-500">
                {dados.negocio.titulo} · CNPJ {dados.contato.cnpj} · Aviso prévio de{" "}
                {dados.proposta.aviso_previo_dias} dias
              </p>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold uppercase text-indigo-600">Proposta Comercial — documento para assinatura</p>
                  <a
                    href={comercialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    <FileText className="h-3 w-3" /> Abrir em nova aba
                  </a>
                </div>
                {temCamposPosicionados ? (
                  <PdfSignViewer
                    pdfUrl={comercialUrl}
                    documento="comercial"
                    campos={campos}
                    signatarioOrdem={signatarioOrdem}
                    assinado={concluido}
                    onCampoClick={() => setModalAssinatura(true)}
                  />
                ) : (
                  <div className="rounded-xl overflow-hidden border border-slate-200">
                    <iframe src={comercialUrl} className="w-full h-[500px]" title="Proposta Comercial" />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-indigo-200 shadow-xs p-6 space-y-4">
              <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-indigo-600" />
                Assinar Proposta Comercial como {dados.signatario.nome}
              </h2>
              {painelAssinatura}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <button
                onClick={() => setTecnicaAberta(!tecnicaAberta)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <p className="text-xs font-bold text-slate-600">Proposta Técnica (referência)</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={tecnicaUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    <FileText className="h-3 w-3" /> Abrir em nova aba
                  </a>
                  {tecnicaAberta ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
              </button>
              {tecnicaAberta && (
                <div className="px-6 pb-6">
                  {temCamposPosicionados && campos.some((c) => c.documento === "tecnica") ? (
                    <PdfSignViewer
                      pdfUrl={tecnicaUrl}
                      documento="tecnica"
                      campos={campos}
                      signatarioOrdem={signatarioOrdem}
                      assinado={concluido}
                      onCampoClick={() => setModalAssinatura(true)}
                    />
                  ) : (
                    <div className="rounded-xl overflow-hidden border border-slate-200">
                      <iframe src={tecnicaUrl} className="w-full h-[500px]" title="Proposta Técnica" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {modalAssinatura && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 relative">
            <button onClick={() => setModalAssinatura(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-indigo-600" />
              <h2 className="font-bold text-sm text-slate-900">Assinar como {dados.signatario.nome}</h2>
            </div>

            {painelAssinatura}
          </div>
        </div>
      )}
    </div>
  );
}
