import { createClient as createJsClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

/**
 * Client anonimo, sem sessao de usuario - seguro para uso em Client e Server Components.
 * Usado nas rotas publicas (assinatura, convite) que dependem de RPCs SECURITY DEFINER
 * validadas por token, nao por sessao autenticada.
 */
export function createAnonClient() {
  return createJsClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
