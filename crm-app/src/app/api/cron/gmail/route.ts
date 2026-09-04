import { NextResponse } from "next/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { ESCOPO_GMAIL } from "@/lib/google/config";
import { abrirCaixa, CursorExpirado } from "@/lib/gmail/api";
import { lerMensagem } from "@/lib/gmail/mime";
import { resolverPorEmail } from "@/lib/entrada/resolver";
import { gravarEntrada } from "@/lib/entrada/gravar";
import { anexosDaMensagem } from "@/lib/gmail/mime";
import { ANEXOS_POR_MENSAGEM, guardarAnexo } from "@/lib/anexos";

/**
 * A sincronização do Gmail.
 *
 * Mesma divisão do despachante: o `pg_cron` acorda (o plano Hobby da Vercel só
 * permite um cron por dia), e a rota faz a chamada externa, porque é aqui que
 * estão o token e o segredo.
 *
 * Duas regras desta rota não são preferência — são o que impede dano:
 *
 * 1. **A primeira sincronização de uma caixa grava só o cursor.** Importar
 *    histórico encerraria toda cadência ativa daquele negócio, porque
 *    `processar_cadencias` para quando existe entrada humana depois da
 *    inscrição — e o estado final (`respondeu`) PARECE correto para quem olha o
 *    painel. Um e-mail de três meses atrás é indistinguível de uma resposta.
 * 2. **E-mail enviado entra com `status='enviada'` explícito.** O default da
 *    coluna é `aguardando_aprovacao`; um e-mail que o vendedor JÁ mandou caindo
 *    na fila seria reenviado ao cliente por quem aprovasse. Quem garante isso é
 *    `gravarEntrada`, e é por isso que esta rota não monta o insert à mão.
 */
export const maxDuration = 60;

/**
 * Orçamento de tempo, com folga sobre o `maxDuration`. Estourar o limite da
 * plataforma mataria a rota ANTES de gravar o cursor, e a rodada inteira seria
 * repetida do zero para sempre.
 */
const ORCAMENTO_MS = 45_000;

/**
 * Caixas por rodada. As mais atrasadas primeiro (`gmail_sincronizado_em` mais
 * antigo), então com mais caixas do que o teto ninguém fica sem vez: o
 * revezamento sai da própria ordenação.
 */
const CAIXAS_POR_RODADA = 5;

/** Freio contra laço infinito de paginação, não expectativa de volume. */
const PAGINAS_POR_CAIXA = 20;

type Integracao = {
  usuario_id: string;
  email_google: string;
  gmail_history_id: string | null;
  role: string | null;
  tenant_id: string | null;
};

type Resumo = {
  caixa: string;
  gravadas: number;
  duplicadas: number;
  quarentena: number;
  ignoradas: number;
  /** Primeira rodada da caixa: cursor gravado, nada importado. */
  primeira?: boolean;
  /** O cursor tinha caducado; foi rearmado no ponto de agora. */
  cursorRearmado?: boolean;
  /** Faltou tempo. O cursor parou no último registro concluído. */
  incompleta?: boolean;
  erro?: string;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!temServiceRole()) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY não configurada." },
      { status: 503 },
    );
  }

  const admin = createAdminClient();

  // Só caixas que de fato concederam o escopo do Gmail. Sem este recorte, quem
  // conectou apenas a Agenda tomaria 403 a cada 5 minutos e o `gmail_erro`
  // ficaria vermelho por uma permissão que a pessoa nunca pediu.
  const { data: integracoes, error } = await admin
    .from("integracoes_google")
    .select("usuario_id, email_google, gmail_history_id, usuario:usuarios!inner(role, tenant_id, ativo)")
    .contains("escopos", [ESCOPO_GMAIL])
    .not("refresh_token_id", "is", null)
    .order("gmail_sincronizado_em", { ascending: true, nullsFirst: true })
    .limit(CAIXAS_POR_RODADA);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const caixas: Integracao[] = (integracoes || [])
    // Vendedor desligado não deve continuar tendo a caixa lida.
    .filter((i) => (i.usuario as { ativo?: boolean | null } | null)?.ativo !== false)
    .map((i) => {
      const u = i.usuario as { role?: string; tenant_id?: string | null } | null;
      return {
        usuario_id: i.usuario_id,
        email_google: i.email_google,
        gmail_history_id: i.gmail_history_id,
        role: u?.role ?? null,
        tenant_id: u?.tenant_id ?? null,
      };
    });

  if (caixas.length === 0) {
    return NextResponse.json({ caixas: 0, detalhe: "nenhuma caixa com Gmail conectado" });
  }

  const ate = Date.now() + ORCAMENTO_MS;
  const resumos: Resumo[] = [];
  for (const caixa of caixas) {
    if (Date.now() >= ate) break;
    resumos.push(await sincronizar(admin, caixa, ate));
  }

  return NextResponse.json({ caixas: resumos.length, resumos });
}

