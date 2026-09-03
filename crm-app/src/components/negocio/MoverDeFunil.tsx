"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, CircleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { carregarEtapas, type Pipeline } from "@/lib/pipelines";
import { transferirDeFunil } from "@/lib/negocios";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { Alerta, Botao, Campo, Modal, Selecao } from "@/components/ui";

/**
 * Mover o negócio de um funil para o outro, nos dois sentidos, por dentro do
 * card.
 *
 * O card é o ÚNICO lugar onde isso cabe: `/sdr` redireciona quem não é `sdr`
 * nem `admin`, então o vendedor nunca vê o board de prospecção e não teria como
 * arrastar um card para lá.
 *
 * Isto NÃO substitui a entrega automática (mover para a etapa `funcao='entrega'`
 * já passa o lead sozinho) nem o no-show. É a saída manual para quando o
 * caminho automático não se aplica — o lead chegou no funil errado, ou o
 * vendedor decidiu devolver para prospecção sem ter havido reunião.
 */
export function MoverDeFunil({
  negocio,
  outroFunil,
  aoMover,
}: {
  negocio: NegocioComRelacoes;
  outroFunil: Pipeline;
  aoMover: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [etapas, setEtapas] = useState<EtapaPipeline[] | null>(null);
  const [etapaId, setEtapaId] = useState("");
  const [manterDono, setManterDono] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // As etapas do outro funil só são carregadas ao abrir: é uma ação rara e não
  // vale três consultas em toda abertura de card.
  useEffect(() => {
    if (!aberto || etapas) return;
    let vivo = true;
    void (async () => {
      const lista = await carregarEtapas(createClient(), outroFunil.id);
      if (!vivo) return;
      setEtapas(lista);
      // Padrão: a etapa de MESMA ORDEM. Só é honesto porque os dois funis têm
      // listas idênticas; casar por nome quebraria no primeiro renomeio.
      const mesmaOrdem = lista.find((e) => e.ordem === negocio.etapa?.ordem);
      setEtapaId(mesmaOrdem?.id || lista[0]?.id || "");
    })();
    return () => {
      vivo = false;
    };
  }, [aberto, etapas, outroFunil.id, negocio.etapa?.ordem]);

  const mover = async () => {
    const destino = etapas?.find((e) => e.id === etapaId);
    if (!destino) return;
    setOcupado(true);
    setErro(null);

    const r = await transferirDeFunil({
      negocioId: negocio.id,
      etapaDestino: destino,
      // A RPC SEMPRE sobrescreve `responsavel_id` com o que receber, e o
      // padrão dela é null. Passar explicitamente evita apagar o dono sem
      // querer — que é o que aconteceria se a escolha ficasse implícita.
      responsavelId: manterDono ? (negocio.responsavel_id ?? null) : null,
      titulo: `Movido para ${outroFunil.nome}`,
      descricao:
        `Movido de "${negocio.etapa?.nome ?? "—"}" para "${destino.nome}", em ${outroFunil.nome}` +
        (manterDono ? "." : ", sem dono, para o próximo da equipe assumir."),
    });

    setOcupado(false);
    if (!r.ok) {
      // A RPC recusa quando o negócio não é seu e está sem dono num funil de
      // outro papel — o que acontece justamente depois da entrega automática.
      // Melhor dizer isso do que mostrar a mensagem crua do Postgres.
      setErro(
        r.erro.includes("permissao")
          ? "Este negócio não é seu e já está sem dono no outro funil. Só o dono dele ou um admin pode movê-lo."
          : r.erro,
      );
      return;
    }
    setAberto(false);
    aoMover();
  };

  return (
    <>
      <Botao icone={ArrowLeftRight} onClick={() => setAberto(true)}>
        Mover para {outroFunil.nome}
      </Botao>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Mover para ${outroFunil.nome}`}
        rodape={
          <>
            <Botao variante="sutil" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={ocupado} disabled={!etapaId} onClick={mover}>
              Mover
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {erro ? (
            <Alerta tom="risco" icone={CircleAlert} urgente>
              {erro}
            </Alerta>
          ) : null}

          <Campo rotulo="Etapa de destino" dica="Sugerimos a etapa equivalente no outro funil.">
            {(p) => (
              <Selecao
                {...p}
                value={etapaId}
                onChange={(e) => setEtapaId(e.target.value)}
                disabled={!etapas}
              >
                {!etapas ? (
                  <option>Carregando…</option>
                ) : (
                  etapas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))
                )}
              </Selecao>
            )}
          </Campo>

          <Campo rotulo="Quem fica com o lead">
            {(p) => (
              <Selecao
                {...p}
                value={manterDono ? "manter" : "pool"}
                onChange={(e) => setManterDono(e.target.value === "manter")}
              >
                <option value="pool">Deixar no pool — o próximo da equipe assume</option>
                <option value="manter" disabled={!negocio.responsavel_id}>
                  Manter {negocio.responsavel?.nome || "o dono atual"}
                </option>
              </Selecao>
            )}
          </Campo>

          {manterDono ? (
            <Alerta tom="alerta" icone={CircleAlert}>
              Quem opera o outro funil não vai enxergar este lead, porque ele continua tendo dono —
              e o dono é de outra equipe.
            </Alerta>
          ) : null}

          {negocio.retomar_em ? (
            <Alerta tom="alerta" icone={CircleAlert} titulo="A data de retomada será apagada">
              Este lead está marcado para voltar. Mover de funil limpa essa data.
            </Alerta>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
