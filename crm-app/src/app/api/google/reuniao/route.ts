import { NextResponse } from "next/server";
import { quemAssina } from "@/lib/gmail/caixa";
import { descricaoSugerida, tituloSugerido } from "@/components/agenda/tipos";
import { createClient } from "@/lib/supabase/server";
import {
  atualizarEvento,
  cancelarEvento,
  criarEvento,
  duracaoDoEvento,
} from "@/lib/google/calendar";
import { temGoogleConfigurado } from "@/lib/google/config";
import type { TablesUpdate } from "@/lib/supabase/types";

/**
 * Agendar uma reunião com o cliente em UM passo.
 *
 * POR QUE ESTA ROTA EXISTE, já havendo `/api/google/agendar`.
 *
 * Aquela rota transforma uma atividade JÁ agendada em convite. Chegar até ela
 * custava seis passos na aba Cadência: registrar uma atividade, marcar "agendar
 * próximo", escolher o tipo reunião, escolher a data, salvar, achar a linha na
 * lista e só então clicar em "Criar convite no Google". Ninguém agenda assim —
 * e era por isso que o Google Agenda parecia não existir no CRM.
 *
 * Aqui a reunião nasce inteira: a atividade e o convite saem da mesma
 * chamada. A rota antiga continua, e continua sendo o caminho de RETOMADA
 * quando o convite falhou e a reunião ficou só no CRM.
 *
 * A ORDEM, e por que ela é esta.
 *
 * O plano desta fase diz "o irreversível primeiro", e aqui isso se inverte de
 * propósito: a atividade vem antes do convite porque o `requestId` do Meet é
 * derivado do id dela, e porque a falha nessa ordem cai num estado que o
 * sistema JÁ sabe tratar — reunião marcada no CRM sem convite, exatamente o que
 * o botão "Criar convite no Google" da aba Cadência resolve num clique. Na
 * ordem inversa a falha deixaria um evento na agenda do cliente sem nada no
 * CRM apontando para ele: um convite órfão, que ninguém consegue nem cancelar.
 *
 * AUTORIZAÇÃO. Uma leitura do negócio com a SESSÃO de quem chamou. A RLS de
 * `negocios` é a mesma do board, então enxergar o negócio é ter direito a ele.
 * Não há segunda cópia da regra para divergir, e o evento é sempre criado na
 * agenda de quem clicou — nunca na de outra pessoa.
 */

/** Limites da duração. Abaixo de 5 min não é reunião; acima de 8h é engano. */
const MINUTOS_MINIMO = 5;
const MINUTOS_MAXIMO = 480;
const MINUTOS_PADRAO = 30;

/**
 * Folga para trás. Sem ela, "hoje 17h" clicado às 17h01 seria recusado — e o
 * caso legítimo de registrar uma reunião que acabou de ser combinada por
 * telefone viraria um erro sem sentido.
 */
const FOLGA_PASSADO_MS = 5 * 60_000;

/** A data pedida, ou a razão pela qual ela não serve. Uma só, para POST e PATCH. */
function lerQuando(quando: unknown): { inicio: Date } | { erro: string } {
  const inicio = new Date(String(quando));
  if (Number.isNaN(inicio.getTime())) return { erro: "Data inválida." };
  if (inicio.getTime() < Date.now() - FOLGA_PASSADO_MS) {
    return { erro: "Essa data já passou. Escolha um horário à frente." };
  }
  return { inicio };
}

/** Duração dentro dos limites, ou `null` quando não veio nada utilizável. */
function lerMinutos(minutos: unknown): number | null {
  const n = Number(minutos);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), MINUTOS_MINIMO), MINUTOS_MAXIMO);
}

/**
 * A atividade que a chamada vai mexer — lida com a SESSÃO de quem chamou.
 *
 * É a mesma autorização do `POST`: a RLS de `atividades` já diz que quem
 * enxerga o negócio pode alterar e apagar a atividade dele, sem distinção entre
 * vendedor e SDR. Ler com a sessão em vez de repetir a regra aqui é o que
 * impede as duas de divergirem.
 */
