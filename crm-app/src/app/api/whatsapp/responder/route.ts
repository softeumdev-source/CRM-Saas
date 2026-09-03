import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";
import { enviarTextoLivre, temWhatsappConfigurado } from "@/lib/whatsapp/cliente";
import { descreverRestante, janelaDeResposta } from "@/lib/whatsapp/janela";

/**
 * Responder o cliente dentro da janela de 24h.
 *
 * É o único caminho do projeto que manda texto livre no WhatsApp, e o ESLint
 * garante isso: `enviarTextoLivre` não pode ser importado em nenhum outro
 * arquivo.
 *
 * **Por que não passa pela fila do despachante.** `reservar_mensagens` faz
 * `distinct on (negocio_id)` — no máximo uma mensagem por lead a cada rodada de
 * 5 minutos — e aplica `whatsapp_lead_em_espera` (24h entre mensagens para a
 * mesma pessoa). Os dois existem para proteger alguém de outbound NÃO
 * solicitado. Uma resposta dentro da janela é, por definição, solicitada: o
 * cliente acabou de escrever. Mandar uma mensagem a cada 5 minutos não é
 * conversa.
 *
 * **O que continua valendo:** `pausado`, o teto por hora/dia (`whatsapp_folga`)
 * e o monitor de bloqueio — este último porque o fechamento passa por
 * `concluir_envio`, a mesma função que o despachante usa.
 */
export const maxDuration = 30;

type Corpo = { negocioId?: string; texto?: string; chave?: string };

