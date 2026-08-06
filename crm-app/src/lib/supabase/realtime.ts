import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Assina um canal Realtime AUTENTICANDO o socket antes de entrar no canal.
 *
 * Sem isso o WebSocket sobe como `anon`: o RLS não casa (auth.uid() é nulo) e o
 * avaliador de RLS do Realtime (WALRUS) ainda derruba o stream inteiro por avaliar
 * a política com um papel sem permissão nos helpers. Chamando `setAuth` com o token
 * do usuário ANTES do `subscribe`, o canal entra já como `authenticated`, as
 * políticas casam e os eventos passam a chegar.
 *
 * Retorna a função de limpeza — use direto no `return` do `useEffect`.
 */
export function assinarRealtime(
  nome: string,
  configurar: (canal: RealtimeChannel) => RealtimeChannel,
): () => void {
  const supabase = createClient();
  let canal: RealtimeChannel | null = null;
  let cancelado = false;

  (async () => {
    const { data } = await supabase.auth.getSession();
    if (cancelado) return;
    if (data.session?.access_token) {
      await supabase.realtime.setAuth(data.session.access_token);
    }
    canal = configurar(supabase.channel(nome));
    canal.subscribe();
  })();

  return () => {
    cancelado = true;
    if (canal) supabase.removeChannel(canal);
  };
}
