import { NextResponse } from "next/server";
import { quemAssina } from "@/lib/gmail/caixa";
import { descricaoSugerida, tituloSugerido } from "@/components/agenda/tipos";
import { createClient } from "@/lib/supabase/server";
import { criarEvento } from "@/lib/google/calendar";
import { temGoogleConfigurado } from "@/lib/google/config";

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

export async function POST(request: Request) {
  const { negocioId, quando, minutos, titulo, descricao, convite } = await request.json();

  if (!negocioId) return NextResponse.json({ error: "negocioId é obrigatório." }, { status: 422 });
  if (!quando) return NextResponse.json({ error: "Escolha a data e a hora." }, { status: 422 });

  const inicio = new Date(quando);
  if (Number.isNaN(inicio.getTime())) {
    return NextResponse.json({ error: "Data inválida." }, { status: 422 });
  }
  if (inicio.getTime() < Date.now() - FOLGA_PASSADO_MS) {
    return NextResponse.json(
      { error: "Essa data já passou. Escolha um horário à frente." },
      { status: 422 },
    );
  }

  const duracao = Number(minutos);
  const minutosFinais = Number.isFinite(duracao)
    ? Math.min(Math.max(Math.round(duracao), MINUTOS_MINIMO), MINUTOS_MAXIMO)
    : MINUTOS_PADRAO;

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
