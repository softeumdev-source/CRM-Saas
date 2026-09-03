"use client";

import { AlertTriangle, Check, Inbox } from "lucide-react";
import { Botao, Cartao, Rotulo } from "@/components/ui";
import { formatarDataHora } from "@/lib/atividades";
import { temGmail } from "@/lib/google/escopos";
import type { Tables } from "@/lib/supabase/types";

/**
 * O cartão da caixa de entrada, com os cinco estados que ela tem de verdade.
 *
 * Vive separado de `IntegracoesTab` para os estados serem OLHÁVEIS: a aba
 * carrega os dados por conta própria, então lá dentro só dá para ver o estado
 * que a sua conta estiver por acaso. Como componente com a integração vindo por
 * prop, os cinco se renderizam lado a lado.
 *
 * Com "use client" porque o botão leva um `onClick`, e handler de função não
 * atravessa a fronteira servidor -> cliente. Sem a diretiva o componente
 * funciona por acidente — só enquanto quem importa for cliente, como
 * `IntegracoesTab` é hoje — e explode com 500 na primeira página de servidor
 * que o usar. Foi assim que este defeito apareceu: no build, nunca; ao abrir a
 * página, imediatamente.
 */
export function CaixaDeEntradaGoogle({
  integracao,
}: {
  integracao: Pick<
    Tables<"integracoes_google">,
    "email_google" | "escopos" | "gmail_erro" | "gmail_sincronizado_em"
  > | null;
}) {
  return (
    <Cartao className="space-y-4">
      <div>
        <Rotulo className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-acento" /> Caixa de entrada no card
        </Rotulo>
        <p className="text-rotulo text-tinta-suave mt-1">
          Autorizando a leitura do Gmail, a resposta do cliente aparece dentro do card do negócio,
          e o card acende no board. É <strong>somente leitura</strong>: o CRM não manda e-mail pela
          sua conta nem apaga nada. Só é lido o e-mail que casa com um negócio — o resto da sua
          caixa o CRM nem chega a abrir.
        </p>
      </div>

      {!integracao ? (
        // 1. Sem conta nenhuma. Não faz sentido oferecer o Gmail separado: o
        //    consentimento pede agenda e caixa de uma vez.
        <p className="text-rotulo text-tinta-fraca">Conecte sua conta Google acima primeiro.</p>
      ) : !temGmail(integracao.escopos) ? (
        // 2. Conta conectada, escopo do Gmail ainda não concedido.
        <div className="space-y-3">
          <p className="text-rotulo text-tinta-suave">
            Sua conta já está conectada para a agenda. Autorizar a leitura não desfaz nada nem pede
            para reconectar do zero — a Google só acrescenta a permissão.
          </p>
          <Botao
            variante="primario"
            onClick={() => {
              window.location.href = "/api/google/conectar?escopo=gmail";
            }}
          >
            <Inbox className="h-4 w-4" /> Autorizar leitura do Gmail
          </Botao>
        </div>
      ) : integracao.gmail_erro ? (
        // 5. Autorizado, mas a leitura PAROU. Tom de risco, não de sucesso: um
        //    "Leitura autorizada" em verde com uma linha vermelha embaixo diz
        //    as duas coisas ao mesmo tempo, e quem bate o olho lê a cor antes
        //    de ler o texto. O erro precisa estar na tela porque um sync que
        //    falha calado é indistinguível de uma caixa em que ninguém escreveu.
        <div className="rounded-2xl border border-risco/40 bg-risco-fraco p-4 space-y-2">
          <div className="space-y-1">
            <p className="text-corpo font-medium text-risco flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Leitura interrompida em{" "}
              {integracao.email_google}
            </p>
            <p className="text-rotulo text-risco">{integracao.gmail_erro}</p>
            {integracao.gmail_sincronizado_em && (
              <p className="text-rotulo text-risco">
                A última leitura que funcionou foi em{" "}
                {formatarDataHora(integracao.gmail_sincronizado_em)}. Nada chegou aos cards desde
                então.
              </p>
            )}
          </div>
          <Botao
            variante="secundario"
            tamanho="sm"
            onClick={() => {
              window.location.href = "/api/google/conectar?escopo=gmail";
            }}
          >
            <Inbox className="h-3.5 w-3.5" /> Autorizar de novo
          </Botao>
        </div>
      ) : (
        <div className="rounded-2xl border border-ok/40 bg-ok-fraco p-4 space-y-1">
          <p className="text-corpo font-medium text-ok flex items-center gap-2">
            <Check className="h-4 w-4" /> Leitura autorizada em {integracao.email_google}
          </p>
          {integracao.gmail_sincronizado_em ? (
            // 4. Em funcionamento.
            <p className="text-rotulo text-ok">
              Última leitura em {formatarDataHora(integracao.gmail_sincronizado_em)} — a cada 5
              minutos.
            </p>
          ) : (
            // 3. Autorizado e ainda não leu nada. O aviso mais importante da
            //    tela: o histórico NÃO vem. Sem dizer isto, quem autorizar vai
            //    procurar conversas antigas nos cards e concluir que quebrou.
            <p className="text-rotulo text-ok">
              Primeira leitura em até 5 minutos. Conversas <strong>anteriores a agora</strong> não
              são importadas — só o que chegar a partir daqui.
            </p>
          )}
        </div>
      )}
    </Cartao>
  );
}
