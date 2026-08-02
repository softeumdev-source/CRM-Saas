"use client";

import { useRef, useState } from "react";
import { Eraser } from "lucide-react";

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);
  const [vazio, setVazio] = useState(true);

  const getCtx = () => canvasRef.current?.getContext("2d");

  const posicao = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    desenhando.current = true;
    const ctx = getCtx();
    const { x, y } = posicao(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = posicao(e);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
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
    const ctx = getCtx();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setVazio(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={480}
        height={160}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
        className="w-full h-40 bg-white rounded-xl border-2 border-dashed border-slate-300 touch-none cursor-crosshair"
      />
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