async function atividadeDaChamada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  atividadeId: unknown,
) {
  if (!atividadeId || typeof atividadeId !== "string") {
    return { erro: "atividadeId é obrigatório.", status: 422 as const };
  }
  const { data } = await supabase
    .from("atividades")
    .select("id, usuario_id, titulo, descricao, data_agendada, google_evento_id")
    .eq("id", atividadeId)
    .maybeSingle();

  if (!data) return { erro: "Reunião não encontrada.", status: 404 as const };
  return { atividade: data };
}

export async function POST(request: Request) {
  const { negocioId, quando, minutos, titulo, descricao, convite } = await request.json();

  if (!negocioId) return NextResponse.json({ error: "negocioId é obrigatório." }, { status: 422 });
  if (!quando) return NextResponse.json({ error: "Escolha a data e a hora." }, { status: 422 });

  const data = lerQuando(quando);
  if ("erro" in data) return NextResponse.json({ error: data.erro }, { status: 422 });
  const { inicio } = data;

  const minutosFinais = lerMinutos(minutos) ?? MINUTOS_PADRAO;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: usuarioAtual } = await supabase
    .from("usuarios")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: negocio } = await supabase
    .from("negocios")
    .select("id, titulo, contato:contatos(nome, empresa, email)")
    .eq("id", negocioId)
    .maybeSingle();

  if (!negocio) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  const contato = negocio.contato as never as { nome?: string; empresa?: string | null; email?: string } | null;
  const email = contato?.email?.trim() || null;

  // Convite pedido e contato sem e-mail: recusar ANTES de gravar. Gravar a
  // reunião e só depois dizer que o convite não sai deixaria a pessoa achando
  // que o cliente foi avisado.
  const querConvite = convite !== false;
  if (querConvite && !email) {
    return NextResponse.json(
      {
        error:
          "Este contato não tem e-mail cadastrado — sem ele a Google não consegue convidar ninguém. Cadastre o e-mail, ou desmarque o convite para agendar só no CRM.",
      },
      { status: 422 },
    );
  }
  if (querConvite && !temGoogleConfigurado()) {
    return NextResponse.json(
      { error: "O Google não está configurado neste ambiente. Desmarque o convite para agendar só no CRM." },
      { status: 503 },
    );
  }

  // As mesmas funções que o modal usou para mostrar o texto. Antes havia dois
  // fallbacks diferentes — a tela prometia a empresa, o servidor gravava o nome
  // do contato e, faltando ele, `negocio.titulo`, que é texto livre de CRM indo
  // para a agenda do cliente. Um contato sem nome com empresa preenchida saía
  // com um título que a pessoa nunca viu.
  const alvo = { contato: { nome: contato?.nome || "", empresa: contato?.empresa ?? null } };
  const assina = await quemAssina(supabase, usuarioAtual?.tenant_id);
  const tituloFinal = (typeof titulo === "string" && titulo.trim()) || tituloSugerido(alvo);
  const descricaoFinal =
    (typeof descricao === "string" && descricao.trim()) ||
    descricaoSugerida(alvo, minutosFinais, assina);
  const quandoIso = inicio.toISOString();

  const { data: atividade, error: erroInsert } = await supabase
    .from("atividades")
    .insert({
      negocio_id: negocio.id,
      usuario_id: user.id,
      tipo: "reuniao",
      titulo: tituloFinal,
      descricao: descricaoFinal,
      concluida: false,
      data_agendada: quandoIso,
      // Mesmo par que o resto do app grava: o lembrete acompanha a data, senão
      // a reunião não entra no despachante de lembretes.
      lembrete_data: quandoIso,
    })
    .select("*, usuario:usuarios(*)")
    .single();

  if (erroInsert || !atividade) {
    return NextResponse.json(
      { error: `Não foi possível agendar: ${erroInsert?.message || "falha ao gravar a atividade."}` },
      { status: 500 },
    );
  }

  if (!querConvite) {
    return NextResponse.json({ atividade, evento: null, aviso: null });
  }

  let evento;
  try {
    evento = await criarEvento({
      usuarioId: user.id,
      titulo: tituloFinal,
      descricao: descricaoFinal,
      inicio,
      minutos: minutosFinais,
      convidados: [{ email: email!, nome: contato?.nome }],
      requestId: `crm-${atividade.id}`,
    });
  } catch (e) {
    // A reunião EXISTE no CRM; o que faltou foi o convite. Dizer isso — em vez
    // de devolver um erro seco — é o que permite à tela mostrar "agendada, mas
    // o cliente não foi avisado" e mandar a pessoa ao botão de retomada, que já
    // existe na aba Cadência.
    return NextResponse.json({
      atividade,
      evento: null,
      aviso: `A reunião foi agendada no CRM, mas o convite não saiu: ${
        e instanceof Error ? e.message : "falha ao falar com a Google"
      }. Abra a aba Cadência e use "Criar convite no Google".`,
    });
  }

  const { data: atualizada, error: erroUpdate } = await supabase
    .from("atividades")
    .update({
      google_evento_id: evento.id,
      google_meet_link: evento.meetLink,
      google_resposta: "sem_resposta",
    })
    .eq("id", atividade.id)
    .select("*, usuario:usuarios(*)")
    .single();

  if (erroUpdate) {
    // O convite já está na caixa do cliente. Um erro genérico aqui faria a
    // pessoa tentar de novo e mandar um SEGUNDO convite.
    return NextResponse.json({
      atividade,
      evento,
      aviso: `O convite foi enviado, mas não consegui vinculá-lo à reunião: ${erroUpdate.message}. Não agende de novo — o cliente já recebeu.`,
    });
  }

  return NextResponse.json({ atividade: atualizada ?? atividade, evento, aviso: null });
}

