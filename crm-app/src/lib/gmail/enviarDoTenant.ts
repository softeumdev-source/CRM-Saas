/**
 * Mandar e-mail para o CLIENTE, pela caixa comercial do tenant.
 *
 * Existe para as rotas que não têm um negócio na mão nem uma fila de cadência —
 * a proposta e o aviso de "todos assinaram" — poderem sair pelo mesmo caminho
 * que o despachante, sem cada uma redescobrir como achar a caixa.
 *
 * O que NÃO passa por aqui, de propósito: convite de usuário do CRM. Aquilo é
 * e-mail de sistema, continua no Resend, e é assim que dá para convidar alguém
 * mesmo com a conta Google fora do ar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { caixasDeSaida } from "@/lib/gmail/caixa";
import { enviarPeloGmail, type AnexoParaEnviar } from "@/lib/gmail/enviar";
import { temGoogleConfigurado } from "@/lib/google/config";

/**
 * Mesma forma de `EmailResult` do Resend, para as rotas que já respondem
 * `{ emailEnviado, emailErro }` não precisarem mudar de contrato.
 */
export type ResultadoDoEnvio = {
  enviado: boolean;
  id?: string;
  erro?: string;
};

export async function enviarDoTenant(
  admin: SupabaseClient<Database>,
  tenantId: string | null | undefined,
  m: {
    para: string;
    assunto: string;
    html: string;
    nomeDeExibicao?: string | null;
    anexos?: AnexoParaEnviar[];
  },
): Promise<ResultadoDoEnvio> {
  if (!temGoogleConfigurado()) {
    return { enviado: false, erro: "Google não configurado (GOOGLE_CLIENT_ID/SECRET)." };
  }
  if (!tenantId) return { enviado: false, erro: "Sem tenant para descobrir a caixa de envio." };

  const caixa = (await caixasDeSaida(admin, [tenantId])).get(tenantId);
  if (!caixa) {
    return {
      enviado: false,
      erro:
        "Nenhuma caixa de e-mail conectada com permissão de envio. " +
        "Conecte a conta comercial em Admin → Integrações.",
    };
  }

  try {
    const e = await enviarPeloGmail(caixa.usuarioId, {
      de: caixa.email,
      nomeDeExibicao: m.nomeDeExibicao ?? "Softeum",
      para: m.para,
      assunto: m.assunto,
      html: m.html,
      anexos: m.anexos,
    });
    return { enviado: true, id: e.id };
  } catch (erro) {
    return { enviado: false, erro: erro instanceof Error ? erro.message : "Falha ao enviar pelo Gmail." };
  }
}
