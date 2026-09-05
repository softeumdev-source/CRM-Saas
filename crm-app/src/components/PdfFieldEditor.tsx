"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CampoAssinatura } from "@/lib/types";
import { FileSignature, Trash2, ChevronLeft, ChevronRight, Loader2, Send, MousePointer2 } from "lucide-react";

// Reexportado para quem ja importava o tipo daqui junto com o componente.
// A definicao vive em `@/lib/types`, longe do `"use client"`.
export type { CampoAssinatura };

interface Signatario {
  nome: string;
  email: string;
  ordem: number;
}

const CORES_SIGNATARIOS = [
  { bg: "rgba(79,70,229,0.18)", border: "#4f46e5", text: "#4f46e5", label: "bg-acento-fraco text-acento border-fio-forte" },
  { bg: "rgba(16,185,129,0.18)", border: "#10b981", text: "#10b981", label: "bg-ok-fraco text-ok border-ok/40" },
  { bg: "rgba(245,158,11,0.18)", border: "#f59e0b", text: "#f59e0b", label: "bg-alerta-fraco text-alerta border-alerta/40" },
  { bg: "rgba(239,68,68,0.18)", border: "#ef4444", text: "#ef4444", label: "bg-risco-fraco text-risco border-risco/40" },
];

export function PdfFieldEditor({
  pdfUrl,
  documento,
  signatarios,
  camposIniciais,
  onSalvar,
  onCancelar,
  enviando,
}: {
  pdfUrl: string;
  documento: "comercial" | "tecnica";
  signatarios: Signatario[];
  camposIniciais: CampoAssinatura[];
  onSalvar: (campos: CampoAssinatura[]) => void;
  onCancelar: () => void;
  enviando?: boolean;
}) {
  const [campos, setCampos] = useState<CampoAssinatura[]>(camposIniciais);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [signatarioSelecionado, setSignatarioSelecionado] = useState(signatarios[0]?.ordem ?? 2);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [offsetArrasto, setOffsetArrasto] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const dimensoesRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const renderizarPagina = useCallback(async (num: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    const page = await pdfDocRef.current.getPage(num);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = canvasRef.current;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    dimensoesRef.current = { width: viewport.width, height: viewport.height };
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
    })();
    return () => { cancelado = true; };
  }, [pdfUrl, renderizarPagina]);

  useEffect(() => {
    if (!carregando) renderizarPagina(paginaAtual);
  }, [paginaAtual, carregando, renderizarPagina]);

  const adicionarCampo = () => {
    const novo: CampoAssinatura = {
      id: `campo-${Date.now()}`,
      signatario_ordem: signatarioSelecionado,
      tipo: "assinatura",
      documento,
      pagina: paginaAtual,
      x: 0.55,
      y: 0.8,
      largura: 0.22,
      altura: 0.05,
    };
    setCampos((prev) => [...prev, novo]);
  };

  const removerCampo = (id: string) => {
    setCampos((prev) => prev.filter((c) => c.id !== id));
  };

  const handleMouseDown = (e: React.MouseEvent, campoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const campo = campos.find((c) => c.id === campoId);
    if (!campo) return;
    const campoX = campo.x * rect.width;
    const campoY = campo.y * rect.height;
    setOffsetArrasto({ x: e.clientX - rect.left - campoX, y: e.clientY - rect.top - campoY });
    setArrastando(campoId);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!arrastando || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - offsetArrasto.x) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top - offsetArrasto.y) / rect.height));
    setCampos((prev) => prev.map((c) => (c.id === arrastando ? { ...c, x, y } : c)));
  }, [arrastando, offsetArrasto]);

  const handleMouseUp = useCallback(() => {
    setArrastando(null);
  }, []);

  useEffect(() => {
    if (arrastando) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [arrastando, handleMouseMove, handleMouseUp]);

  const handleClickCanvas = (e: React.MouseEvent) => {
    if (arrastando) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(0.78, (e.clientX - rect.left) / rect.width - 0.11));
    const y = Math.max(0, Math.min(0.95, (e.clientY - rect.top) / rect.height - 0.025));
    const novo: CampoAssinatura = {
      id: `campo-${Date.now()}`,
      signatario_ordem: signatarioSelecionado,
      tipo: "assinatura",
      documento,
      pagina: paginaAtual,
      x,
      y,
      largura: 0.22,
      altura: 0.05,
    };
    setCampos((prev) => [...prev, novo]);
  };

  const camposPagina = campos.filter((c) => c.pagina === paginaAtual && c.documento === documento);

  const corSignatario = (ordem: number) => CORES_SIGNATARIOS[(ordem - 2) % CORES_SIGNATARIOS.length] || CORES_SIGNATARIOS[0];

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-acento" />
        <span className="ml-2 text-corpo text-tinta-suave">Carregando documento...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Sidebar */}
      <div className="lg:w-64 shrink-0 space-y-4">
        <div className="bg-recuo rounded-xl p-3 border border-fio">
          <p className="text-rotulo font-medium uppercase text-tinta-fraca mb-2">Signatarios</p>
          {signatarios.map((s) => {
            const cor = corSignatario(s.ordem);
            const selecionado = signatarioSelecionado === s.ordem;
            return (
              <button
                key={s.ordem}
                onClick={() => setSignatarioSelecionado(s.ordem)}
                className={`foco w-full text-left px-3 py-2 rounded-lg mb-1 text-rotulo font-medium border transition-colors duration-150 ease-out ${selecionado ? cor.label + " border-2" : "bg-superficie border-fio text-tinta-suave"}`}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: cor.border }} />
                {s.nome || s.email}
              </button>
            );
          })}
        </div>

        <div className="bg-recuo rounded-xl p-3 border border-fio">
          <p className="text-rotulo font-medium uppercase text-tinta-fraca mb-2">Campos</p>
          <button onClick={adicionarCampo} className="foco w-full flex items-center gap-2 px-3 py-2 text-rotulo font-semibold text-acento bg-acento-fraco hover:bg-acento-fraco rounded-lg border border-fio">
            <FileSignature className="h-4 w-4" /> Assinatura
          </button>
          <p className="text-rotulo text-tinta-fraca mt-2 leading-relaxed">
            Clique no botão ou clique diretamente no documento para posicionar o campo de assinatura.
          </p>
        </div>

        <div className="bg-recuo rounded-xl p-3 border border-fio">
          <p className="text-rotulo font-medium uppercase text-tinta-fraca mb-2">Campos posicionados ({campos.length})</p>
          {campos.length === 0 && <p className="text-rotulo text-tinta-fraca">Nenhum campo adicionado.</p>}
          {campos.map((c) => {
            const sig = signatarios.find((s) => s.ordem === c.signatario_ordem);
            const cor = corSignatario(c.signatario_ordem);
            return (
              <div key={c.id} className="flex items-center justify-between text-rotulo px-2 py-1.5 rounded-lg mb-1 border" style={{ backgroundColor: cor.bg, borderColor: cor.border }}>
                <span className="font-medium truncate" style={{ color: cor.text }}>
                  Pag.{c.pagina} · {sig?.nome || "?"}
                </span>
                <button onClick={() => removerCampo(c.id)} className="foco text-tinta-fraca hover:text-risco shrink-0">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onSalvar(campos)}
            disabled={campos.length === 0 || enviando}
            className="foco w-full py-2.5 text-rotulo font-semibold text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar para assinatura
          </button>
          <button onClick={onCancelar} className="foco w-full py-2 text-rotulo font-medium text-tinta-suave hover:bg-recuo rounded-xl">
            Cancelar
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2 bg-recuo rounded-xl px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
              disabled={paginaAtual <= 1}
              className="foco p-1 rounded-lg hover:bg-fio disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-rotulo font-medium text-tinta-suave min-w-20 text-center">
              Pagina {paginaAtual} / {totalPaginas}
            </span>
            <button
              onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaAtual >= totalPaginas}
              className="foco p-1 rounded-lg hover:bg-fio disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1 text-rotulo text-tinta-fraca">
            <MousePointer2 className="h-3 w-3" /> Clique no documento para posicionar
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative border border-fio rounded-xl overflow-hidden bg-fio cursor-crosshair"
          onClick={handleClickCanvas}
        >
          <canvas ref={canvasRef} className="w-full h-auto block" />

          {camposPagina.map((campo) => {
            const cor = corSignatario(campo.signatario_ordem);
            const sig = signatarios.find((s) => s.ordem === campo.signatario_ordem);
            return (
              <div
                key={campo.id}
                onMouseDown={(e) => handleMouseDown(e, campo.id)}
                onClick={(e) => e.stopPropagation()}
                className="absolute flex items-center justify-center gap-1 rounded-lg border-2 border-dashed select-none group"
                style={{
                  left: `${campo.x * 100}%`,
                  top: `${campo.y * 100}%`,
                  width: `${campo.largura * 100}%`,
                  height: `${campo.altura * 100}%`,
                  backgroundColor: cor.bg,
                  borderColor: cor.border,
                  cursor: arrastando === campo.id ? "grabbing" : "grab",
                }}
              >
                <FileSignature className="h-3.5 w-3.5" style={{ color: cor.text }} />
                <span className="text-rotulo font-medium truncate" style={{ color: cor.text }}>
                  {sig?.nome?.split(" ")[0] || "Assinar"}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removerCampo(campo.id); }}
                  className="foco absolute -top-2 -right-2 bg-superficie rounded-full p-0.5 shadow-flutuante border border-fio opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-2.5 w-2.5 text-risco" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
