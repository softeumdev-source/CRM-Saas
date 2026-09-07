import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailBase } from "@/lib/resend";
import { emailDeAssinatura } from "@/lib/assinatura/email";
import { escaparHtml } from "@/lib/gmail/corpo";
import { enviarDoTenant } from "@/lib/gmail/enviarDoTenant";
import { quemAssina } from "@/lib/gmail/caixa";
import { renderPropostaComercialPdf } from "@/lib/pdf/PropostaComercial";
import { montarDadosDaProposta } from "@/lib/pdf/montarDados";
import type { CampoAssinatura } from "@/components/PdfFieldEditor";

interface SignatarioEntrada {
  nome: string;
  email: string;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const signatariosEntrada: SignatarioEntrada[] = Array.isArray(body.signatarios) ? body.signatarios : [];
  const copias: string[] = Array.isArray(body.copias) ? body.copias.filter((c: string) => c && c.trim()) : [];
  const camposAssinatura: CampoAssinatura[] = Array.isArray(body.campos_assinatura) ? body.campos_assinatura : [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: usuarioAtual } = await supabase.from("usuarios").select("*").eq("id", user.id).single();

  const { data: proposta } = await supabase
    .from("propostas")
    .select("*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios!negocios_responsavel_id_fkey(*))")
    .eq("id", id)
    .single();

  if (!proposta) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  if (proposta.status !== "rascunho") {
    return NextResponse.json({ error: "Esta proposta já foi enviada para assinatura. Gere uma nova versão para reenviar." }, { status: 422 });
  }
  if (!proposta.pdf_comercial_path || !proposta.pdf_tecnica_path) {
    return NextResponse.json({ error: "Gere os PDFs da proposta antes de enviar." }, { status: 422 });
  }

  const negocio = proposta.negocio;
  const contato = negocio?.contato;

  const signatariosFinal =
    signatariosEntrada.length > 0
      ? signatariosEntrada.filter((s) => s.nome?.trim() && s.email?.trim())
      : contato?.email
        ? [{ nome: contato.nome, email: contato.email }]
        : [];

  if (signatariosFinal.length === 0) {
    return NextResponse.json({ error: "Informe pelo menos um signatario com nome e e-mail." }, { status: 422 });
  }

