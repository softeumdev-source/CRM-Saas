import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { abrirCaixa } from "@/lib/gmail/api";
import { anexosDaMensagem, lerMensagem } from "@/lib/gmail/mime";
import { ANEXOS_POR_MENSAGEM, guardarAnexo } from "@/lib/anexos";

/**
 * Dizer a qual negócio uma mensagem da quarentena pertence.
 *
 * A quarentena guarda **metadados e não o corpo**, de propósito: o comentário
 * da tabela diz que "o corpo é buscado no provedor no momento em que alguém
 * associa a mensagem a um negócio". É essa propriedade que impede o CRM de
 * virar espelho da caixa pessoal de quem sincroniza — e-mail que não casa com
 * negócio nenhum nunca tem o conteúdo lido.
 *
 * Então resolver é, literalmente, o momento em que o corpo passa a poder ser
 * lido. E os dois canais não podem prometer a mesma coisa:
 *
 * - **E-mail**: o `externo_id` é `email:<Message-ID>`, e o Gmail reencontra a
 *   mensagem por `rfc822msgid:`. Vem com corpo e anexos.
 * - **WhatsApp**: não há como reler. A Meta não guarda histórico consultável, e
 *   o webhook é entrega única. Grava com o que existe e **diz isso na tela**,
 *   em vez de fingir que perdeu por acidente.
 */
export const maxDuration = 60;

type Corpo = { id?: string; negocioId?: string };