/**
 * Mudar uma reunião que JÁ EXISTE: hora, duração, título ou pauta.
 *
 * O QUE ESTE VERBO CONSERTA. Havia um botão "Reagendar" na aba Cadência que
 * fazia `update` só em `atividades`. Nenhuma chamada à Google. O CRM passava a
 * mostrar a hora nova e o evento continuava na hora velha na agenda do vendedor
 * E NA DO CLIENTE, com o Meet do horário original — e ninguém era avisado. Quem
 * clicava achava que tinha remarcado.
 *
 * A GOOGLE VEM PRIMEIRO, e isso inverte de propósito a ordem do `POST` acima.
 * Lá a atividade nasce antes porque a falha cai num estado que o sistema sabe
 * tratar. Aqui é o contrário: gravar primeiro e falhar na Google reproduz
 * exatamente o defeito que este código existe para fechar — o CRM afirmando uma
 * hora que o cliente não tem.
 *
 * E o token é o de quem ORGANIZOU (`atividades.usuario_id`), não o de quem
 * clicou: quando o SDR agenda e entrega ao vendedor, o dono do evento é o SDR, e
 * um `PATCH` com o token do vendedor tomaria 403. Mesmo caminho que
 * `/api/google/rsvp` já usa.
 */
export async function PATCH(request: Request) {
  const { atividadeId, quando, minutos, titulo, descricao } = await request.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const lida = await atividadeDaChamada(supabase, atividadeId);
  if ("erro" in lida) return NextResponse.json({ error: lida.erro }, { status: lida.status });
  const { atividade } = lida;

  let inicio: Date | null = null;
  if (quando !== undefined) {
    const data = lerQuando(quando);
    if ("erro" in data) return NextResponse.json({ error: data.erro }, { status: 422 });
    inicio = data.inicio;
  }

  const tituloNovo = typeof titulo === "string" && titulo.trim() ? titulo.trim() : undefined;
  const descricaoNova = typeof descricao === "string" && descricao.trim() ? descricao.trim() : undefined;
  if (!inicio && !tituloNovo && !descricaoNova && minutos === undefined) {
    return NextResponse.json({ error: "Nada para alterar." }, { status: 422 });
  }

  let aviso: string | null = null;

  if (atividade.google_evento_id && atividade.usuario_id) {
    const dono = atividade.usuario_id;
    const evento = atividade.google_evento_id;

    // A duração não mora no nosso banco de propósito (ver `duracaoDoEvento`).
    // Sem esta leitura, remarcar sem informar duração encolheria silenciosamente
    // uma reunião de uma hora para o padrão de 30 minutos.
    let minutosFinais = lerMinutos(minutos);
    if (inicio && minutosFinais === null) {
      minutosFinais = (await duracaoDoEvento(dono, evento)) ?? MINUTOS_PADRAO;
    }

    try {
      const existia = await atualizarEvento({
        usuarioId: dono,
        eventoId: evento,
        inicio: inicio ?? undefined,
        minutos: inicio ? minutosFinais ?? MINUTOS_PADRAO : undefined,
        titulo: tituloNovo,
        descricao: descricaoNova,
      });
      if (!existia) {
        aviso =
          "O evento não existe mais na agenda do Google — alguém o apagou por lá. A reunião foi atualizada só no CRM.";
      }
    } catch (e) {
      // Nada foi gravado ainda: devolver erro aqui deixa CRM e Google
      // concordando na hora ANTIGA, que é o estado honesto.
      return NextResponse.json(
        {
          error: `Não foi possível alterar o evento na agenda: ${
            e instanceof Error ? e.message : "falha ao falar com a Google"
          }. Nada foi mudado.`,
        },
        { status: 502 },
      );
    }
  }

  const campos: TablesUpdate<"atividades"> = {};
  if (inicio) {
    const iso = inicio.toISOString();
    campos.data_agendada = iso;
    // Mesmo par que o resto do app grava, e `lembrete_enviado` volta a falso:
    // a reunião mudou de hora, então o lembrete dela ainda não saiu.
    campos.lembrete_data = iso;
    campos.lembrete_enviado = false;
  }
  if (tituloNovo) campos.titulo = tituloNovo;
  if (descricaoNova) campos.descricao = descricaoNova;

  const { data: atualizada, error } = await supabase
    .from("atividades")
    .update(campos)
    .eq("id", atividade.id)
    .select("*, usuario:usuarios(*)")
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: `A agenda do cliente já foi atualizada, mas o CRM não: ${error.message}. Recarregue a página antes de tentar de novo.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ atividade: atualizada, aviso });
}

/**
 * Cancelar a reunião — na agenda do cliente também.
 *
 * O botão de excluir apagava a linha de `atividades` direto, e com ela o
 * `google_evento_id`, que é a ÚNICA referência ao evento. O convite ficava na
 * agenda do cliente sem ninguém conseguir cancelá-lo — o "convite órfão" que o
 * comentário do `POST` cita como o estado a evitar.
 *
 * Por isso a Google vem primeiro aqui também: falhar depois de apagar a nossa
 * linha é irreversível; falhar antes deixa a linha de pé para tentar de novo.
 */
export async function DELETE(request: Request) {
  const { atividadeId } = await request.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const lida = await atividadeDaChamada(supabase, atividadeId);
  if ("erro" in lida) return NextResponse.json({ error: lida.erro }, { status: lida.status });
  const { atividade } = lida;

  let aviso: string | null = null;

  if (atividade.google_evento_id && atividade.usuario_id) {
    try {
      const existia = await cancelarEvento(atividade.usuario_id, atividade.google_evento_id);
      if (!existia) aviso = "O evento já não estava mais na agenda do Google.";
    } catch (e) {
      return NextResponse.json(
        {
          error: `Não foi possível cancelar o evento na agenda: ${
            e instanceof Error ? e.message : "falha ao falar com a Google"
          }. A reunião continua no CRM — tente de novo.`,
        },
        { status: 502 },
      );
    }
  }

  const { error } = await supabase.from("atividades").delete().eq("id", atividade.id);
  if (error) {
    return NextResponse.json(
      {
        error: `O convite foi cancelado na agenda do cliente, mas a reunião não saiu do CRM: ${error.message}.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, aviso });
}
