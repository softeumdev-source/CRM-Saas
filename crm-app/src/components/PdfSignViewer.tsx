"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FileSignature, ChevronLeft, ChevronRight, Loader2, CheckCircle2 } from "lucide-react";
import type { CampoAssinatura } from "./PdfFieldEditor";

const CORES = [
  { bg: "rgba(79,70,229,0.15)", border: "#4f46e5", text: "#4f46e5", pulse: "ring-indigo-400" },
  { bg: "rgba(16,185,129,0.15)", border: "#10b981", text: "#10b981", pulse: "ring-emerald-400" },
  { bg: "rgba(245,158,11,0.15)", border: "#f59e0b", text: "#f59e0b", pulse: "ring-amber-400" },
  { bg: "rgba(239,68,68,0.15)", border: "#ef4444", text: "#ef4444", pulse: "ring-rose-400" },
];

export function PdfSignViewer({
  pdfUrl,
  documento,
  campos,
  signatarioOrdem,
  assinado,
  onCampoClick,
}: {
  pdfUrl: string;
  documento: "comercial" | "tecnica";
  campos: CampoAssinatura[];
  signatarioOrdem: number;
  assinado: boolean;
  onCampoClick: (campo: CampoAssinatura) => void;
}) {
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  const renderizarPagina = useCallback(async (num: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    try {
      const page = await pdfDocRef.current.getPage(num);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e: any) {
      console.error("Erro ao renderizar pagina", e);
      // Desenhar no canvas falhou (deixaria a tela em branco sem aviso) —
      // cai no fallback nativo para o cliente não ficar sem a proposta.
      setErro((atual) => atual ?? "Não foi possível desenhar o documento.");
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    let carregou = false;
    // Rede lenta ou browser sem suporte a worker de módulo (ex.: alguns
    // celulares) podem travar o pdf.js no "carregando" para sempre. O timeout
    // garante que caímos no visualizador nativo (iframe) em vez de tela vazia.
    const timeout = setTimeout(() => {
      if (cancelado || carregou) return;
      setErro("O visualizador demorou a responder.");
      setCarregando(false);
    }, 8000);

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise;
        if (cancelado) return;
        carregou = true;
        clearTimeout(timeout);
        pdfDocRef.current = doc;
        setTotalPaginas(doc.numPages);
        setCarregando(false);
        await renderizarPagina(1);

        const primeiraPagComCampo = campos
          .filter((c) => c.documento === documento && c.signatario_ordem === signatarioOrdem)
          .sort((a, b) => a.pagina - b.pagina)[0];
        if (primeiraPagComCampo && primeiraPagComCampo.pagina > 1) {
          setPaginaAtual(primeiraPagComCampo.pagina);
        }
      } catch (e: any) {
        if (cancelado) return;
        clearTimeout(timeout);
        console.error("Erro ao carregar PDF", e);
        setCarregando(false);
        setErro(e?.message || "Não foi possível carregar o documento.");
      }
    })();
    return () => { cancelado = true; clearTimeout(timeout); };
  }, [pdfUrl, renderizarPagina, campos, documento, signatarioOrdem]);

  useEffect(() => {
    if (!carregando && !erro) renderizarPagina(paginaAtual);
  }, [paginaAtual, carregando, erro, renderizarPagina]);

  const camposPagina = campos.filter(
    (c) => c.pagina === paginaAtual && c.documento === documento
  );

  const meusCamposPagina = camposPagina.filter((c) => c.signatario_ordem === signatarioOrdem);
  const outrosCamposPagina = camposPagina.filter((c) => c.signatario_ordem !== signatarioOrdem);

  const corIdx = (signatarioOrdem - 2) % CORES.length;
  const cor = CORES[corIdx] || CORES[0];

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (erro) {
    // Fallback universal: o visualizador com campos clicáveis (pdf.js) falhou,
    // mas o cliente PRECISA ver a proposta. Mostramos o PDF nativo do navegador
    // (iframe) — que funciona sem pdf.js — e um botão para abrir em tela cheia,
    // essencial no celular, onde o iframe às vezes não renderiza inline.
    return (
      <div className="space-y-3">
        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
          <iframe src={pdfUrl} className="w-full h-[500px]" title="Proposta" />
        </div>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md"
        >
          <FileSignature className="h-4 w-4" /> Abrir proposta em tela cheia
        </a>
        <p className="text-[11px] text-slate-500 text-center">
          Você pode ler a proposta acima e assinar no painel abaixo normalmente.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 bg-slate-100 rounded-xl px-4 py-2">
        <button
          onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
          disabled={paginaAtual <= 1}
          className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-bold text-slate-600">
          Página {paginaAtual} / {totalPaginas}
        </span>
        <button
          onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
          disabled={paginaAtual >= totalPaginas}
          className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div ref={containerRef} className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-200">
        <canvas ref={canvasRef} className="w-full h-auto block" />

        {outrosCamposPagina.map((campo) => (
          <div
            key={campo.id}
            className="absolute flex items-center justify-center gap-1 rounded-md border-2 border-dashed opacity-30 pointer-events-none"
            style={{
              left: `${campo.x * 100}%`,
              top: `${campo.y * 100}%`,
              width: `${campo.largura * 100}%`,
              height: `${campo.altura * 100}%`,
              backgroundColor: "rgba(148,163,184,0.15)",
              borderColor: "#94a3b8",
            }}
          >
            <span className="text-[8px] font-bold text-slate-400">Outro signatário</span>
          </div>
        ))}

        {meusCamposPagina.map((campo) => (
          <div
            key={campo.id}
            onClick={() => !assinado && onCampoClick(campo)}
            className={`absolute flex items-center justify-center gap-1.5 rounded-lg border-2 transition-colors duration-150 ease-out ${assinado ? "pointer-events-none" : "cursor-pointer hover:scale-[1.02]"} ${!assinado ? "animate-pulse ring-2 " + cor.pulse : ""}`}
            style={{
              left: `${campo.x * 100}%`,
              top: `${campo.y * 100}%`,
              width: `${campo.largura * 100}%`,
              height: `${campo.altura * 100}%`,
              backgroundColor: assinado ? "rgba(16,185,129,0.15)" : cor.bg,
              borderColor: assinado ? "#10b981" : cor.border,
            }}
          >
            {assinado ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <>
                <FileSignature className="h-4 w-4" style={{ color: cor.text }} />
                <span className="text-[10px] font-bold" style={{ color: cor.text }}>Assinar aqui</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
