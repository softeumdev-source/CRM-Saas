import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { quemAssina } from "@/lib/gmail/caixa";
import { enviarDoTenant } from "@/lib/gmail/enviarDoTenant";
import { emailDeAssinatura } from "@/lib/assinatura/email";

/**
 * Reenviar o link de assinatura para UM signatário.
 *
 * Antes desta rota não havia saída nenhuma quando o e-mail falhava. O botão
 * "Enviar para assinatura" só aparece com a proposta em rascunho, e depois do
 * envio some para sempre — se a caixa comercial estivesse desconectada naquele
 * minuto, ou se o endereço voltasse bounce, o vendedor ficava com um envelope
 * aberto e nenhuma forma de tocá-lo. A resposta que a tela dava era colar o
 * link à mão, e é justamente esse link que acabou de sair da tela.
 *
 * QUEM PODE: a RLS decide, e é por isso que a leitura vai pelo cliente de
 * SESSÃO e não pelo admin. `signatarios_select` já exige mesmo tenant e ainda
 * (admin OU responsável pelo negócio OU negócio sem dono num pipeline do papel
 * de quem pede). Repetir essa regra em TypeScript seria uma segunda cópia dela
 * para sair de sincronia com a primeira.
 *
 * O QUE NÃO VOLTA: a URL. Ela é montada aqui, entra no corpo do e-mail e morre
 * aqui. A resposta diz para qual endereço foi, que é o dado que o vendedor
 * precisa conferir — e que ele já vê na tela.
 *
 * O que sai é o MESMO link, não um novo: o token é a identidade do signatário
 * dentro do envelope, e girá-lo invalidaria o e-mail que já pode estar na caixa
 * da pessoa. Os PDFs já estão publicados sob ele desde o primeiro envio.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const signatarioId: string = typeof body.signatario_id === "string" ? body.signatario_id : "";

  // A sessão é conferida ANTES de olhar o corpo: quem não está autenticado não
  // deve conseguir distinguir "faltou o campo" de "não existe" a partir da
  // resposta.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (!signatarioId) {
    return NextResponse.json({ error: "Informe o signatário do reenvio." }, { status: 422 });
  }

  // O `envelope_id` no filtro NÃO é redundante com o `id` do signatário: sem
  // ele, um id de signatário de outro envelope do mesmo tenant passaria, e o
  // reenvio sairia por um envelope que não é o da URL.
  const { data: sig } = await supabase
    .from("signatarios")
    .select("id, nome, email, papel, status, token, envelope_id")
    .eq("id", signatarioId)
    .eq("envelope_id", id)
    .maybeSingle();

  // Sem linha pode ser "não existe" ou "a RLS escondeu". As duas respondem 404
  // igual, de propósito: distinguir contaria a quem não pode ver que aquele
  // envelope existe.
  if (!sig) return NextResponse.json({ error: "Signatário não encontrado neste envelope." }, { status: 404 });

  if (sig.status === "assinado") {
    return NextResponse.json({ error: "Este signatário já assinou o documento." }, { status: 422 });
  }
  if (sig.papel === "softeum") {
    return NextResponse.json({ error: "O signatário interno da Softeum não recebe link por e-mail." }, { status: 422 });
  }

  const { data: envelope } = await supabase
    .from("envelopes")
    .select("id, status, proposta:propostas(numero, tenant_id, negocio:negocios(contato:contatos(nome, empresa)))")
    .eq("id", id)
    .maybeSingle();

  if (!envelope) return NextResponse.json({ error: "Envelope não encontrado." }, { status: 404 });
  if (!["enviado", "aguardando"].includes(envelope.status || "")) {
    return NextResponse.json({ error: "Este documento não está mais aberto para assinatura." }, { status: 422 });
  }

  const proposta = envelope.proposta;
  const contato = proposta?.negocio?.contato;

  const admin = createAdminClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const assinatura = await quemAssina(admin, proposta?.tenant_id);

  const resultado = await enviarDoTenant(admin, proposta?.tenant_id, {
    para: sig.email,
    assunto: `Proposta Softeum ${proposta?.numero ?? ""} - assinatura eletronica (reenvio)`,
    html: emailDeAssinatura({
      nome: sig.nome,
      numero: proposta?.numero ?? "",
      empresa: contato?.empresa || contato?.nome || "sua empresa",
      link: `${origin}/assinar/${sig.token}`,
      assinatura,
      reenvio: true,
    }),
  });

  if (!resultado.enviado) {
    return NextResponse.json({ error: resultado.erro || "Falha ao reenviar o e-mail." }, { status: 502 });
  }

  // O reenvio SUBSTITUI o registro anterior: o que importa provar é a última
  // entrega, que é a que o cliente tinha em mãos quando assinou.
  await admin
    .from("signatarios")
    .update({ link_enviado_em: new Date().toISOString(), link_enviado_para: sig.email })
    .eq("id", sig.id);

  return NextResponse.json({ enviado: true, para: sig.email });
}