  const { data: envelope, error: erroEnvelope } = await supabase
    .from("envelopes")
    .insert({ proposta_id: id, tenant_id: proposta.tenant_id, status: "enviado", copias_emails: copias, campos_assinatura: camposAssinatura })
    .select()
    .single();
  if (erroEnvelope || !envelope) {
    return NextResponse.json({ error: erroEnvelope?.message }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "interno";

  // Signatario interno Softeum (ja assinado)
  await supabase.from("signatarios").insert({
    envelope_id: envelope.id,
    nome: usuarioAtual?.nome || "Softeum",
    email: usuarioAtual?.email || "contato@softeum.com.br",
    papel: "softeum",
    ordem: 1,
    status: "assinado",
    assinado_em: new Date().toISOString(),
    ip_assinatura: ip,
    user_agent: "sistema-crm-interno",
    assinatura_tipo: "digitada",
    assinatura_dados: usuarioAtual?.nome || "Softeum",
  });

  // Signatarios do cliente
  const linhasClientes = signatariosFinal.map((s, idx) => ({
    envelope_id: envelope.id,
    nome: s.nome.trim(),
    email: s.email.trim(),
    papel: "cliente" as const,
    ordem: idx + 2,
    status: "pendente" as const,
  }));

  const { data: signatariosCriados, error: erroSig } = await supabase
    .from("signatarios")
    .insert(linhasClientes)
    .select();

  if (erroSig || !signatariosCriados) {
    return NextResponse.json({ error: erroSig?.message }, { status: 500 });
  }

  const admin = createAdminClient();
  const [comercialFile, tecnicaFile] = await Promise.all([
    admin.storage.from("documentos").download(proposta.pdf_comercial_path),
    admin.storage.from("documentos").download(proposta.pdf_tecnica_path),
  ]);

  if (comercialFile.error || tecnicaFile.error || !comercialFile.data || !tecnicaFile.data) {
    return NextResponse.json({ error: "Falha ao carregar os PDFs gerados." }, { status: 500 });
  }

  const comercialBuffer = await comercialFile.data.arrayBuffer();
  const tecnicaBuffer = await tecnicaFile.data.arrayBuffer();

  // O documento que vai para ASSINATURA não leva a nota de validade (a validade de
  // 30 dias é da proposta ENVIADA para aceite, não do contrato que será assinado).
  // Regenera o comercial com validadeDias=0 (definido em montarDadosDaProposta).
  // Como a nota fica fora do fluxo, o layout é idêntico ao gerado e as posições dos
  // campos de assinatura permanecem válidas. Em falha, cai no PDF original.
  let comercialParaAssinar: ArrayBuffer | Uint8Array = comercialBuffer;
  try {
    const { data: plano } = proposta.plano_id
      ? await admin.from("planos").select("nome, franquia_pedidos").eq("id", proposta.plano_id).single()
      : { data: null };
    if (plano && contato) {
      const dados = montarDadosDaProposta(proposta, plano, contato);
      comercialParaAssinar = await renderPropostaComercialPdf(dados);
    }
  } catch (e) {
    console.error("Falha ao regerar comercial sem validade para assinatura; usando o original", e);
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  // Quem assina o corpo tem que ser quem assina o cabecalho — e o cabecalho
  // sai da caixa, la dentro do `enviarDoTenant`. Entao o nome vem da mesma
  // fonte, uma pergunta antes de montar o HTML.
  const assinatura = await quemAssina(admin, usuarioAtual?.tenant_id);

  let algumEmailEnviado = false;
  let emailErro: string | null = null;

  // A FILA COMEÇA COM UM. Os PDFs vão para o storage de TODOS os tokens —
  // é barato, e o reenvio e as assinaturas seguintes dependem de eles já
  // estarem lá —, mas só o primeiro cliente recebe e-mail agora.
  //
  // Antes o laço mandava o link para os três de uma vez, e a `ordem` era
  // decoração: qualquer um assinava a qualquer momento. Isso importa porque o
  // documento MUDA entre uma assinatura e outra — quem assina depois assina um
  // PDF que já traz a rubrica de quem veio antes. Os seguintes recebem o link
  // em `api/assinar/[token]`, quando chega a vez de cada um.
  //
  // `signatariosCriados` sai do `insert` na ordem de `linhasClientes`, que já é
  // a ordem do formulário — mas a ordenação vai explícita, porque "a ordem que
  // o insert devolveu" não é garantia de nada.
  const naFila = [...signatariosCriados].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const primeiroDaFila = naFila[0]?.id;

  for (const sig of naFila) {
    const token = sig.token;
    const [upComercial, upTecnica] = await Promise.all([
      admin.storage.from("assinatura-publica").upload(`${token}/comercial.pdf`, comercialParaAssinar, {
        contentType: "application/pdf",
        upsert: true,
      }),
      admin.storage.from("assinatura-publica").upload(`${token}/tecnica.pdf`, tecnicaBuffer, {
        contentType: "application/pdf",
        upsert: true,
      }),
    ]);
    if (upComercial.error || upTecnica.error) {
      console.error("Falha ao publicar PDFs para assinatura", upComercial.error, upTecnica.error);
      return NextResponse.json({ error: "Falha ao publicar os PDFs para assinatura." }, { status: 500 });
    }

    // Quem não é o primeiro da fila teve os PDFs publicados e fica esperando:
    // sem e-mail agora, sem link na mão de ninguém.
    if (sig.id !== primeiroDaFila) continue;

    // O corpo saiu daqui para `lib/assinatura/email.ts` quando o reenvio
    // nasceu: os dois envios mandam o MESMO documento e o mesmo link, e duas
    // cópias do HTML divergiriam no primeiro ajuste de texto.
    const resultado = await enviarDoTenant(admin, usuarioAtual?.tenant_id, {
      para: sig.email,
      assunto: `Proposta Softeum ${proposta.numero} - assinatura eletronica`,
      html: emailDeAssinatura({
        nome: sig.nome,
        numero: proposta.numero,
        empresa: negocio?.contato?.empresa || negocio?.contato?.nome || "sua empresa",
        link: `${origin}/assinar/${token}`,
        assinatura,
      }),
    });
    if (resultado.enviado) algumEmailEnviado = true;
    if (resultado.erro && !emailErro) emailErro = resultado.erro;
  }

  // O LINK NÃO VOLTA MAIS PARA A TELA.
  //
  // Ele saía na resposta desta rota, e a tela do vendedor mostrava a URL num
  // `<code>` com botão de copiar. Um link de assinatura é uma CREDENCIAL: quem
  // o tem assina no lugar do cliente, porque `registrar_assinatura` confere o
  // token e o status do signatário, nunca quem é a pessoa do outro lado. Numa
  // tela ele vira captura, mensagem de WhatsApp entre colegas, histórico de
  // navegador — caminhos que não deixam rastro nenhum no envelope.
  //
  // O link continua existindo e continua indo por e-mail, para o endereço
  // cadastrado do signatário, que é a única entrega que o envelope consegue
  // registrar. Quando esse e-mail falha, a saída passa a ser o reenvio, e não
  // um endereço colado à mão.

  // A CÓPIA NÃO LEVA LINK NENHUM.
  //
  // Antes esta linha era `const linkPrimario = ${origin}/assinar/${
  // signatariosCriados[0].token}` e o botão da cópia — rotulado "Visualizar
  // proposta" — apontava para ele. Ou seja: o token de assinatura DO PRIMEIRO
  // SIGNATÁRIO ia para todo mundo em cópia, e o `registrar_assinatura` só
  // confere se o token existe e se aquele signatário ainda não assinou, nunca
  // quem é a pessoa do outro lado. Quem estava em cópia assinava no lugar do
  // cliente, com um botão que dizia "visualizar".
  //
  // Uma tela de leitura sem token de assinatura ainda não existe. Enquanto não
  // existir, a cópia sai sem botão e diz o que aconteceu — é melhor não ter
  // link do que ter um que assina. O nome de quem assina entra escapado
  // porque vem do formulário de envio.
  const nomesQueAssinam = signatariosFinal
    .map((s) => escaparHtml(s.nome))
    .filter(Boolean)
    .join(", ");
  for (const email of copias) {
    await enviarDoTenant(admin, usuarioAtual?.tenant_id, {
      para: email,
      assunto: `Cópia: Proposta Softeum ${proposta.numero}`,
      html: emailBase(`
        <h2 style="margin-top:0;">Cópia da proposta enviada para assinatura</h2>
        <p>Você está recebendo uma cópia da proposta ${escaparHtml(proposta.numero)}, enviada para assinatura${nomesQueAssinam ? ` de ${nomesQueAssinam}` : ""}.</p>
        <p style="color:#64748b; font-size:13px;">O link de assinatura vai só para quem assina. Para ver os documentos, peça a quem enviou a proposta.</p>
      `, { assinatura }),
    });
  }

  await supabase.from("propostas").update({ status: "enviada", enviada_em: new Date().toISOString() }).eq("id", id);
  await supabase.from("atividades").insert({
    negocio_id: proposta.negocio_id,
    usuario_id: user.id,
    tipo: "proposta",
    titulo: `Proposta ${proposta.numero} enviada para assinatura`,
    descricao: `Enviada para ${signatariosFinal.map((s) => s.email).join(", ")}.`,
  });
  if (proposta.negocio_id) {
    await supabase.from("negocios").update({ ultima_atividade_em: new Date().toISOString() }).eq("id", proposta.negocio_id);
  }

  return NextResponse.json({
    envelope,
    emailEnviado: algumEmailEnviado,
    emailErro: emailErro || null,
  });
}
