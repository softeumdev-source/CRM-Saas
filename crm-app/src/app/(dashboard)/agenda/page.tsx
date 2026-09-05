import { createClient } from "@/lib/supabase/server";
import { AgendaClient, type AtividadeAgenda } from "@/components/AgendaClient";
import type { NegocioAgendavel } from "@/components/agenda/tipos";
import { SELECT_AGENDA } from "@/lib/types";
import { quemAssina } from "@/lib/gmail/caixa";

/**
 * Teto do seletor de negócios do agendamento. É uma lista de escolha, não um
 * relatório: acima disto ninguém acha nada rolando, e a consulta passa a pesar
 * numa tela cujo trabalho principal é outro.
 */
const TETO_NEGOCIOS = 300;

export default async function AgendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: atividades }, { data: usuarioAtual }, { data: negocios }] = await Promise.all([
    supabase
      .from("atividades")
      .select(SELECT_AGENDA)
      .not("data_agendada", "is", null)
      .or("concluida.is.null,concluida.is.false")
      .order("data_agendada", { ascending: true }),
    supabase.from("usuarios").select("*").eq("id", user!.id).single(),
    // Só negócio ABERTO: agendar reunião para um negócio já fechado é quase
    // sempre engano, e a lista fica curta o bastante para ser útil. A RLS já
    // recorta ao que esta pessoa enxerga — não há filtro de dono aqui.
    supabase
      .from("negocios")
      .select("id, titulo, contato:contatos(nome, empresa, email)")
      .is("fechado_em", null)
      .order("ultima_atividade_em", { ascending: false, nullsFirst: false })
      .limit(TETO_NEGOCIOS),
  ]);

  // Depois do `Promise.all` porque depende do tenant que veio dele. Uma
  // consulta a mais numa tela que já faz três, e é o que garante que o convite
  // assine com o mesmo nome do e-mail.
  const vendedor = await quemAssina(supabase, usuarioAtual?.tenant_id);

  return (
    <AgendaClient
      atividadesIniciais={(atividades as unknown as AtividadeAgenda[]) || []}
      usuarioAtual={usuarioAtual!}
      negociosAgendaveis={(negocios as unknown as NegocioAgendavel[]) || []}
      vendedor={vendedor}
    />
  );
}