export async function POST(request: Request) {
  const { negocioId, texto, chave } = ((await request.json().catch(() => ({}))) || {}) as Corpo;

  if (!negocioId || !texto?.trim()) {
    return NextResponse.json({ error: "Faltou o negócio ou o texto." }, { status: 400 });
  }
  // A chave vem do cliente e é a mesma nos dois cliques de um duplo clique.
  if (!chave) {
    return NextResponse.json({ error: "Faltou a chave de idempotência." }, { status: 400 });
  }

  // ------------------------------------------------------------------
  // 1. AUTORIZAÇÃO — e ela é uma consulta só.
  //
  // A RLS de `mensagens` delega inteiramente a `negocios`
  // (`exists (select 1 from negocios where id = negocio_id)`), e
  // `negocios_select` já é "mesmo tenant E (admin OU sou o responsável OU está
  // sem dono num funil do meu papel)". Então **ler o negócio com o cliente da
  // sessão JÁ É a permissão** — a mesma regra que governa o board, sem uma
  // segunda cópia aqui para divergir dela.
  // ------------------------------------------------------------------
  const sessao = await createClient();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: negocio } = await sessao
    .from("negocios")
    .select("id, tenant_id, contato_id, ultima_resposta_whatsapp_em, contato:contatos(whatsapp, telefone)")
    .eq("id", negocioId)
    .maybeSingle();

  if (!negocio) {
    return NextResponse.json({ error: "Negócio não encontrado ou sem acesso." }, { status: 403 });
  }

  // ------------------------------------------------------------------
  // 2. A JANELA, recalculada AQUI.
  //
  // O compositor já sabe, mas o cliente pode estar com a tela aberta há horas —
  // ou mentindo. A janela é o que separa uma resposta legítima de uma violação
  // de política, então ela não pode ser conferida só no navegador.
  // ------------------------------------------------------------------
  const janela = janelaDeResposta(negocio.ultima_resposta_whatsapp_em);
  if (!janela.aberta) {
    return NextResponse.json(
      {
        error:
          "A janela de 24 horas fechou. Fora dela a Meta só aceita template aprovado — o texto que você escreveu não foi enviado.",
        motivo: "janela_fechada",
      },
      { status: 409 },
    );
  }

  if (!temWhatsappConfigurado()) {
    return NextResponse.json(
      { error: "O WhatsApp ainda não está conectado.", motivo: "sem_canal" },
      { status: 503 },
    );
  }
  if (!temServiceRole()) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 503 });
  }

  const contato = negocio.contato as { whatsapp?: string | null; telefone?: string | null } | null;
  const destino = contato?.whatsapp?.trim() || contato?.telefone?.trim() || "";
  if (!destino) {
    return NextResponse.json(
      { error: "Este contato não tem WhatsApp nem telefone.", motivo: "sem_destino" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // ------------------------------------------------------------------
  // 3. O FREIO. `whatsapp_folga` tem `and not c.pausado` no WHERE, então com o
  //    canal pausado ela devolve NENHUMA LINHA — que chega aqui como `null`, e
  //    não como zero. Tratar `null` como "tem folga" furaria o freio
  //    exatamente quando ele está mais apertado.
  // ------------------------------------------------------------------
  const { data: folga } = await admin.rpc("whatsapp_folga", { p_tenant: negocio.tenant_id! });
  if (folga === null || folga === undefined || folga <= 0) {
    const { data: cfg } = await admin
      .from("whatsapp_config")
      .select("pausado, pausado_motivo")
      .eq("tenant_id", negocio.tenant_id!)
      .maybeSingle();

    return NextResponse.json(
      cfg?.pausado
        ? {
            error: `O canal está pausado${cfg.pausado_motivo ? `: ${cfg.pausado_motivo}` : "."}`,
            motivo: "pausado",
          }
        : { error: "O teto de mensagens por hora foi atingido. Tente mais tarde.", motivo: "teto" },
      { status: 409 },
    );
  }

  // ------------------------------------------------------------------
  // 4. GRAVAR ANTES DE ENVIAR.
  //
  // `reservada_em` é o que `whatsapp_folga` conta. Enviar primeiro e gravar
  // depois deixaria duas requisições simultâneas verem folga e mandarem as
  // duas. E se a linha não entrar, nada é enviado — o oposto perderia a
  // mensagem do histórico depois de o cliente já a ter recebido.
  // ------------------------------------------------------------------
  const { data: linha, error: erroInsert } = await admin
    .from("mensagens")
    .insert({
      tenant_id: negocio.tenant_id,
      negocio_id: negocio.id,
      contato_id: negocio.contato_id,
      direcao: "saida",
      canal: "whatsapp",
      status: "enviando",
      destino,
      corpo: texto.trim(),
      corpo_formato: "texto",
      gerado_por: "humano",
      automatica: false,
      reservada_em: new Date().toISOString(),
      agendada_para: null,
      idempotency_key: `resposta:${chave}`,
      aprovada_por: user.id,
      aprovada_em: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroInsert) {
    if (erroInsert.code !== "23505") {
      return NextResponse.json({ error: erroInsert.message }, { status: 500 });
    }

    // 23505 = a mesma chave já foi usada. Quase sempre é o segundo clique de um
    // duplo clique, e a trava fez o trabalho dela. Mas NÃO dá para responder
    // "já enviada" sem olhar: a primeira tentativa pode ter gravado a linha e a
    // Meta ter recusado o envio. Dizer que saiu uma mensagem que o cliente
    // nunca recebeu é o pior erro possível nesta tela — alguém decide não
    // ligar para o cliente por causa disso.
    const { data: anterior } = await admin
      .from("mensagens")
      .select("status, ultimo_erro")
      .eq("idempotency_key", `resposta:${chave}`)
      .maybeSingle();

    if (anterior?.status === "enviada") {
      return NextResponse.json({ ok: true, jaEnviada: true });
    }
    if (anterior?.status === "falhou") {
      return NextResponse.json(
        {
          error: `A tentativa anterior desta mensagem falhou${anterior.ultimo_erro ? `: ${anterior.ultimo_erro}` : "."} Edite o texto para tentar de novo.`,
          motivo: "falhou_antes",
        },
        { status: 409 },
      );
    }
    // `enviando`, ou reagendada: está em curso. Devolver "enviada" seria
    // adiantar um desfecho que ainda não existe.
    return NextResponse.json(
      { error: "Esta mensagem ainda está saindo. Aguarde alguns segundos.", motivo: "em_curso" },
      { status: 409 },
    );
  }

  const r = await enviarTextoLivre({ para: destino, texto: texto.trim() });

  // `concluir_envio` carimba `enviada_em`, guarda o código de erro da Meta e —
  // o que mais importa — roda o monitor de bloqueio. Reimplementar isso aqui
  // criaria uma segunda verdade sobre quando pausar o número sozinho.
  await admin.rpc("concluir_envio", {
    p_id: linha.id,
    p_ok: r.enviado,
    p_provedor_id: r.id ?? undefined,
    p_erro: r.enviado ? undefined : r.erro || "falha desconhecida no envio",
    p_erro_codigo: r.codigo ?? undefined,
  });

  if (!r.enviado) {
    return NextResponse.json(
      { error: r.erro || "A Meta recusou o envio.", motivo: "meta", codigo: r.codigo },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: linha.id,
    janelaRestante: descreverRestante(janela.restanteMs),
  });
}