export async function POST(request: Request) {
  const { id, negocioId } = ((await request.json().catch(() => ({}))) || {}) as Corpo;
  if (!id || !negocioId) {
    return NextResponse.json({ error: "Faltou a mensagem ou o negócio." }, { status: 400 });
  }

  const sessao = await createClient();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // ------------------------------------------------------------------
  // 1. AS DUAS AUTORIZAÇÕES, e as duas com a SESSÃO.
  //
  // A linha da quarentena: `mensagens_sem_negocio_select` é "mesmo tenant E
  // (admin OU a caixa é minha)". O negócio: `negocios_select`. Ler os dois com
  // o cliente da sessão aplica as duas regras sem uma segunda cópia aqui.
  // ------------------------------------------------------------------
  const { data: linha } = await sessao
    .from("mensagens_sem_negocio")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!linha) {
    return NextResponse.json({ error: "Mensagem não encontrada ou sem acesso." }, { status: 403 });
  }
  if (linha.resolvido_negocio_id) {
    return NextResponse.json(
      { error: "Esta mensagem já foi associada a um negócio.", motivo: "ja_resolvida" },
      { status: 409 },
    );
  }

  const { data: negocio } = await sessao
    .from("negocios")
    .select("id, tenant_id, contato_id")
    .eq("id", negocioId)
    .maybeSingle();

  if (!negocio) {
    return NextResponse.json({ error: "Negócio não encontrado ou sem acesso." }, { status: 403 });
  }
  // Cruzar tenant aqui seria impossível pelas duas RLS acima, mas a checagem
  // custa nada e documenta a invariante para quem mexer nas políticas depois.
  if (negocio.tenant_id !== linha.tenant_id) {
    return NextResponse.json({ error: "A mensagem é de outra empresa." }, { status: 403 });
  }

  if (!temServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 503 });
  }
  const admin = createAdminClient();

  // ------------------------------------------------------------------
  // 2. O CORPO — buscado agora, e só para e-mail.
  // ------------------------------------------------------------------
  let corpo = "";
  let messageId: string | null = null;
  let inReplyTo: string | null = null;
  let semCorpo: string | null = null;
  let completa: Awaited<ReturnType<Awaited<ReturnType<typeof abrirCaixa>>["completa"]>> | null = null;
  let idNoGmail: string | null = null;

  if (linha.canal === "email" && linha.usuario_id) {
    const { data: integracao } = await admin
      .from("integracoes_google")
      .select("email_google")
      .eq("usuario_id", linha.usuario_id)
      .maybeSingle();

    // Sem `throw`: o corpo é um bônus, não a razão de existir da associação.
    // A pessoa já disse a qual card a conversa pertence, e essa informação não
    // pode ser perdida porque a Google respondeu 500.
    try {
      if (!integracao?.email_google) throw new Error("A caixa desta mensagem não está mais conectada.");
      const mid = (linha.externo_id || "").startsWith("email:")
        ? linha.externo_id!.slice("email:".length)
        : null;
      if (!mid) throw new Error("Esta mensagem foi guardada sem o Message-ID.");

      const caixa = await abrirCaixa(linha.usuario_id);
      idNoGmail = await caixa.porMessageId(mid);
      if (!idNoGmail) throw new Error("O Gmail não achou mais esta mensagem na caixa.");

      completa = await caixa.completa(idNoGmail);
      const lida = lerMensagem(completa, linha.usuario_id, integracao.email_google);
      corpo = lida.corpo;
      messageId = lida.messageId;
      inReplyTo = lida.emRespostaA;
    } catch (e) {
      semCorpo = e instanceof Error ? e.message : "Não foi possível buscar o corpo no Gmail.";
    }
  } else if (linha.canal === "whatsapp") {
    semCorpo =
      "O WhatsApp não permite reler uma mensagem já entregue — a Meta não guarda histórico consultável.";
  } else {
    semCorpo = "Esta mensagem não tem uma caixa de origem para buscar o corpo.";
  }

  // ------------------------------------------------------------------
  // 3. GRAVAR A MENSAGEM, e só depois marcar a linha como resolvida.
  //
  // Nesta ordem porque a mensagem é o que importa: se marcássemos primeiro e o
  // insert falhasse, a linha sairia da quarentena sem nada ter sido gravado —
  // a mensagem sumiria de vez, sem tela nenhuma para achá-la. No caminho
  // inverso o pior caso é resolver duas vezes, e aí a `idempotency_key` (a
  // MESMA que o sync usaria) barra a segunda.
  // ------------------------------------------------------------------
  const { data: mensagem, error: erroInsert } = await admin
    .from("mensagens")
    .insert({
      tenant_id: linha.tenant_id,
      negocio_id: negocio.id,
      contato_id: negocio.contato_id,
      direcao: "entrada",
      canal: linha.canal,
      status: "recebida",
      destino: linha.remetente,
      assunto: linha.assunto,
      corpo: corpo || `(sem conteúdo — ${semCorpo || "corpo não recuperado"})`,
      // Corpo de fora é SEMPRE texto: HTML de terceiro nunca chega ao DOM. A
      // redução já aconteceu no servidor, em `gmail/mime.ts`.
      corpo_formato: "texto",
      gerado_por: "humano",
      automatica: false,
      recebida_em: linha.recebida_em,
      thread_externo: linha.thread_externo,
      message_id_externo: messageId,
      in_reply_to: inReplyTo,
      idempotency_key: linha.externo_id,
      agendada_para: null,
    })
    .select("id")
    .single();

  // 23505 = o sync já gravou esta mensagem por outro caminho. Não é falha: a
  // trava fez o trabalho dela, e a linha da quarentena ainda precisa sair.
  const jaExistia = erroInsert?.code === "23505";
  if (erroInsert && !jaExistia) {
    return NextResponse.json({ error: erroInsert.message }, { status: 500 });
  }

  // Os anexos, com a mensagem já gravada — mesma ordem e mesmo cuidado do sync.
  let anexos = 0;
  if (mensagem?.id && completa && idNoGmail) {
    for (const a of anexosDaMensagem(completa).slice(0, ANEXOS_POR_MENSAGEM)) {
      const caixa = await abrirCaixa(linha.usuario_id!);
      const r = await guardarAnexo(admin, {
        tenantId: linha.tenant_id,
        negocioId: negocio.id,
        mensagemId: mensagem.id,
        nome: a.nome,
        mime: a.mime,
        origem: "gmail",
        externoId: a.attachmentId,
        tamanhoDeclarado: a.tamanho,
        baixar: () => caixa.anexo(idNoGmail!, a.attachmentId),
      });
      if (r === "guardado") anexos++;
    }
  }

  // A marca vai pela SESSÃO, não pelo admin: o `WITH CHECK` de
  // `mensagens_sem_negocio_update` exige que `resolvido_negocio_id` aponte para
  // um negócio que ESTA pessoa enxerga. É uma segunda autorização de graça, e
  // passar pelo admin aqui a jogaria fora.
  const { error: erroMarca } = await sessao
    .from("mensagens_sem_negocio")
    .update({ resolvido_negocio_id: negocio.id, resolvido_em: new Date().toISOString() })
    .eq("id", linha.id);

  if (erroMarca) {
    return NextResponse.json(
      {
        error: `A mensagem foi associada, mas a linha não saiu da quarentena: ${erroMarca.message}`,
        motivo: "marca_falhou",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, jaExistia, anexos, semCorpo });
}