type Admin = ReturnType<typeof createAdminClient>;

async function sincronizar(admin: Admin, i: Integracao, ate: number): Promise<Resumo> {
  const r: Resumo = { caixa: i.email_google, gravadas: 0, duplicadas: 0, quarentena: 0, ignoradas: 0 };

  if (!i.tenant_id) {
    r.erro = "usuário sem tenant";
    await registrar(admin, i.usuario_id, i.gmail_history_id, r.erro);
    return r;
  }

  let caixa;
  try {
    caixa = await abrirCaixa(i.usuario_id);
  } catch (e) {
    // `accessTokenDe` já gravou o motivo em `ultimo_erro` e a tela já pede
    // reconexão. Aqui só evitamos que uma caixa revogada derrube as outras.
    r.erro = msg(e);
    await registrar(admin, i.usuario_id, i.gmail_history_id, r.erro);
    return r;
  }

  // Primeira rodada: só o cursor. Ver a regra 1 no topo do arquivo.
  if (!i.gmail_history_id) {
    try {
      const cursor = await caixa.cursorAtual();
      await registrar(admin, i.usuario_id, cursor, null);
      r.primeira = true;
    } catch (e) {
      r.erro = msg(e);
      await registrar(admin, i.usuario_id, null, r.erro);
    }
    return r;
  }

  // O cursor só avança sobre registro CONCLUÍDO. Se o tempo acabar ou uma
  // mensagem falhar, ele fica onde parou e a próxima rodada retoma dali — as
  // já gravadas voltam como "duplicada" pela `idempotency_key`, que é para o
  // que ela existe. É deliberado: uma mensagem que falhe sempre trava a caixa
  // de forma VISÍVEL (`gmail_erro`), em vez de sumir em silêncio.
  let cursor = i.gmail_history_id;
  let pageToken: string | null = null;

  for (let pagina = 0; pagina < PAGINAS_POR_CAIXA; pagina++) {
    let p;
    try {
      p = await caixa.pagina(i.gmail_history_id, pageToken);
    } catch (e) {
      if (e instanceof CursorExpirado) {
        // A Google descartou o histórico. Rearmar no ponto de agora é a única
        // saída: insistir no cursor velho deixaria a caixa parada para sempre
        // com o job aparecendo verde.
        try {
          cursor = await caixa.cursorAtual();
          r.cursorRearmado = true;
        } catch (e2) {
          r.erro = msg(e2);
        }
      } else {
        r.erro = msg(e);
      }
      break;
    }

    for (const registro of p.registros) {
      if (Date.now() >= ate) {
        r.incompleta = true;
        break;
      }
      try {
        for (const id of registro.ids) {
          contar(r, await processar(admin, caixa, i, id));
        }
        cursor = registro.id;
      } catch (e) {
        r.erro = msg(e);
        break;
      }
    }

    if (r.erro || r.incompleta) break;

    if (!p.proximaPagina) {
      // Só aqui o cursor da CAIXA é seguro: com página pendente ele
      // descartaria tudo o que ainda não foi lido.
      cursor = p.historyIdDaCaixa;
      break;
    }
    pageToken = p.proximaPagina;
  }

  await registrar(admin, i.usuario_id, cursor, r.erro ?? null);
  return r;
}

