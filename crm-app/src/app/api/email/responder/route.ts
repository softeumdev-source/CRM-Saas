import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { temGoogleConfigurado } from "@/lib/google/config";
import {
  NOME_PADRAO_DO_REMETENTE,
  assuntoDeResposta,
  caixasDeSaida,
  threadsDosNegocios,
} from "@/lib/gmail/caixa";
import { enviarPeloGmail, type AnexoParaEnviar } from "@/lib/gmail/enviar";
import { htmlDeTexto } from "@/lib/gmail/corpo";
import { emailBase, assinaturaEmTexto } from "@/lib/resend";
import { ANEXOS_POR_MENSAGEM } from "@/lib/anexos";

/**
 * Responder o cliente por e-mail, de dentro do card.
 *
 * Irmão de `/api/whatsapp/responder`, e de propósito: o desenho daquela rota já
 * foi exercitado — autoriza lendo o negócio com a sessão, grava a linha ANTES
 * de enviar, e fecha com `concluir_envio`. Repetir o desenho é mais barato do
 * que inventar um segundo.
 *
 * **O que NÃO é copiado de lá, e por quê:** `whatsapp_folga` e a janela de 24h.
 * As duas são regras da Meta sobre outbound não solicitado. E-mail não tem nem
 * uma nem outra, e reproduzi-las aqui seria cerimônia inventada.
 *
 * **Nenhum byte de arquivo entra por aqui.** O corpo é JSON e os anexos chegam
 * como IDS — o navegador já os subiu direto para o Storage (ver
 * `lib/anexosUpload.ts`, que explica os três tetos que tornam isso obrigatório).
 */
export const maxDuration = 60;

/**
 * Teto do e-mail inteiro, somando os anexos.
 *
 * O Gmail recusa mensagem acima de 25 MB, e o base64 infla 33% — então 20 MB de
 * arquivo já encosta no limite dele. Serve também de guarda de memória: sem
 * isto, dez arquivos de 15 MB seriam 150 MB de buffer mais o base64 na mesma
 * função.
 */
const TOTAL_MAXIMO = 20 * 1024 * 1024;

type Corpo = {
  negocioId?: string;
  texto?: string;
  chave?: string;
  assunto?: string;
  anexoIds?: string[];
  propostaId?: string;
  /** Quais PDFs da proposta anexar. */
  propostaPartes?: ("comercial" | "tecnica")[];
};

