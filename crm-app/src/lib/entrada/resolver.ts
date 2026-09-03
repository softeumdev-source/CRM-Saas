import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * De quem é esta mensagem, e a qual negócio ela pertence.
 *
 * O problema não é achar o contato — é escolher o negócio quando o contato tem
 * mais de um. Escolher errado é pior do que não escolher: a cadência do card
 * ERRADO para, e a do certo continua disparando. Falha silenciosa dos dois
 * lados, e é por isso que o empate vai para quarentena em vez de virar chute.
 *
 * `tenantId` é obrigatório e não é burocracia: quem chama aqui é o sync e o
 * webhook, os dois com `service_role`, que **passa por cima da RLS**. Sem este
 * recorte, dois contatos com o mesmo e-mail em tenants diferentes fariam uma
 * resposta cair no negócio da empresa errada — e a RLS, que normalmente
 * impediria isso, não está no caminho.
 */

type Cliente = SupabaseClient<Database>;

export type Resolucao =
  | { tipo: "negocio"; negocioId: string; contatoId: string }
  | { tipo: "ambiguo"; contatoId: string; candidatos: { id: string; titulo: string }[] }
  | { tipo: "sem_negocio"; contatoId: string }
  | { tipo: "desconhecido" };

/**
 * A ordem de desempate, e o motivo de cada degrau:
 *
 * 1. Só negócios ABERTOS (`ganho is null`). Uma resposta não pertence a um
 *    negócio fechado há seis meses.
 * 2. Entre os abertos, o do funil de quem RECEBEU. Se a caixa é de um vendedor,
 *    a resposta é sobre o negócio de vendas dele, não sobre o lead que o SDR
 *    está prospectando em paralelo.
 * 3. Entre os que sobraram, o de `ultima_atividade_em` mais recente — a
 *    conversa viva.
 *
 * Sobrando mais de um depois disso, é empate de verdade: vai para quarentena.
 */
export async function resolverPorEmail(
  supabase: Cliente,
  remetente: string,
  papelDeQuemRecebeu: string | null,
  tenantId: string,
): Promise<Resolucao> {
  const email = remetente.trim().toLowerCase();
  if (!email.includes("@")) return { tipo: "desconhecido" };

  // O índice funcional `contatos_email_normalizado_idx` cobre exatamente isto.
  const { data: contatos } = await supabase
    .from("contatos")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("email", email)
    .limit(20);

  if (!contatos || contatos.length === 0) return { tipo: "desconhecido" };
  return escolherNegocio(supabase, contatos.map((c) => c.id), papelDeQuemRecebeu, tenantId);
}

export async function resolverPorTelefone(
  supabase: Cliente,
  numero: string,
  papelDeQuemRecebeu: string | null,
  tenantId: string,
): Promise<Resolucao> {
  // A normalização acontece no BANCO, pela mesma função que alimenta o índice —
  // reimplementar a regra do nono dígito aqui em TypeScript criaria duas
  // verdades que iriam divergir.
  const { data } = await supabase.rpc("contatos_por_telefone", { p_numero: numero });
  // A RPC é `security definer` e não recorta tenant (ela resolve o número ANTES
  // de saber a quem pertence), então o recorte é aqui.
  const contatos = ((data as { id: string; tenant_id: string | null }[] | null) || []).filter(
    (c) => c.tenant_id === tenantId,
  );
  if (contatos.length === 0) return { tipo: "desconhecido" };
  return escolherNegocio(supabase, contatos.map((c) => c.id), papelDeQuemRecebeu, tenantId);
}

async function escolherNegocio(
  supabase: Cliente,
  contatoIds: string[],
  papelDeQuemRecebeu: string | null,
  tenantId: string,
): Promise<Resolucao> {
  const primeiroContato = contatoIds[0];

  const { data: negocios } = await supabase
    .from("negocios")
    .select("id, titulo, contato_id, ultima_atividade_em, pipeline:pipelines(role_operador)")
    .eq("tenant_id", tenantId)
    .in("contato_id", contatoIds)
    .is("ganho", null)
    .order("ultima_atividade_em", { ascending: false, nullsFirst: false })
    .limit(50);

  if (!negocios || negocios.length === 0) return { tipo: "sem_negocio", contatoId: primeiroContato };

  if (negocios.length === 1) {
    return { tipo: "negocio", negocioId: negocios[0].id, contatoId: negocios[0].contato_id! };
  }

  // Degrau 2: o funil de quem recebeu.
  const doMeuPapel = papelDeQuemRecebeu
    ? negocios.filter(
        (n) => (n.pipeline as { role_operador?: string } | null)?.role_operador === papelDeQuemRecebeu,
      )
    : [];
  const pool = doMeuPapel.length > 0 ? doMeuPapel : negocios;

  // Degrau 3: a conversa viva. Só resolve se houver UM claramente mais recente;
  // dois com a mesma atividade (ou ambos sem atividade) é empate honesto.
  const maisRecente = pool[0];
  const empatados = pool.filter(
    (n) => (n.ultima_atividade_em ?? null) === (maisRecente.ultima_atividade_em ?? null),
  );

  if (empatados.length === 1) {
    return { tipo: "negocio", negocioId: maisRecente.id, contatoId: maisRecente.contato_id! };
  }

  return {
    tipo: "ambiguo",
    contatoId: primeiroContato,
    candidatos: pool.slice(0, 10).map((n) => ({ id: n.id, titulo: n.titulo })),
  };
}
