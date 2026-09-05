"use client";

import { useState } from "react";
import { Plus, Layers, CheckCircle2, AlertTriangle } from "lucide-react";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { estaAtrasada, ordenarPorCadencia, proximaAtividade, temAtividadeHoje } from "@/lib/atividades";
import { LeadCard, type VarianteDoCard } from "@/components/LeadCard";
import type { ResumoCadencia, ResumoDeAprovacao } from "@/lib/board";

export function KanbanBoard({
  etapas,
  negocios,
  variante = "vendas",
  cadencias,
  aprovacoes,
  totaisPorEtapa,
  carregadosPorEtapa,
  carregandoMais,
  onCarregarMais,
  onNovoNegocio,
  onMoverNegocio,
}: {
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
  /** Qual board e este. Vem de `pipeline.chave`, nao de adivinhacao. */
  variante?: VarianteDoCard;
  /** Andamento da cadencia por negocio. Vazio fora do board do SDR. */
  cadencias?: Record<string, ResumoCadencia>;
  aprovacoes?: Record<string, ResumoDeAprovacao>;
  /** Quantos existem no banco por etapa — pode ser mais do que está carregado. */
  totaisPorEtapa: Record<string, number>;
  /** Quantos estão carregados por etapa, ANTES dos filtros de busca/foco. */
  carregadosPorEtapa: Record<string, number>;
  carregandoMais: boolean;
  onCarregarMais: () => void;
  onNovoNegocio: (etapaId: string) => void;
  onMoverNegocio: (negocioId: string, etapaId: string) => void;
}) {
  const [etapaAlvo, setEtapaAlvo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const handleDrop = (e: React.DragEvent, etapaId: string) => {
    e.preventDefault();
    setEtapaAlvo(null);
    setArrastando(null);
    const negocioId = e.dataTransfer.getData("text/plain");
    if (!negocioId) return;
    onMoverNegocio(negocioId, etapaId);
  };

  return (
    /**
     * O board vive no MESMO contêiner do cabeçalho e dos filtros.
     *
     * Eles estão em `max-w-pagina mx-auto`, como a Navbar; o board não tinha
     * contêiner nenhum, então numa tela larga a página inteira ficava
     * centralizada e só as colunas começavam coladas na esquerda. Era isso que
     * se via como "não alinhado".
     *
     * E `mx-auto w-max` na FILEIRA, não `justify-center`: com `justify-center`
     * num contêiner que rola, o excedente vaza para a esquerda e a primeira
     * coluna fica inalcançável — a rolagem não vai a offset negativo. Com
     * `w-max`, as margens automáticas viram zero assim que o conteúdo passa da
     * largura, e aí ele rola normalmente a partir da esquerda.
     *
     * O respiro lateral vai na fileira e não no contêiner: assim ele ROLA junto,
     * e a última coluna não termina colada na borda.
     */
    <div className="mx-auto w-full max-w-pagina flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-x-auto pb-6 pt-4">
        <div className="mx-auto flex h-full w-max gap-4 px-4 sm:px-6">
        {etapas.map((etapa) => {
          const doEtapa = ordenarPorCadencia(negocios.filter((n) => n.etapa_id === etapa.id));
          const totalValor = doEtapa.reduce((acc, n) => acc + (n.valor || 0), 0);
          // "Valor na etapa: R$ 0,00" em toda coluna era o mesmo ruido que o
          // "R$ 0,00" gigante no card: em prospeccao o valor ainda nao existe.
          // A coluna do SDR mede o que ele controla — quantos leads estao
          // sendo tocados.
          const emCadencia = doEtapa.filter((n) => cadencias?.[n.id]).length;
          const trabalhadosHoje = doEtapa.filter((n) => temAtividadeHoje(n)).length;
          const atrasados = doEtapa.filter((n) => estaAtrasada(proximaAtividade(n.atividades_pendentes)?.data_agendada)).length;
          const cor = etapa.cor || "#6366f1";
          const alvo = etapaAlvo === etapa.id;
          // Três números diferentes, e confundi-los é o que faz um board
          // mentir: `total` é quanto existe no banco, `carregados` é quanto
          // veio nesta fatia, e `doEtapa.length` é quanto sobrou depois da
          // busca e do foco. "Faltam" tem que sair dos dois primeiros — se
          // saísse do filtrado, digitar qualquer busca faria toda coluna pedir
          // "ver mais".
          const total = totaisPorEtapa[etapa.id] ?? doEtapa.length;
          const carregados = carregadosPorEtapa[etapa.id] ?? doEtapa.length;
          const faltam = Math.max(0, total - carregados);
          const filtrando = doEtapa.length !== carregados;

          return (
            <div
              key={etapa.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (etapaAlvo !== etapa.id) setEtapaAlvo(etapa.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setEtapaAlvo(null);
              }}
              onDrop={(e) => handleDrop(e, etapa.id)}
              /**
               * `w-72` no celular e `w-80` a partir de `sm`: com 320px fixos, um
               * telefone de 360px mostrava uma coluna e uma lasca da seguinte.
               * 288 + 32 de respiro cabem, e ainda sobra a espiada que diz que
               * há mais board para o lado.
               *
               * A cor da etapa saiu do FUNDO. Ela era concatenada em hex com
               * alfa (`cor + "0a"`), o que o `DESIGN.md` proíbe — e no tema
               * escuro pintava um véu claro por cima de fundo escuro. A
               * identidade da etapa agora é o ponto ao lado do nome e o fio
               * abaixo do cabeçalho; a superfície é `bg-recuo`, que é o degrau
               * certo para o cartão branco ficar por cima.
               */
              className={`w-72 sm:w-80 shrink-0 flex flex-col rounded-2xl border p-3.5 h-full max-h-full transition-colors duration-150 ease-out ${
                alvo ? "border-acento bg-acento-fraco" : "border-fio bg-recuo"
              }`}
            >
              <div className="mb-3 pb-2.5 border-b-2" style={{ borderColor: cor }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* O ponto nunca é a única informação: o nome da etapa está
                        do lado, que é a regra do `DESIGN.md`. */}
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: cor }}
                      aria-hidden
                    />
                    <h2 className="font-medium text-corpo text-tinta truncate">{etapa.nome}</h2>
                    <span
                      className="shrink-0 rounded-full border border-fio bg-superficie px-2 py-0.5 text-rotulo font-medium text-tinta tabular"
                      title={
                        filtrando
                          ? `${doEtapa.length} de ${carregados} carregados (${total} no total)`
                          : faltam > 0
                            ? `${carregados} carregados de ${total}`
                            : undefined
                      }
                    >
                      {filtrando ? doEtapa.length : faltam > 0 ? `${carregados}/${total}` : total}
                    </span>
                  </div>
                  <button
                    onClick={() => onNovoNegocio(etapa.id)}
                    className="foco shrink-0 rounded-lg p-1.5 text-tinta-fraca transition-colors duration-150 ease-out hover:bg-superficie hover:text-tinta pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    title={`Adicionar negócio em ${etapa.nome}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-rotulo text-tinta-suave">
                  <span>{variante === "sdr" ? "Em cadência:" : "Valor na etapa:"}</span>
                  <span className="font-semibold text-tinta tabular">
                    {variante === "sdr"
                      ? `${emCadencia} de ${doEtapa.length}`
                      : formatarMoeda(totalValor)}
                  </span>
                </div>
                {doEtapa.length > 0 && (
                  <div className="flex items-center gap-3 mt-1.5 text-rotulo font-semibold">
                    <span className="flex items-center gap-1 text-ok" title="Negócios com atividade registrada hoje">
                      <CheckCircle2 className="h-3 w-3" /> {trabalhadosHoje} hoje
                    </span>
                    {atrasados > 0 && (
                      <span className="flex items-center gap-1 text-risco" title="Negócios com próximo passo atrasado">
                        <AlertTriangle className="h-3 w-3" /> {atrasados} atrasado{atrasados > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
                {doEtapa.length === 0 ? (
                  <div className="h-32 border-2 border-dashed border-fio rounded-xl flex flex-col items-center justify-center p-4 text-center">
                    <Layers className="h-6 w-6 text-tinta-fraca mb-1" />
                    <p className="text-rotulo text-tinta-fraca font-medium">Nenhum negócio nesta etapa</p>
                  </div>
                ) : (
                  doEtapa.map((negocio) => (
                    <div
                      key={negocio.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", negocio.id);
                        e.dataTransfer.effectAllowed = "move";
                        setArrastando(negocio.id);
                      }}
                      onDragEnd={() => {
                        setArrastando(null);
                        setEtapaAlvo(null);
                      }}
                      className={`cursor-grab active:cursor-grabbing transition-opacity ${
                        arrastando === negocio.id ? "opacity-40" : ""
                      }`}
                    >
                      <LeadCard
                        negocio={negocio}
                        variante={variante}
                        cadencia={cadencias?.[negocio.id]}
                        aprovacao={aprovacoes?.[negocio.id]}
                      />
                    </div>
                  ))
                )}

                {faltam > 0 && (
                  <button
                    onClick={onCarregarMais}
                    disabled={carregandoMais}
                    className="foco w-full rounded-xl border border-dashed border-fio-forte bg-superficie py-2 text-rotulo font-medium text-tinta-suave transition-colors duration-150 ease-out hover:text-acento disabled:opacity-60 pointer-coarse:min-h-11"
                  >
                    {carregandoMais ? "Carregando…" : `Ver mais ${faltam > 50 ? 50 : faltam}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
