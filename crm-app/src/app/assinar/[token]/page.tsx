"use client";

import { use, useEffect, useState } from "react";
import { createAnonClient } from "@/lib/supabase/anon";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { SignaturePad } from "@/components/SignaturePad";
import { FileSignature, CheckCircle2, Loader2, FileText, ShieldCheck, Building2 } from "lucide-react";

interface EnvelopePublico {
  signatario: { id: string; nome: string; email: string; papel: string; status: string };
  envelope: { id: string; status: string };
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

  useEffect(() => {
    const supabase = createAnonClient();
    supabase
      .rpc("obter_envelope_publico", { p_token: token })
      .then(({ data, error }: any) => {
        setCarregando(false);
        if (error || !data) {
          setErro(error?.message || "Link invalido ou expirado.");
          return;
        }
        setDados(data as EnvelopePublico);
        setNomeDigitado(data.signatario.nome);
        if (data.signatario.status === "assinado") setConcluido(true);
      });
  }, [token]);

  const handleAssinar = async () => {
    if (!aceite) return;
    const assinaturaDados = modoAssinatura === "digitada" ? nomeDigitado.trim() : assinaturaDesenhada;
    if (!assinaturaDados) return;

    setEnviando(true);
    const resp = await fetch(`/api/assinar/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: modoAssinatura, dados: assinaturaDados }),
    });
    setEnviando(false);
    if (!resp.ok) {
      const err = await resp.json();
      setErro(err.error || "Falha ao registrar assinatura.");
      return;
    }
    setConcluido(true);
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

  const comercialUrl = `${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/comercial.pdf`;
  const tecnicaUrl = `${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/tecnica.pdf`;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center gap-3">
        <FileSignature className="h-5 w-5 text-indigo-400" />
        <div>
          <p className="font-extrabold text-sm">SOFTEUM · Assinatura Eletronica</p>
          <p className="text-[11px] text-slate-400">Proposta {dados.proposta.numero} · v{dados.proposta.versao}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {concluido ? (
          <div className="bg-white rounded-3xl border border-emerald-200 shadow-lg p-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-lg font-extrabold text-slate-900">Assinatura registrada com sucesso!</h1>
            <p className="text-sm text-slate-500 mt-2">
              Obrigado, {dados.signatario.nome}. A Softeum e o vendedor responsavel foram notificados.
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
                {dados.negocio.titulo} · CNPJ {dados.contato.cnpj} · Aviso previo de{" "}
                {dados.proposta.aviso_previo_dias} dias
              </p>

              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <a
                  href={comercialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-indigo-400 text-xs font-semibold text-slate-700"
                >
                  <FileText className="h-4 w-4 text-indigo-600" /> Proposta Comercial (PDF)
                </a>
                <a
                  href={tecnicaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-indigo-400 text-xs font-semibold text-slate-700"
                >
                  <FileText className="h-4 w-4 text-indigo-600" /> Proposta Tecnica (PDF)
                </a>
              </div>

              <div className="mt-4 rounded-xl overflow-hidden border border-slate-200">
                <iframe src={comercialUrl} className="w-full h-[420px]" title="Proposta Comercial" />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-4">
              <h2 className="font-bold text-sm text-slate-900">Assinar como {dados.signatario.nome}</h2>

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

              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5" />
                <span>
                  Declaro que li e concordo com os termos das propostas Comercial e Tecnica acima, e que esta
                  assinatura eletronica tem validade juridica nos termos do art. 10, par. 2 da Medida Provisoria
                  no 2.200-2/2001.
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
            </div>
          </>
        )}
      </main>
    </div>
  );
}
