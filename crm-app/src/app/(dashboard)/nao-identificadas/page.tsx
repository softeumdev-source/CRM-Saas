import { createClient } from "@/lib/supabase/server";
import { QuarentenaClient } from "@/components/QuarentenaClient";

/**
 * A quarentena ganha tela.
 *
 * `mensagens_sem_negocio` era gravada pelo sync do Gmail e pelo webhook da Meta
 * e **nenhuma tela a mostrava**. Mensagem que caía ali era invisível — o
 * comportamento pior do que perder, porque o CRM sabia da conversa e não
 * contava para ninguém.
 *
 * As duas consultas saem pela SESSÃO, então a RLS já recorta: a linha da
 * quarentena por "mesmo tenant E (admin OU a caixa é minha)", e os negócios
 * pela `negocios_select` de sempre.
 */
export default async function NaoIdentificadasPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: eu } = user
    ? await supabase.from("usuarios").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  const [{ data: mensagens }, { data: negocios }] = await Promise.all([
    supabase
      .from("mensagens_sem_negocio")
      .select("*, resolvido:negocios(id, titulo)")
      .order("recebida_em", { ascending: false, nullsFirst: false })
      .order("criado_em", { ascending: false })
      .limit(200),
    // Para o seletor. Só os ABERTOS: associar uma resposta a um negócio fechado
    // há seis meses é quase sempre engano, e é a mesma regra que o resolver
    // automático já aplica no primeiro degrau do desempate.
    supabase
      .from("negocios")
      .select("id, titulo, contato:contatos(nome, empresa)")
      .is("ganho", null)
      .order("ultima_atividade_em", { ascending: false, nullsFirst: false })
      .limit(300),
  ]);

  return (
    <QuarentenaClient
      mensagensIniciais={mensagens || []}
      negocios={(negocios as never) || []}
      souAdmin={eu?.role === "admin"}
    />
  );
}
