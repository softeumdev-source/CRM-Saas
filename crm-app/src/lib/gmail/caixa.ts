/**
 * De onde sai o e-mail, e em qual conversa ele entra.
 *
 * As duas perguntas que o envio precisa responder antes de montar um MIME, e
 * que até agora ninguém fazia: o Resend mandava de um endereço de sistema, sem
 * thread nenhuma.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { ESCOPO_GMAIL_ENVIO } from "@/lib/google/escopos";

export type CaixaDeSaida = {
  /** Dono da conexão Google — é o token dele que assina o envio. */
  usuarioId: string;
  email: string;
  /**
   * O nome que o cliente vê no `From` e na assinatura do corpo.
   *
   * É da CAIXA, e não de quem conectou o Google nem de quem clicou em enviar.
   * A caixa é uma só, então a pessoa que o cliente conhece também é uma só —
   * e ela continua a mesma quando o lead ainda não tem dono, que é o estado
   * normal de todo lead novo em prospecção.
   */
  nome: string | null;
};

/**
 * A caixa de saída de cada tenant, numa consulta só.
 *
 * Devolve mapa por `tenant_id` porque o despachante roda com service role e
 * atende todos os tenants no mesmo lote; resolver um por vez seria uma ida ao
 * banco por mensagem.
 *
 * Só entra tenant cuja caixa tem de fato o escopo de ENVIO. Uma conexão feita
 * antes de o envio existir tem só `gmail.readonly`, e aceitar essa conexão aqui
 * trocaria um erro de configuração legível por um 403 da Google no meio do
 * lote.
 */
export async function caixasDeSaida(
  supabase: SupabaseClient<Database>,
  tenantIds: string[],
): Promise<Map<string, CaixaDeSaida>> {
  const mapa = new Map<string, CaixaDeSaida>();
  if (tenantIds.length === 0) return mapa;

  const { data } = await supabase
    .from("tenants")
    .select("id, caixa_email_usuario_id, caixa_email_nome")
    .in("id", tenantIds)
    .not("caixa_email_usuario_id", "is", null);

  const usuarios = (data || []).map((t) => t.caixa_email_usuario_id!).filter(Boolean);
  if (usuarios.length === 0) return mapa;

  const { data: conexoes } = await supabase
    .from("integracoes_google")
    .select("usuario_id, email_google, escopos")
    .in("usuario_id", usuarios)
    .not("refresh_token_id", "is", null);

  const porUsuario = new Map((conexoes || []).map((c) => [c.usuario_id, c]));
  for (const t of data || []) {
    const c = porUsuario.get(t.caixa_email_usuario_id!);
    if (!c || !(c.escopos || []).includes(ESCOPO_GMAIL_ENVIO)) continue;
    mapa.set(t.id, { usuarioId: c.usuario_id, email: c.email_google, nome: t.caixa_email_nome });
  }
  return mapa;
}

/**
 * O último recurso, quando o tenant ainda não tem nome de caixa configurado.
 *
 * Existe para nunca sair `From: <comercial@softeum.com.br>` sem nome nenhum —
 * um endereço nu no remetente é o que mais parece spam numa caixa de entrada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AQUI MORAVA `nomeDeExibicao(responsavel)`, e ele estava errado por desenho.
 *
 * Aquela função derivava o nome do RESPONSÁVEL pelo negócio e devolvia
 * "Primeiro (Softeum)". Três defeitos, todos medidos nas mensagens já enviadas:
 *
 *   1. lead novo em prospecção nasce SEM DONO — é o desenho do pool —, então o
 *      caminho normal caía direto no literal "Softeum";
 *   2. quando havia dono, saía o nome de quem por acaso estava com o card, e
 *      não o da pessoa que o cliente conhece. O usuário-robô de semente chegou
 *      a assinar dois e-mails como "SDR IA";
 *   3. o CORPO assinava por outro caminho (`{{vendedor}}`, resolvido em SQL),
 *      então cabeçalho e assinatura podiam discordar no mesmo e-mail.
 *
 * O nome agora é propriedade da caixa (`tenants.caixa_email_nome`), lido por
 * TODOS os caminhos de envio e também pelo corpo. Uma fonte só.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const NOME_PADRAO_DO_REMETENTE = "Softeum";

/**
 * O nome que assina, para quem precisa dele ANTES de montar o corpo.
 *
 * `enviarDoTenant` resolve a caixa por dentro, o que basta para o cabeçalho.
 * Mas a assinatura vai no CORPO, e o corpo é montado no chamador — que então
 * precisa do nome uma pergunta antes. Uma consulta a mais numa rota que já
 * gera PDF e sobe arquivo é troco; ler o nome de outro lugar seria voltar a ter
 * duas fontes para a mesma pessoa.
 */
export async function quemAssina(
  supabase: SupabaseClient<Database>,
  tenantId: string | null | undefined,
): Promise<string> {
  if (!tenantId) return NOME_PADRAO_DO_REMETENTE;
  const caixa = (await caixasDeSaida(supabase, [tenantId])).get(tenantId);
  return caixa?.nome || NOME_PADRAO_DO_REMETENTE;
}

export type ContextoDeThread = {
  threadId: string | null;
  /** `Message-ID` da última mensagem, para o `In-Reply-To`. */
  emRespostaA: string | null;
  referencias: string[];
  /** Assunto da thread — o Gmail recusa `threadId` com assunto diferente. */
  assunto: string | null;
};

/**
 * Em qual conversa cada negócio deste lote está.
 *
 * Uma consulta para o lote inteiro, e não uma por mensagem: o despachante roda
 * de 5 em 5 minutos com até 20 mensagens.
 *
 * O teto de 200 linhas é deliberado — sem ele, um negócio com uma thread
 * gigante puxaria a conversa inteira só para descobrir o último `Message-ID`. O
 * que interessa é a mensagem mais recente de cada negócio, e a ordenação
 * garante que ela venha primeiro.
 */
export async function threadsDosNegocios(
  supabase: SupabaseClient<Database>,
  negocioIds: string[],
): Promise<Map<string, ContextoDeThread>> {
  const mapa = new Map<string, ContextoDeThread>();
  if (negocioIds.length === 0) return mapa;

  const { data } = await supabase
    .from("mensagens")
    .select("negocio_id, thread_externo, message_id_externo, in_reply_to, assunto")
    .in("negocio_id", negocioIds)
    .eq("canal", "email")
    .not("thread_externo", "is", null)
    .order("criado_em", { ascending: false })
    .limit(200);

  for (const m of data || []) {
    if (!m.negocio_id || mapa.has(m.negocio_id)) continue;
    mapa.set(m.negocio_id, {
      threadId: m.thread_externo,
      emRespostaA: m.message_id_externo,
      // A cadeia completa exigiria ler a thread toda. `In-Reply-To` mais o pai
      // já é o que os clientes usam para agrupar, e é o que dá para saber sem
      // uma segunda consulta por negócio.
      referencias: [m.in_reply_to, m.message_id_externo].filter((x): x is string => !!x),
      assunto: m.assunto,
    });
  }
  return mapa;
}

/** `Re: assunto`, sem empilhar `Re: Re: Re:`. */
export function assuntoDeResposta(original: string | null | undefined, padrao: string): string {
  const base = (original || padrao).trim();
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}
