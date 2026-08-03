"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Eraser } from "lucide-react";

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const desenhando = useRef(false);
  const [vazio, setVazio] = useState(true);

  const configCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1e293b";
    }
  }, []);

  useEffect(() => {
    configCanvas();
    window.addEventListener("resize", configCanvas);
    return () => window.removeEventListener("resize", configCanvas);
  }, [configCanvas]);

  const posicao = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    desenhando.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    const { x, y } = posicao(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicao(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setVazio(false);
  };

  const handleUp = () => {
    desenhando.current = false;
    const canvas = canvasRef.current;
    if (canvas && !vazio) onChange(canvas.toDataURL("image/png"));
  };

  const limpar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      configCanvas();
    }
    setVazio(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="w-full h-40">
        <canvas
          ref={canvasRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          className="w-full h-full bg-white rounded-xl border-2 border-dashed border-slate-300 touch-none cursor-crosshair"
        />
      </div>
      <button
        type="button"
        onClick={limpar}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600"
      >
        <Eraser className="h-3.5 w-3.5" />
        Limpar assinatura
      </button>
    </div>
  );
}
