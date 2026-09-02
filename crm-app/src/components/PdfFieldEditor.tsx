"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FileSignature,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  MousePointer2,
} from "lucide-react";

export interface CampoAssinatura {
  id: string;
  signatario_ordem: number;
  tipo: "assinatura";
  documento: "comercial" | "tecnica";
  pagina: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
}

interface Signatario {
  nome: string;
  email: string;
  ordem: number;
}

const CORES_SIGNATARIOS = [
  {
    bg: "rgba(79,70,229,0.18)",
    border: "#4f46e5",
    text: "#4f46e5",
    label: "bg-indigo-100 text-indigo-700 border-indigo-300",
  },
  {
    bg: "rgba(16,185,129,0.18)",
    border: "#10b981",
    text: "#10b981",
    label: "bg-emerald-100 text-emerald-700 border-emerald-300",
  },
  {
    bg: "rgba(245,158,11,0.18)",
    border: "#f59e0b",
    text: "#f59e0b",
    label: "bg-amber-100 text-amber-700 border-amber-300",
  },
  {
    bg: "rgba(239,68,68,0.18)",
    border: "#ef4444",
    text: "#ef4444",
    label: "bg-rose-100 text-rose-700 border-rose-300",
  },
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
  const pdfDocRef = useRef<any>(null);
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
    return () => {
      cancelado = true;
    };
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

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!arrastando || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left - offsetArrasto.x) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top - offsetArrasto.y) / rect.height));
      setCampos((prev) => prev.map((c) => (c.id === arrastando ? { ...c, x, y } : c)));
    },
    [arrastando, offsetArrasto],
  );

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

  const corSignatario = (ordem: number) =>
    CORES_SIGNATARIOS[(ordem - 2) % CORES_SIGNATARIOS.length] || CORES_SIGNATARIOS[0];

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        <span className="text-corpo-lg ml-2 text-tinta-suave">Carregando documento…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Sidebar */}
      <div className="lg:w-64 shrink-0 space-y-4">
        <div className="rounded-xl bg-recuo p-3">
          <p className="text-rotulo mb-2 block uppercase text-tinta-fraca">Signatários</p>
          {signatarios.map((s) => {
            const cor = corSignatario(s.ordem);
            const selecionado = signatarioSelecionado === s.ordem;
            return (
              <button
                key={s.ordem}
                onClick={() => setSignatarioSelecionado(s.ordem)}
                className={`text-corpo-lg mb-1 w-full rounded-lg px-3 py-2 text-left font-medium transition-colors duration-150 ease-out ${selecionado ? cor.label : "bg-cartao text-tinta-suave hover:text-tinta"}`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
                  style={{ backgroundColor: cor.border }}
                />
                {s.nome || s.email}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl bg-recuo p-3">
          <p className="text-rotulo mb-2 block uppercase text-tinta-fraca">Campos</p>
          <button
            onClick={adicionarCampo}
            className="text-corpo-lg flex w-full items-center gap-2 rounded-lg bg-cartao px-3 py-2 font-medium text-tinta transition-colors duration-150 ease-out hover:bg-fio"
          >
            <FileSignature className="h-4 w-4" /> Assinatura
          </button>
          <p className="text-corpo text-tinta-fraca mt-2 leading-relaxed">
            Clique no botão ou clique diretamente no documento para posicionar o campo de
            assinatura.
          </p>
        </div>

        <div className="rounded-xl bg-recuo p-3">
          <p className="text-rotulo mb-2 block uppercase text-tinta-fraca">
            Campos posicionados ({campos.length})
          </p>
          {campos.length === 0 && (
            <p className="text-corpo text-tinta-fraca">Nenhum campo adicionado.</p>
          )}
          {campos.map((c) => {
            const sig = signatarios.find((s) => s.ordem === c.signatario_ordem);
            const cor = corSignatario(c.signatario_ordem);
            return (
              <div
                key={c.id}
                className="flex items-center justify-between text-corpo px-2 py-1.5 rounded-lg mb-1 border"
                style={{ backgroundColor: cor.bg, borderColor: cor.border }}
              >
                <span className="font-semibold truncate" style={{ color: cor.text }}>
                  Pag.{c.pagina} · {sig?.nome || "?"}
                </span>
                <button
                  onClick={() => removerCampo(c.id)}
                  className="text-tinta-fraca hover:text-rose-600 shrink-0"
                >
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
            className="w-full py-2.5 text-corpo-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-cartao flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar para assinatura
          </button>
          <button
            onClick={onCancelar}
            className="text-corpo-lg w-full rounded-lg py-2 font-medium text-tinta-suave transition-colors duration-150 ease-out hover:bg-recuo hover:text-tinta"
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 min-w-0">
        <div className="mb-2 flex items-center justify-between rounded-lg bg-recuo px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
              disabled={paginaAtual <= 1}
              className="rounded-lg p-1 transition-colors duration-150 ease-out hover:bg-fio disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-corpo-lg min-w-[80px] text-center font-medium text-tinta-suave">
              Pagina {paginaAtual} / {totalPaginas}
            </span>
            <button
              onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaAtual >= totalPaginas}
              className="rounded-lg p-1 transition-colors duration-150 ease-out hover:bg-fio disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1 text-corpo text-tinta-fraca">
            <MousePointer2 className="h-3 w-3" /> Clique no documento para posicionar
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative cursor-crosshair overflow-hidden rounded-xl bg-recuo"
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
                className="absolute flex items-center justify-center gap-1 rounded-md border-2 border-dashed select-none group"
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
                <span className="text-[9px] font-medium truncate" style={{ color: cor.text }}>
                  {sig?.nome?.split(" ")[0] || "Assinar"}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removerCampo(campo.id);
                  }}
                  className="absolute -right-2 -top-2 rounded-full bg-cartao p-0.5 opacity-0 shadow-cartao transition-opacity duration-150 ease-out group-hover:opacity-100"
                >
                  <Trash2 className="h-2.5 w-2.5 text-rose-500" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
