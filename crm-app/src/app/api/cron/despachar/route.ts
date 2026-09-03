import { NextResponse } from "next/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { enviarEmail, emailBase, temResendConfigurado } from "@/lib/resend";

/**
 * O despachante da cadência.
 *
 * A divisão com o banco é proposital: o Postgres decide *o que* venceu (é
 * barato e transacional, e o `pg_cron` já bate de 5 em 5 minutos porque o plano
 * Hobby da Vercel só permite um cron por dia); esta rota faz a *chamada
 * externa*, que é onde estão os SDKs e os segredos.
 *
 * Nada aqui decide se uma mensagem *pode* sair. `reservar_mensagens` só
 * devolve o que já está aprovado — por um humano, ou pela cadência marcada
 * como autônoma. Esta rota não sabe aprovar, e é de propósito: foi exatamente
 * uma rota que enviava por conta própria que precisou ser removida deste
 * projeto.
 */
export const maxDuration = 60;

/** Teto por execução. Com o cron de 5 minutos, dá 240 e-mails/hora. */
const LOTE = 20;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!temServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 503 });
  }
  // Sem Resend, reservar a fila marcaria tudo como "enviando" e queimaria as 5
  // tentativas de cada mensagem contra um erro que não é dela. Melhor não
  // tocar na fila.
  if (!temResendConfigurado()) {
    return NextResponse.json({ error: "RESEND_API_KEY não configurada." }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data: mensagens, error } = await supabase.rpc("reservar_mensagens", { p_limite: LOTE });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultado = { reservadas: mensagens?.length ?? 0, enviadas: 0, reagendadas: 0, falhou: 0 };

  for (const m of mensagens || []) {
    if (!m.destino) {
      await supabase.rpc("concluir_envio", {
        p_id: m.id,
        p_ok: false,
        p_erro: "mensagem sem destinatário",
      });
      resultado.falhou += 1;
      continue;
    }

    const r = await enviarEmail({
      to: m.destino,
      subject: m.assunto || "Softeum",
      html: emailBase(m.corpo),
    });

    const { data: desfecho } = await supabase.rpc("concluir_envio", {
      p_id: m.id,
      p_ok: r.sent,
      p_provedor_id: r.id ?? undefined,
      p_erro: r.sent ? undefined : r.error || "falha desconhecida no envio",
    });

    if (desfecho === "enviada") resultado.enviadas += 1;
    else if (desfecho === "reagendada") resultado.reagendadas += 1;
    else resultado.falhou += 1;
  }

  return NextResponse.json(resultado);
}
