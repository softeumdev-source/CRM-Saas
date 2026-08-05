import { createClient as createJsClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Cliente com service role - acesso total, ignora RLS. USO EXCLUSIVO NO SERVIDOR.
 * Nunca importar em componentes client. Usado para operacoes de Storage nas rotas
 * publicas de assinatura (upload dos PDFs, geracao de URLs assinadas).
 *
 * Requer a env var SUPABASE_SERVICE_ROLE_KEY (secreta, NAO usar prefixo NEXT_PUBLIC).
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  }
  return createJsClient<Database>(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function temServiceRole(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
