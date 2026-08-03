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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  const renderizarPagina = useCallback(async (num: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    const page = await pdfDocRef.current.getPage(num);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = canvasRef.current;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjsLib.getDocument(pdfUrl).promise;
      if (cancelado) return;
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
    })();
    return () => { cancelado = true; };
  }, [pdfUrl, renderizarPagina, campos, documento, signatarioOrdem]);

  useEffect(() => {
    if (!carregando) renderizarPagina(paginaAtual);
  }, [paginaAtual, carregando, renderizarPagina]);

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
          Pagina {paginaAtual} / {totalPaginas}
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
            <span className="text-[8px] font-bold text-slate-400">Outro signatario</span>
          </div>
        ))}

        {meusCamposPagina.map((campo) => (
          <div
            key={campo.id}
            onClick={() => !assinado && onCampoClick(campo)}
            className={`absolute flex items-center justify-center gap-1.5 rounded-lg border-2 transition-all ${assinado ? "pointer-events-none" : "cursor-pointer hover:scale-[1.02]"} ${!assinado ? "animate-pulse ring-2 " + cor.pulse : ""}`}
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
