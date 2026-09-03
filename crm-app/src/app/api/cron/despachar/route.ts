import { NextResponse } from "next/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { enviarEmail, emailBase, temResendConfigurado } from "@/lib/resend";
import { enviarTemplate, temWhatsappConfigurado } from "@/lib/whatsapp/cliente";

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

/** Teto por execução. O WhatsApp tem freio próprio, no banco. */
const LOTE = 20;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!temServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 503 });
  }
  // Sem provedor nenhum, reservar a fila marcaria tudo como "enviando" e
  // queimaria as 5 tentativas de cada mensagem contra um erro que não é dela.
  // Melhor não tocar na fila.
  if (!temResendConfigurado() && !temWhatsappConfigurado()) {
    return NextResponse.json(
      { error: "Nenhum provedor configurado (RESEND_API_KEY ou WHATSAPP_TOKEN)." },
      { status: 503 },
    );
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

    // O WhatsApp não manda `corpo`: manda o nome do template aprovado e as
    // variáveis. O `corpo` renderizado é a prévia que quem aprovou leu.
    const r =
      m.canal === "whatsapp"
        ? await (async () => {
            if (!m.template_externo) {
              return { ok: false, erro: "mensagem sem template aprovado na Meta", codigo: "sem_template" };
            }
            const w = await enviarTemplate({
              para: m.destino!,
              template: m.template_externo,
              variaveis: m.variaveis || [],
            });
            return { ok: w.enviado, id: w.id, erro: w.erro, codigo: w.codigo };
          })()
        : await (async () => {
            const e = await enviarEmail({
              to: m.destino!,
              subject: m.assunto || "Softeum",
              html: emailBase(m.corpo),
            });
            return { ok: e.sent, id: e.id, erro: e.error, codigo: undefined as string | undefined };
          })();

    const { data: desfecho } = await supabase.rpc("concluir_envio", {
      p_id: m.id,
      p_ok: r.ok,
      p_provedor_id: r.id ?? undefined,
      p_erro: r.ok ? undefined : r.erro || "falha desconhecida no envio",
      p_erro_codigo: r.codigo ?? undefined,
    });

    if (desfecho === "enviada") resultado.enviadas += 1;
    else if (desfecho === "reagendada") resultado.reagendadas += 1;
    else resultado.falhou += 1;
  }

  return NextResponse.json(resultado);
}
