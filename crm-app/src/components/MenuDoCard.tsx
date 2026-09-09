"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MoreVertical, XCircle } from "lucide-react";
import type { EtapaPipeline } from "@/lib/types";
import { resultadoDaEtapa } from "@/lib/types";

/**
 * O menu de ações do card do board.
 *
 * POR QUE ELE EXISTE. Mover um card só era possível ARRASTANDO. No board do
 * SDR isso deixou de funcionar quando a etapa de entrada virou quatro colunas
 * de cadência: elas ocupam as quatro primeiras posições (~1.400px), então
 * "Qualificação", "Perdido" e "Nutrição / Futuro" começam FORA da tela num
 * notebook. Arrastar um card até lá exigiria que o contêiner rolasse sozinho
 * durante o arrasto — o drag-and-drop nativo do HTML5 não faz isso. Na prática
 * o SDR não tinha como dar "qualificado" nem "perdido" pelo kanban: só abrindo
 * o lead. Era isso que parecia "a coluna não existe".
 *
 * O mesmo vale para o board de vendas, onde "Fechado (Ganho)" e "Perdido" são
 * as duas últimas de oito colunas.
 *
 * O QUE ELE NÃO FAZ. Nenhuma regra de negócio mora aqui. Mover chama
 * `moverEtapa` e fechar chama `fecharNegocio` — as MESMAS funções que a tela do
 * negócio usa. Este projeto já pagou por lógica de mover duplicada (uma cópia
 * tinha fallback de probabilidade e a outra não); aqui o menu só escolhe o
 * destino e delega.
 *
 * AS ETAPAS DE FECHAMENTO SAEM DA LISTA DE MOVER e viram duas ações próprias.
 * Não é estilo: arrastar para "Perdido" grava `ganho = false` mas deixa
 * `motivo_perda` vazio e a probabilidade na da etapa; `fecharNegocio` crava
 * 0/100 e registra o motivo. Oferecer "Perdido" no meio da lista de etapas
 * seria oferecer o caminho pior com o mesmo nome do melhor.
 */
export function MenuDoCard({
  etapas,
  etapaAtualId,
  aoMover,
  aoFechar,
}: {
  /** Todas as etapas do funil deste card, já filtradas por `etapasParaEscolher`. */
  etapas: EtapaPipeline[];
  etapaAtualId: string | null;
  aoMover: (etapaId: string) => void;
  /** `true` = ganho, `false` = perda. Quem abre o diálogo do motivo é o board. */
  aoFechar: (ganho: boolean) => void;
}) {
  const [aberto, definirAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora e no Escape. `pointerdown` e não `click`: o card
  // inteiro é um <Link>, e esperar o `click` deixaria o menu aberto por um
  // quadro depois de a navegação começar.
  useEffect(() => {
    if (!aberto) return;
    const aoApontar = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) definirAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        definirAberto(false);
      }
    };
    document.addEventListener("pointerdown", aoApontar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoApontar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  // O card é um <Link> e o menu vive DENTRO dele: sem parar o evento, cada
  // clique no menu navegaria para a página do negócio. `preventDefault` mata a
  // navegação do link; `stopPropagation` impede que o clique suba até ele.
  const conter = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const paraMover = etapas.filter((e) => resultadoDaEtapa(e) === null && e.id !== etapaAtualId);
  const temGanho = etapas.some((e) => resultadoDaEtapa(e) === true);
  const temPerda = etapas.some((e) => resultadoDaEtapa(e) === false);

  // Um menu sem nenhuma entrada é um botão que abre um retângulo vazio.
  if (paraMover.length === 0 && !temGanho && !temPerda) return null;

  return (
    <div className="relative shrink-0" ref={caixa}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Ações do lead"
        title="Ações do lead"
        onClick={(e) => {
          conter(e);
          definirAberto((v) => !v);
        }}
        className="foco rounded-lg p-1 text-tinta-fraca transition-colors duration-150 ease-out hover:bg-recuo hover:text-tinta pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {aberto && (
        /**
         * `right-0` ancora o menu na borda direita do botão, que é a borda
         * direita do card: aberto para a esquerda ele cabe dentro da coluna
         * (288px no celular) em vez de vazar para a coluna vizinha.
         *
         * `z-20` com o menu dentro do card: o card seguinte na coluna vem
         * depois no DOM e cobriria o menu sem isso.
         */
        <div
          role="menu"
          onClick={conter}
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-fio bg-superficie py-1 shadow-cartao"
        >
          {paraMover.length > 0 && (
            <>
              <p className="px-3 py-1.5 text-rotulo font-medium text-tinta-fraca">Mover para</p>
              {paraMover.map((etapa) => (
                <button
                  key={etapa.id}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    conter(e);
                    definirAberto(false);
                    aoMover(etapa.id);
                  }}
                  className="foco flex w-full items-center gap-2 px-3 py-2 text-left text-rotulo text-tinta transition-colors duration-150 ease-out hover:bg-recuo pointer-coarse:min-h-11"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: etapa.cor || "#6366f1" }}
                    aria-hidden
                  />
                  <span className="truncate">{etapa.nome}</span>
                </button>
              ))}
            </>
          )}

          {(temGanho || temPerda) && paraMover.length > 0 && (
            <div className="my-1 border-t border-fio" />
          )}

          {temGanho && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                conter(e);
                definirAberto(false);
                aoFechar(true);
              }}
              className="foco flex w-full items-center gap-2 px-3 py-2 text-left text-rotulo font-medium text-ok transition-colors duration-150 ease-out hover:bg-ok-fraco pointer-coarse:min-h-11"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Marcar como ganho
            </button>
          )}

          {temPerda && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                conter(e);
                definirAberto(false);
                aoFechar(false);
              }}
              className="foco flex w-full items-center gap-2 px-3 py-2 text-left text-rotulo font-medium text-risco transition-colors duration-150 ease-out hover:bg-risco-fraco pointer-coarse:min-h-11"
            >
              <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Marcar como perdido
            </button>
          )}
        </div>
      )}
    </div>
  );
}
