import { NextResponse } from "next/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { emailBase } from "@/lib/resend";
import { enviarTemplate, temWhatsappConfigurado } from "@/lib/whatsapp/cliente";
import { enviarPeloGmail } from "@/lib/gmail/enviar";
import {
  assuntoDeResposta,
  caixasDeSaida,
  NOME_PADRAO_DO_REMETENTE,
  threadsDosNegocios,
  type ContextoDeThread,
} from "@/lib/gmail/caixa";
import { temGoogleConfigurado } from "@/lib/google/config";

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
 *
 * O e-mail saía pelo Resend, de um endereço de sistema. Agora sai pela caixa
 * comercial do próprio tenant, pelo Gmail — e a diferença não é de fornecedor:
 * a resposta do cliente cai numa caixa que a sincronização LÊ, dentro da mesma
 * thread. Antes ela caía num endereço que ninguém abria, e o CRM ficava
 * indistinguível de "ninguém respondeu".
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

  const supabase = createAdminClient();

  // A guarda ANTES de reservar, e não depois: reservar marca tudo como
  // "enviando" e queima as 5 tentativas de cada mensagem contra um erro que não
  // é dela. Por isso a pergunta "existe alguma caixa de saída?" vem primeiro.
  //
  // Uma consulta a mais por rodada (a cada 5 minutos) para não estragar a fila
  // inteira quando alguém esquece de conectar a conta.
  const caixas = temGoogleConfigurado()
    ? await caixasDeSaida(
        supabase,
        ((await supabase.from("tenants").select("id")).data || []).map((t) => t.id),
      )
    : new Map();

  if (caixas.size === 0 && !temWhatsappConfigurado()) {
    return NextResponse.json(
      {
        error:
          "Nenhum canal pronto: nenhum tenant tem caixa de e-mail conectada com permissão de envio, " +
          "e o WhatsApp não está configurado.",
      },
      { status: 503 },
    );
  }

  const { data: mensagens, error } = await supabase.rpc("reservar_mensagens", { p_limite: LOTE });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultado = { reservadas: mensagens?.length ?? 0, enviadas: 0, reagendadas: 0, falhou: 0 };

  // Quem assina o e-mail, e em que conversa ele entra.
  //
  // Reply-To deixou de ser necessario: o endereco de saida JA e a caixa que a
  // sincronizacao le, entao a resposta volta sozinha para dentro do CRM. O que
  // sobra do dono do negocio e o NOME exibido — o cliente ve com quem esta
  // falando, sem que o endereco mude e a thread quebre.
  //
  // Duas consultas para o LOTE inteiro, nao duas por mensagem: sao ate 20 por
  // rodada, a cada 5 minutos.
  const idsDeNegocio = [
    ...new Set(
      (mensagens || [])
        .filter((m) => m.canal === "email" && m.negocio_id)
        .map((m) => m.negocio_id as string),
    ),
  ];
  // A consulta dos DONOS saiu daqui junto com `quemAssina`. Ela existia só para
  // decidir o nome do remetente a partir do responsável pelo negócio — e esse
  // era o defeito: lead novo em prospecção não tem dono, então o nome caía num
  // literal, e quando tinha dono saía o nome de quem por acaso estava com o
  // card. O nome agora vem da caixa (`caixa.nome`), que é uma só.
  let threads = new Map<string, ContextoDeThread>();
  if (idsDeNegocio.length > 0) {
    threads = await threadsDosNegocios(supabase, idsDeNegocio);
  }

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
            const caixa = m.tenant_id ? caixas.get(m.tenant_id) : undefined;
            if (!caixa) {
              return {
                ok: false,
                erro: "o tenant nao tem caixa de e-mail conectada com permissao de envio",
                codigo: "sem_caixa",
              };
            }
            // A thread manda no assunto: o Gmail recusa um `threadId` cujo
            // assunto nao bate com o da conversa. Sem thread, o assunto e o do
            // proprio passo da cadencia.
            const t = m.negocio_id ? threads.get(m.negocio_id) : undefined;
            const assunto = t?.threadId
              ? assuntoDeResposta(t.assunto, m.assunto || "Softeum")
              : m.assunto || "Softeum";
            try {
              const e = await enviarPeloGmail(
                caixa.usuarioId,
                {
                  de: caixa.email,
                  nomeDeExibicao: caixa.nome ?? NOME_PADRAO_DO_REMETENTE,
                  para: m.destino!,
                  assunto,
                  html: emailBase(m.corpo, { assinatura: caixa.nome ?? NOME_PADRAO_DO_REMETENTE }),
                  emRespostaA: t?.emRespostaA ?? null,
                  referencias: t?.referencias ?? null,
                },
                t?.threadId ?? null,
              );
              return { ok: true, id: e.id, threadId: e.threadId, messageId: e.messageId };
            } catch (erro) {
              return { ok: false, erro: erro instanceof Error ? erro.message : "falha no envio pelo Gmail" };
            }
          })();

    // Cada ramo devolve um formato um pouco diferente (o WhatsApp tem `codigo`,
    // o e-mail tem `threadId`), entao a leitura e frouxa de proposito.
    const d = r as { id?: string; codigo?: string; threadId?: string; messageId?: string };
    const { data: desfecho } = await supabase.rpc("concluir_envio", {
      p_id: m.id,
      p_ok: r.ok,
      p_provedor_id: d.id ?? undefined,
      p_erro: r.ok ? undefined : r.erro || "falha desconhecida no envio",
      p_erro_codigo: d.codigo ?? undefined,
      // So o e-mail devolve thread. O WhatsApp manda `undefined`, e o
      // `coalesce` da funcao preserva o que ja estava la.
      p_thread_externo: d.threadId ?? undefined,
      p_message_id_externo: d.messageId ?? undefined,
    });

    if (desfecho === "enviada") resultado.enviadas += 1;
    else if (desfecho === "reagendada") resultado.reagendadas += 1;
    else resultado.falhou += 1;
  }

  return NextResponse.json(resultado);
}