async function processar(
  admin: Admin,
  caixa: Awaited<ReturnType<typeof abrirCaixa>>,
  i: Integracao,
  id: string,
): Promise<"gravada" | "duplicada" | "quarentena" | "ignorada"> {
  // Metadados primeiro, sempre. O corpo só é lido depois de casar com um
  // negócio — e-mail que não casa nunca tem o conteúdo lido nem gravado.
  const meta = await caixa.metadados(id);
  const lida = lerMensagem(meta, i.usuario_id, i.email_google);

  // ESTA MENSAGEM FOMOS NÓS QUE MANDAMOS? Então ela já está no banco, e gravar
  // de novo põe o mesmo e-mail duas vezes no card.
  //
  // A trava de `idempotency_key` não pega este caso: a linha do envio tem a
  // chave da cadência (`inscricao:passo`) e esta teria `email:<Message-ID>` —
  // chaves diferentes para a mesma mensagem. Casar por `Message-ID` também não
  // resolveria, e foi o que eu tinha imaginado a princípio: o Gmail TROCA o
  // `Message-ID` do MIME pelo dele, então o cabeçalho que volta aqui não é o
  // que escrevemos.
  //
  // `provedor_id` é o id do Gmail devolvido pelo `messages.send`, e é o mesmo
  // `id` que a sincronização usa para buscar a mensagem. É a única coisa que
  // liga as duas pontas sem ambiguidade.
  if (lida.direcao === "saida") {
    const { data: nossa } = await admin
      .from("mensagens")
      .select("id")
      .eq("tenant_id", i.tenant_id!)
      .eq("provedor_id", id)
      .limit(1)
      .maybeSingle();
    if (nossa) return "duplicada";
  }

  // O OUTRO lado da conversa. Numa mensagem recebida é quem escreveu; numa
  // enviada é para quem escrevemos — e nunca a própria caixa, senão o contato
  // resolvido seria o vendedor.
  const propria = i.email_google.trim().toLowerCase();
  const outroLado =
    lida.direcao === "entrada"
      ? lida.remetente
      : lida.destinatarios.find((d) => d !== propria) || "";
  if (!outroLado) return "ignorada";

  const resolucao = await resolverPorEmail(admin, outroLado, i.role, i.tenant_id!);

  // Mensagem ENVIADA que não casa com negócio não vai para quarentena: a
  // quarentena existe para alguém dizer a qual card uma RESPOSTA pertence, e
  // não há o que decidir sobre um e-mail que o vendedor mandou para alguém que
  // não é um negócio. Guardá-la seria só copiar a caixa pessoal dele.
  if (resolucao.tipo !== "negocio" && lida.direcao === "saida") return "ignorada";

  // A mensagem completa é lida UMA vez e reusada: o corpo sai dela, e os anexos
  // também. Buscar de novo só para enumerar arquivo seria uma ida a mais por
  // e-mail, dentro do orçamento de 45s da rodada.
  const completa = resolucao.tipo === "negocio" ? await caixa.completa(id) : null;
  const corpo = completa ? lerMensagem(completa, i.usuario_id, i.email_google).corpo : "";

  const resultado = await gravarEntrada(
    admin,
    resolucao,
    {
      externoId: lida.externoId,
      canal: "email",
      destino: outroLado,
      assunto: lida.assunto || null,
      corpo,
      recebidaEm: lida.recebidaEm,
      automatica: lida.automatica,
      threadExterno: lida.threadId || null,
      messageIdExterno: lida.messageId,
      inReplyTo: lida.emRespostaA,
      direcao: lida.direcao,
    },
    { tenantId: i.tenant_id!, usuarioId: i.usuario_id },
  );

  // Os anexos, que até agora eram descartados na leitura. Só depois de a
  // mensagem existir, e só quando ela é nova: numa reentrega o índice único de
  // `anexos` já barraria, mas nem vale gastar a chamada.
  if (resultado.desfecho === "gravada" && resultado.mensagemId && completa && resolucao.tipo === "negocio") {
    for (const a of anexosDaMensagem(completa).slice(0, ANEXOS_POR_MENSAGEM)) {
      // Sem `throw`: anexo que falha não pode invalidar uma mensagem que já
      // está gravada. `guardarAnexo` registra o erro na própria linha, com o
      // `attachmentId`, e a busca fica retentável.
      await guardarAnexo(admin, {
        tenantId: i.tenant_id,
        negocioId: resolucao.negocioId,
        mensagemId: resultado.mensagemId,
        nome: a.nome,
        mime: a.mime,
        origem: "gmail",
        externoId: a.attachmentId,
        tamanhoDeclarado: a.tamanho,
        baixar: () => caixa.anexo(id, a.attachmentId),
      });
    }
  }

  return resultado.desfecho;
}

function contar(r: Resumo, d: "gravada" | "duplicada" | "quarentena" | "ignorada") {
  if (d === "gravada") r.gravadas += 1;
  else if (d === "duplicada") r.duplicadas += 1;
  else if (d === "quarentena") r.quarentena += 1;
  else r.ignoradas += 1;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "falha desconhecida na sincronização";
}

/**
 * O carimbo da rodada. `gmail_erro` é sempre reescrito — inclusive para `null`
 * no sucesso, senão um erro antigo ficaria vermelho na tela para sempre.
 */
async function registrar(admin: Admin, usuarioId: string, cursor: string | null, erro: string | null) {
  await admin
    .from("integracoes_google")
    .update({
      gmail_history_id: cursor,
      gmail_sincronizado_em: new Date().toISOString(),
      gmail_erro: erro,
    })
    .eq("usuario_id", usuarioId);
}
