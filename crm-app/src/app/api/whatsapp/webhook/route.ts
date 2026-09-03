import { NextResponse } from "next/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { resolverPorTelefone } from "@/lib/entrada/resolver";
import { gravarEntrada } from "@/lib/entrada/gravar";
import { guardarAnexo } from "@/lib/anexos";
import { baixarMidia } from "@/lib/whatsapp/cliente";
import {
  assinaturaConfere,
  corpoDaMensagem,
  midiaDaMensagem,
  recebidaEm,
  valoresDoPayload,
  type ValorMeta,
} from "@/lib/whatsapp/webhook";

/**
 * O webhook da Meta.
 *
 * Esta rota é pública — tem que ser, porque a Meta não faz login. Quem faz o
 * papel da autenticação é a **assinatura**, e é por isso que ela é conferida
 * antes de qualquer outra coisa, inclusive antes de olhar se o app está
 * configurado: requisição não assinada não merece uma consulta ao banco.
 *
 * O caminho COMPLETO entra em `PUBLIC_PATHS`. O prefixo curto `/api/whatsapp`
 * liberaria junto `/api/whatsapp/responder`, que envia mensagem.
 */
export const maxDuration = 60;

/**
 * A Meta REPETE a entrega em qualquer resposta que não seja 200.
 *
 * Isso é o oposto do sync do Gmail, onde o cursor é nosso e segurá-lo faz a
 * próxima rodada retomar. Aqui, devolver erro por causa de uma mensagem que
 * falha sempre a faria ser reentregue para sempre. Então:
 *
 * - assinatura inválida            -> 401, sem processar nada;
 * - alguma mensagem gravada        -> 200, mesmo que outra tenha falhado;
 * - TODAS falharam                 -> 500, porque aí é infraestrutura (banco
 *   fora) e repetir é exatamente o certo — as já gravadas voltam `duplicada`.
 */
export async function POST(request: Request) {
  const segredo = process.env.WHATSAPP_APP_SECRET;

  // O corpo BRUTO, antes de qualquer parse. Ver `assinaturaConfere`.
  const cru = await request.text();

  if (!segredo || !assinaturaConfere(cru, request.headers.get("x-hub-signature-256"), segredo)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  if (!temServiceRole()) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY não configurada." },
      { status: 503 },
    );
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(cru);
  } catch {
    // Corpo assinado por nós e ainda assim ilegível não melhora com reentrega.
    return NextResponse.json({ error: "Corpo não é JSON." }, { status: 400 });
  }

  const admin = createAdminClient();
  const resultado = { gravadas: 0, duplicadas: 0, quarentena: 0, ignoradas: 0, falhas: 0 };

  for (const valor of valoresDoPayload(corpo)) {
    // `statuses[]` são recibos de entrega. O estado de envio já é mantido por
    // `concluir_envio`; gravar aqui contaria a mesma mensagem duas vezes.
    if (!valor.messages?.length) continue;

    const tenantId = await tenantDoNumero(admin, valor);
    if (!tenantId) {
      // Número que não é nosso, ou `whatsapp_config.numero_id` ainda em branco.
      resultado.ignoradas += valor.messages.length;
      continue;
    }

    for (const m of valor.messages) {
      try {
        resultado[await processar(admin, m, tenantId)] += 1;
      } catch {
        resultado.falhas += 1;
      }
    }
  }

  const houveTentativa = resultado.falhas > 0;
  const houveSucesso =
    resultado.gravadas + resultado.duplicadas + resultado.quarentena + resultado.ignoradas > 0;

  if (houveTentativa && !houveSucesso) {
    return NextResponse.json({ error: "Nada pôde ser gravado.", ...resultado }, { status: 500 });
  }
  return NextResponse.json(resultado);
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Qual empresa recebeu.
 *
 * `whatsapp_config.numero_id` é a única ligação entre um evento da Meta e um
 * tenant. Enquanto ninguém preencher esse campo no admin, todo evento é
 * ignorado — o que é o comportamento certo: sem saber de quem é o número, não
 * há onde gravar.
 */
async function tenantDoNumero(admin: Admin, valor: ValorMeta): Promise<string | null> {
  const numeroId = valor.metadata?.phone_number_id;
  if (!numeroId) return null;

  const { data } = await admin
    .from("whatsapp_config")
    .select("tenant_id")
    .eq("numero_id", numeroId)
    .maybeSingle();

  return data?.tenant_id ?? null;
}

async function processar(
  admin: Admin,
  m: Parameters<typeof corpoDaMensagem>[0],
  tenantId: string,
): Promise<"gravadas" | "duplicadas" | "quarentena" | "ignoradas"> {
  const corpo = corpoDaMensagem(m);
  const quando = recebidaEm(m.timestamp);
  if (!corpo || !quando || !m.from || !m.id) return "ignoradas";

  // Papel `null` DE PROPÓSITO. O número do WhatsApp é da empresa, não de uma
  // pessoa, então não existe "o funil de quem recebeu" como existe na caixa de
  // e-mail de um vendedor. O desempate cai direto para a conversa mais viva e,
  // no empate honesto, para a quarentena.
  const resolucao = await resolverPorTelefone(admin, m.from, null, tenantId);

  const resultado = await gravarEntrada(
    admin,
    resolucao,
    {
      externoId: m.id, // o `wamid` — é o que absorve a reentrega
      canal: "whatsapp",
      destino: m.from,
      assunto: null,
      corpo,
      recebidaEm: quando,
      // Quem escreve num WhatsApp é gente. Não há cabeçalho de auto-resposta
      // aqui como há no e-mail, e chutar `true` mataria o sinal no card.
      automatica: false,
      threadExterno: null,
      direcao: "entrada",
    },
    // Sem dono: o número é da empresa. `mensagens_sem_negocio.usuario_id` é
    // nulável exatamente para este caso.
    { tenantId, usuarioId: null },
  );

  // A mídia, que até agora virava só o marcador "[imagem]" com o id descartado.
  //
  // NUNCA propaga erro: a Meta reentrega tudo o que não responder 200, e
  // derrubar o webhook por causa de um arquivo faria a mensagem inteira voltar.
  // `guardarAnexo` grava a linha com o id da mídia mesmo quando o download
  // falha, e é isso que deixa a busca retentável — o link da Meta expira, o id
  // não.
  const midia = midiaDaMensagem(m);
  if (resultado.desfecho === "gravada" && resultado.mensagemId && midia && resolucao.tipo === "negocio") {
    await guardarAnexo(admin, {
      tenantId,
      negocioId: resolucao.negocioId,
      mensagemId: resultado.mensagemId,
      nome: midia.nome,
      mime: midia.mime,
      origem: "whatsapp",
      externoId: midia.id,
      baixar: () => baixarMidia(midia.id),
    });
  }

  return resultado.desfecho === "gravada"
    ? "gravadas"
    : resultado.desfecho === "duplicada"
      ? "duplicadas"
      : resultado.desfecho === "quarentena"
        ? "quarentena"
        : "ignoradas";
}

/**
 * O aperto de mão da Meta.
 *
 * Devolve o `hub.challenge` **cru**, em `text/plain`. A Meta compara o corpo
 * literal — um JSON com o valor dentro reprova a verificação.
 */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;

  if (
    p.get("hub.mode") === "subscribe" &&
    esperado &&
    p.get("hub.verify_token") === esperado &&
    p.get("hub.challenge")
  ) {
    return new Response(p.get("hub.challenge")!, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.json({ error: "Verificação recusada." }, { status: 403 });
}
