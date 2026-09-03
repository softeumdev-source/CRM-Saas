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
import { podeReceberResposta } from "@/lib/resend";

export type CaixaDeSaida = {
  /** Dono da conexão Google — é o token dele que assina o envio. */
  usuarioId: string;
  email: string;
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
    .select("id, caixa_email_usuario_id")
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
    mapa.set(t.id, { usuarioId: c.usuario_id, email: c.email_google });
  }
  return mapa;
}

/**
 * O nome que o cliente vê no remetente.
 *
 * O endereço é sempre o mesmo (a caixa comercial), então a resposta cai sempre
 * no mesmo lugar e a thread não quebra. O que muda é só o nome: quem está
 * falando de verdade.
 *
 * O robô SDR IA tem e-mail `.invalid` de propósito, e `podeReceberResposta` já
 * é o teste de "isto é uma pessoa de verdade" usado no `Reply-To`. Reusar o
 * mesmo teste evita duas definições de quem é humano.
 */
export function nomeDeExibicao(responsavel: { nome?: string | null; email?: string | null } | null): string {
  if (!responsavel || !podeReceberResposta(responsavel.email)) return "Softeum";
  const primeiro = (responsavel.nome || "").trim().split(" ")[0];
  return primeiro ? `${primeiro} (Softeum)` : "Softeum";
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
