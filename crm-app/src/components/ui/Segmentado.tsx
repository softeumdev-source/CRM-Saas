"use client";

/**
 * O controle de segmento do sistema: um trilho recuado com a opção ativa
 * levantada em cima dele.
 *
 * EXISTE PORQUE HAVIA DOIS IDIOMAS PARA O MESMO CONTROLE. Renderizado e
 * comparado lado a lado: o filtro de período do admin desenhava a opção ativa
 * como `Botao variante="primario"` — um botão INDIGO CHEIO — enquanto os
 * filtros do board desenhavam um segmento com trilho. A mesma pergunta ("qual
 * recorte você quer ver?") com duas respostas visuais diferentes na mesma
 * aplicação.
 *
 * O segmento é o certo dos dois, e não por gosto: no `DESIGN.md` o acento
 * sólido significa AÇÃO — algo acontece quando você clica. Um filtro não é
 * ação, é ESTADO: ele diz onde você está. Pintar estado com a cor de ação
 * gasta o acento e faz a tela inteira parecer um formulário de botões.
 *
 * A forma também carrega significado: as opções dividem um trilho, então
 * lê-se que são exclusivas entre si — coisa que quatro botões soltos não
 * dizem.
 */

export type ItemSegmentado<C extends string> = {
  chave: C;
  rotulo: string;
  /** Número ao lado do rótulo. Passe `undefined` para não mostrar nada. */
  contador?: number;
  /** Tom do contador. `alerta` para fila nossa, `info` para cliente esperando. */
  tomDoContador?: "info" | "alerta";
};

const TOM: Record<"info" | "alerta", string> = {
  info: "bg-info-fraco text-info",
  alerta: "bg-alerta-fraco text-alerta",
};

export function Segmentado<C extends string>({
  itens,
  valor,
  aoTrocar,
  rotulo,
  className = "",
}: {
  itens: readonly ItemSegmentado<C>[];
  valor: C;
  aoTrocar: (chave: C) => void;
  /** Nome do grupo para quem usa leitor de tela. */
  rotulo: string;
  className?: string;
}) {
  return (
    // `overflow-x-auto` + `min-w-0`: com cinco ou seis opções esta fileira
    // media 575px num viewport de 390 e empurrava a PAGINA para o lado. Rolar
    // dentro do proprio controle preserva a forma de segmento unico — quebrar
    // em duas linhas empilharia tres fileiras em cima do conteudo no celular.
    <div
      role="group"
      aria-label={rotulo}
      className={`flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-recuo p-1 ${className}`}
    >
      {itens.map((item) => {
        const ativo = item.chave === valor;
        return (
          <button
            key={item.chave}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoTrocar(item.chave)}
            className={[
              "foco flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5",
              "text-rotulo font-semibold transition-[background-color,color] duration-150 ease-out",
              "pointer-coarse:min-h-11",
              ativo ? "bg-superficie text-acento shadow-cartao" : "text-tinta-suave hover:text-tinta",
            ].join(" ")}
          >
            {item.rotulo}
            {/* O contador só aparece quando há algo. Um "(0)" permanente é
                ruído, e o zero é justamente o estado em que não há o que
                fazer. */}
            {item.contador ? (
              <span
                className={`rounded-full px-1.5 text-rotulo font-medium tabular ${
                  TOM[item.tomDoContador ?? "info"]
                }`}
              >
                {item.contador}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
