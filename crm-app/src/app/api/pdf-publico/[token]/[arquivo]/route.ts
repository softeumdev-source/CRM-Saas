import { NextResponse } from "next/server";
import { SUPABASE_URL } from "@/lib/supabase/config";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; arquivo: string }> }
) {
  const { token, arquivo } = await params;

  if (!/^[a-f0-9]+$/.test(token) || !/^(comercial|tecnica)\.pdf$/.test(arquivo)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const url = `${SUPABASE_URL}/storage/v1/object/public/assinatura-publica/${token}/${arquivo}`;
  const resp = await fetch(url);

  if (!resp.ok) {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  }

  const buffer = await resp.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