export async function POST(request: Request) {
  const corpo = ((await request.json().catch(() => ({}))) || {}) as Corpo;
  const { negocioId, texto, chave, propostaId } = corpo;
  const anexoIds = Array.isArray(corpo.anexoIds) ? corpo.anexoIds.slice(0, ANEXOS_POR_MENSAGEM) : [];
  const propostaPartes = (corpo.propostaPartes || []).filter(
    (p): p is "comercial" | "tecnica" => p === "comercial" || p === "tecnica",
  );

  if (!negocioId || !texto?.trim()) {
    return NextResponse.json({ error: "Faltou o negócio ou o texto." }, { status: 400 });
  }
  if (!chave) {
    return NextResponse.json({ error: "Faltou a chave de idempotência." }, { status: 400 });
  }

  // ------------------------------------------------------------------
  // 1. AUTORIZAÇÃO — uma consulta só, e ela É a permissão.
  //
  // A RLS de `mensagens` delega inteiramente a `negocios`, e `negocios_select`
  // já é "mesmo tenant E (admin OU sou o responsável OU está sem dono num funil
  // do meu papel)". Ler o negócio com o cliente da SESSÃO aplica essa regra
  // sem uma segunda cópia dela aqui para divergir com o tempo.
  // ------------------------------------------------------------------
  const sessao = await createClient();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: negocio } = await sessao
    .from("negocios")
    .select("id, tenant_id, contato_id, titulo, contato:contatos(nome, email)")
    .eq("id", negocioId)
    .maybeSingle();

  if (!negocio) {
    return NextResponse.json({ error: "Negócio não encontrado ou sem acesso." }, { status: 403 });
  }

  const contato = negocio.contato as { nome?: string | null; email?: string | null } | null;
  const destino = contato?.email?.trim() || "";
  if (!destino) {
    return NextResponse.json(
      { error: "Este contato não tem e-mail cadastrado.", motivo: "sem_destino" },
      { status: 400 },
    );
  }

  if (!temGoogleConfigurado()) {
    return NextResponse.json(
      { error: "O Google ainda não está configurado no servidor.", motivo: "sem_canal" },
      { status: 503 },
    );
  }
  if (!temServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 503 });
  }

  const admin = createAdminClient();

  // ------------------------------------------------------------------
  // 2. A CAIXA. Sem ela, 503 ANTES de gravar qualquer coisa — a mesma guarda
  //    que o despachante usa, e pelo mesmo motivo: não reservar nem queimar
  //    tentativa contra um erro de configuração.
  // ------------------------------------------------------------------
  const caixa = (await caixasDeSaida(admin, [negocio.tenant_id!])).get(negocio.tenant_id!);
  if (!caixa) {
    return NextResponse.json(
      {
        error:
          "Nenhuma caixa de e-mail conectada com permissão de envio. " +
          "Conecte a conta comercial em Admin → Integrações.",
        motivo: "sem_caixa",
      },
      { status: 503 },
    );
  }

  // ------------------------------------------------------------------
  // 3. OS ANEXOS, reautorizados NO SERVIDOR.
  //
  // Os ids vêm do navegador, então nada impede alguém de mandar o id do anexo
  // de outro negócio. A releitura é feita COM A SESSÃO e presa a este negócio:
  // o que a pessoa não enxerga simplesmente não volta da consulta.
  // ------------------------------------------------------------------
  const anexosParaEnviar: AnexoParaEnviar[] = [];

  if (anexoIds.length > 0) {
    const { data: linhas } = await sessao
      .from("anexos")
      .select("id, nome, mime, caminho, tamanho")
      .eq("negocio_id", negocio.id)
      .in("id", anexoIds);

    const achados = linhas || [];
    if (achados.length !== anexoIds.length) {
      return NextResponse.json(
        { error: "Um dos anexos não pertence a este negócio.", motivo: "anexo_invalido" },
        { status: 403 },
      );
    }
    // Linha sem `caminho` é upload que não terminou. Descartá-la em silêncio
    // mandaria um e-mail SEM o arquivo que a pessoa anexou — o pior desfecho
    // possível aqui, porque ninguém confere o que já foi enviado.
    const incompleto = achados.find((a) => !a.caminho);
    if (incompleto) {
      return NextResponse.json(
        {
          error: `O arquivo "${incompleto.nome}" não terminou de subir. Remova-o ou anexe de novo.`,
          motivo: "anexo_incompleto",
        },
        { status: 409 },
      );
    }
    for (const a of achados) {
      anexosParaEnviar.push({
        nome: a.nome,
        mime: a.mime || "application/octet-stream",
        conteudo: Buffer.alloc(0), // preenchido abaixo, depois do teto total
      });
    }
    // Baixa com o admin: a autorização já foi feita acima, com a sessão.
    for (let i = 0; i < achados.length; i++) {
      const { data, error } = await admin.storage.from("documentos").download(achados[i].caminho!);
      if (error || !data) {
        return NextResponse.json(
          { error: `Não foi possível ler o anexo "${achados[i].nome}".`, motivo: "anexo_ilegivel" },
          { status: 502 },
        );
      }
      anexosParaEnviar[i].conteudo = Buffer.from(await data.arrayBuffer());
    }
  }

  // ------------------------------------------------------------------
  // 4. A PROPOSTA vai por ID, nunca por caminho.
  //
  // Aceitar `pdf_comercial_path` do cliente daria a ele um jeito de fazer o
  // servidor baixar QUALQUER objeto do bucket e mandar por e-mail. O caminho
  // sai da linha, relida com a sessão e presa a este negócio.
  // ------------------------------------------------------------------
  if (propostaId && propostaPartes.length > 0) {
    const { data: proposta } = await sessao
      .from("propostas")
      .select("id, numero, pdf_comercial_path, pdf_tecnica_path")
      .eq("id", propostaId)
      .eq("negocio_id", negocio.id)
      .maybeSingle();

    if (!proposta) {
      return NextResponse.json(
        { error: "Proposta não encontrada neste negócio.", motivo: "proposta_invalida" },
        { status: 403 },
      );
    }

    for (const parte of propostaPartes) {
      const caminho = parte === "comercial" ? proposta.pdf_comercial_path : proposta.pdf_tecnica_path;
      if (!caminho) continue;
      const { data, error } = await admin.storage.from("documentos").download(caminho);
      if (error || !data) {
        return NextResponse.json(
          { error: `Não foi possível ler o PDF ${parte} da proposta.`, motivo: "proposta_ilegivel" },
          { status: 502 },
        );
      }
      anexosParaEnviar.push({
        nome: `proposta-${proposta.numero}-${parte}.pdf`,
        mime: "application/pdf",
        conteudo: Buffer.from(await data.arrayBuffer()),
      });
    }
  }

  const total = anexosParaEnviar.reduce((s, a) => s + a.conteudo.byteLength, 0);
  if (total > TOTAL_MAXIMO) {
    return NextResponse.json(
      {
        error: `Os anexos somam ${(total / 1024 / 1024).toFixed(1)} MB e o teto de um e-mail é ${TOTAL_MAXIMO / 1024 / 1024} MB.`,
        motivo: "anexos_grandes",
      },
      { status: 413 },
    );
  }

  // ------------------------------------------------------------------
  // 5. A THREAD. Sem ela o e-mail chega como conversa nova na caixa do
  //    cliente, mesmo saindo do mesmo endereço.
  // ------------------------------------------------------------------
  const contexto = (await threadsDosNegocios(sessao, [negocio.id])).get(negocio.id) || null;
  const assunto = assuntoDeResposta(
    contexto?.assunto ?? corpo.assunto,
    negocio.titulo || "Contato da Softeum",
  );

  // ------------------------------------------------------------------
  // 6. GRAVAR ANTES DE ENVIAR.
  //
  // Se a linha não entrar, nada sai. O contrário perderia do histórico uma
  // mensagem que o cliente já recebeu — e é o histórico que a próxima pessoa
  // lê antes de ligar para ele.
  //
  // `corpo_formato: 'texto'` é FRONTEIRA DE SEGURANÇA, não preferência: a aba
  // de e-mail entrega `html` a `dangerouslySetInnerHTML`, e este é o primeiro
  // lugar em que uma PESSOA escreve dentro de `mensagens.corpo`. O HTML que o
  // cliente recebe é montado abaixo, escapado, só na saída.
  // ------------------------------------------------------------------
  const { data: linha, error: erroInsert } = await admin
    .from("mensagens")
    .insert({
      tenant_id: negocio.tenant_id,
      negocio_id: negocio.id,
      contato_id: negocio.contato_id,
      direcao: "saida",
      canal: "email",
      status: "enviando",
      destino,
      assunto,
      corpo: texto.trim(),
      corpo_formato: "texto",
      gerado_por: "humano",
      automatica: false,
      reservada_em: new Date().toISOString(),
      agendada_para: null,
      idempotency_key: `resposta-email:${chave}`,
      aprovada_por: user.id,
      aprovada_em: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroInsert) {
    if (erroInsert.code !== "23505") {
      return NextResponse.json({ error: erroInsert.message }, { status: 500 });
    }

    // 23505 = a chave já foi usada. Quase sempre é o segundo clique de um
    // duplo clique. Mas NÃO dá para responder "já enviada" sem olhar: a
    // primeira tentativa pode ter gravado e o Gmail ter recusado. Dizer que
    // saiu um e-mail que o cliente nunca recebeu é o pior erro desta tela.
    const { data: anterior } = await admin
      .from("mensagens")
      .select("status, ultimo_erro")
      .eq("idempotency_key", `resposta-email:${chave}`)
      .maybeSingle();

    if (anterior?.status === "enviada") return NextResponse.json({ ok: true, jaEnviada: true });
    if (anterior?.status === "falhou") {
      return NextResponse.json(
        {
          error: `A tentativa anterior falhou${anterior.ultimo_erro ? `: ${anterior.ultimo_erro}` : "."} Edite o texto para tentar de novo.`,
          motivo: "falhou_antes",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Este e-mail ainda está saindo. Aguarde alguns segundos.", motivo: "em_curso" },
      { status: 409 },
    );
  }

  // Os anexos se penduram na mensagem: é assim que a aba os mostra dentro do
  // bloco certo, em vez de soltos no negócio.
  if (anexoIds.length > 0) {
    await admin.from("anexos").update({ mensagem_id: linha.id }).in("id", anexoIds);
  }

  // Uma leitura so: o cabecalho e a assinatura tem que dizer o mesmo nome.
  const quemAssinaAqui = caixa.nome ?? NOME_PADRAO_DO_REMETENTE;

  let enviado: { id: string; threadId: string; messageId: string } | null = null;
  let erroEnvio: string | null = null;
  try {
    enviado = await enviarPeloGmail(
      caixa.usuarioId,
      {
        de: caixa.email,
        // Quem está falando é quem CLICOU, não o dono do negócio: um admin
        // respondendo em nome de outra pessoa assinaria com o nome errado.
        nomeDeExibicao: quemAssinaAqui,
        para: destino,
        assunto,
        // `comoCarta`: aqui uma PESSOA digitou o texto e esta respondendo o
        // cliente dentro da conversa dele. Sair com tarja, card e logo faria
        // uma resposta de gente parecer disparo de sistema — e e o que joga a
        // mensagem para a aba de Promocoes.
        html: emailBase(htmlDeTexto(texto), { comoCarta: true, assinatura: quemAssinaAqui }),
        // A parte de texto puro NAO herda a assinatura do HTML: quando o
        // chamador manda `texto`, `montarMime` usa esse texto e nao deriva nada
        // do HTML. Sem esta linha, quem le em texto puro recebe a mensagem sem
        // assinatura nenhuma.
        texto: texto.trim() + assinaturaEmTexto(quemAssinaAqui),
        emRespostaA: contexto?.emRespostaA ?? null,
        referencias: contexto?.referencias ?? null,
        anexos: anexosParaEnviar,
      },
      contexto?.threadId ?? null,
    );
  } catch (e) {
    erroEnvio = e instanceof Error ? e.message : "Falha ao enviar pelo Gmail.";
  }

  // `concluir_envio` carimba `enviada_em`, guarda o erro e — o que mais importa
  // aqui — grava `thread_externo` e `message_id_externo`. São eles que costuram
  // a próxima resposta do cliente nesta mesma conversa.
  await admin.rpc("concluir_envio", {
    p_id: linha.id,
    p_ok: !!enviado,
    p_provedor_id: enviado?.id ?? undefined,
    p_erro: enviado ? undefined : erroEnvio || "falha desconhecida no envio",
    p_thread_externo: enviado?.threadId ?? undefined,
    p_message_id_externo: enviado?.messageId ?? undefined,
  });

  if (!enviado) {
    return NextResponse.json(
      { error: erroEnvio || "O Gmail recusou o envio.", motivo: "gmail" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, id: linha.id, assunto });
}
