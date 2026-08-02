import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json();
  const { tipo, dados } = body;

  if (!tipo || !dados) {
    return NextResponse.json({ error: "Assinatura vazia." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
  const userAgent = request.headers.get("user-agent") || "desconhecido";

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("registrar_assinatura", {
    p_token: token,
    p_tipo: tipo,
    p_dados: dados,
    p_ip: ip,
    p_user_agent: userAgent,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
