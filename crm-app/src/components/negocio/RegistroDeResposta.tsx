"use client";

import { useState } from "react";
import { ArrowDownLeft, Check, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alerta, AreaTexto, Botao } from "@/components/ui";
import { registrarMensagemManual } from "@/lib/whatsapp/registroManual";
import type { NegocioComRelacoes } from "@/lib/types";

/**
 * O que o cliente respondeu no WhatsApp, anotado no CRM.
 *
 * POR QUE ISTO SOBROU, E O RESTO NÃO
 *
 * A aba de WhatsApp inteira saiu: sem a API da Meta ela prometia um canal que
 * não existe, e o fluxo de bolhas era um histórico que quase nunca tinha nada.
 * Este pedaço ficou porque ele é o único que MUDA alguma coisa no sistema.
 *
 * Registrar uma mensagem de ENTRADA dispara `trg_mensagens_sinalizar_resposta`,
 * e três coisas acontecem de uma vez:
 *
 *   1. o card acende o selo azul no Kanban e sobe para o topo da coluna;
 *   2. `processar_cadencias` encerra a inscrição no próximo ciclo — o robô para
 *      de mandar e-mail para quem já está falando com você;
 *   3. as tarefas de WhatsApp ainda pendentes daquele lead são canceladas, com
 *      o motivo escrito.
 *
 * Sem este registro, a conversa acontece no WhatsApp Web e o CRM não fica
 * sabendo de nada — e continua tratando um lead que respondeu como um lead
 * frio.
 */
export function RegistroDeResposta({ negocio }: { negocio: NegocioComRelacoes }) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const destino = negocio.contato?.whatsapp || negocio.contato?.telefone || "";

  const registrar = async () => {
    setSalvando(true);
    setErro(null);
    const r = await registrarMensagemManual({
      tenantId: negocio.tenant_id,
      negocioId: negocio.id,
      contatoId: negocio.contato_id,
      destino,
      corpo: texto,
      direcao: "entrada",
    });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setTexto("");
    setPronto(true);

    // Marcar como lida AQUI, e não ao abrir a aba: quem digitou o texto foi
    // quem leu a mensagem no WhatsApp Web.
    //
    // `await`, e não `void`: o builder do PostgREST é um thenable preguiçoso —
    // sem `await` nem `.then()` a requisição nunca sai, sem erro nenhum. Foi
    // exatamente esse `void` que deixou o selo de "Respondeu" aceso para
    // sempre (ver o bloco no topo de `usarRespostasLidas.ts`).
    const { error } = await createClient()
      .from("negocios")
      .update({ respostas_nao_lidas: 0, respostas_lidas_em: new Date().toISOString() })
      .eq("id", negocio.id);
    if (error) console.error("Não foi possível marcar as respostas como lidas:", error.message);
  };

  return (
    <div className="bg-superficie rounded-2xl border border-fio shadow-xs p-5 space-y-3">
      <div>
        <h3 className="font-medium text-corpo text-tinta flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-acento" /> O cliente respondeu no WhatsApp?
        </h3>
        <p className="text-rotulo text-tinta-suave mt-1">
          Cole aqui o que ele escreveu. É este registro que acende o selo azul no Kanban e{" "}
          <strong className="font-medium text-tinta">para a cadência</strong> — sem ele, o sistema
          continua mandando e-mail e pedindo toque de WhatsApp para alguém que já está conversando
          com você.
        </p>
      </div>

      {erro && <Alerta tom="risco">{erro}</Alerta>}

      {pronto && (
        <Alerta tom="ok" icone={Check}>
          Registrado. A cadência deste lead para no próximo ciclo, e as tarefas de WhatsApp que
          ainda estavam pendentes foram canceladas.
        </Alerta>
      )}

      <AreaTexto
        rows={3}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          if (pronto) setPronto(false);
        }}
        placeholder="O que ele escreveu…"
        aria-label="Resposta recebida do cliente pelo WhatsApp"
        disabled={salvando}
      />

      <div className="flex justify-end">
        <Botao
          variante="primario"
          tamanho="sm"
          icone={ArrowDownLeft}
          carregando={salvando}
          disabled={!texto.trim()}
          onClick={() => void registrar()}
        >
          Registrar resposta
        </Botao>
      </div>
    </div>
  );
}
