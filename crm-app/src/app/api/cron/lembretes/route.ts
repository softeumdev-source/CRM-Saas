import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("processar_lembretes");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ processados: data });
}
