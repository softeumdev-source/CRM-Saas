"use client";

import { useState } from "react";
import { Trophy, XCircle } from "lucide-react";
import clsx from "clsx";
import { Alerta, Button, Field, Modal, Textarea } from "@/components/ui";

/**
 * Encerrar o negócio era `confirm()` seguido de `window.prompt()` — dois
 * diálogos nativos em sequência, sem como voltar atrás no meio e com o motivo
 * da perda digitado numa caixa de sistema.
 *
 * Aqui é uma decisão só, com o resultado escolhido dentro do próprio diálogo,
 * e o motivo da perda como campo de verdade (multi-linha, opcional).
 */
export function EncerrarNegocioModal({
  aberto,
  aoFechar,
  aoConfirmar,
  empresa,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar: (ganho: boolean, motivo: string | null) => Promise<void>;
  empresa: string;
}) {
  const [ganho, setGanho] = useState<boolean | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fechar = () => {
    setGanho(null);
    setMotivo("");
    setErro(null);
    aoFechar();
  };

  const confirmar = async () => {
    if (ganho === null) {
      setErro("Escolha se o negócio foi ganho ou perdido.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await aoConfirmar(ganho, ganho ? null : motivo.trim() || null);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo="Encerrar negócio"
      rodape={
        <>
          <Button variante="sutil" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            variante={ganho === false ? "perigo" : "primario"}
            carregando={salvando}
            disabled={ganho === null}
            onClick={confirmar}
          >
            {ganho === true ? "Marcar como ganho" : ganho === false ? "Marcar como perdido" : "Encerrar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-corpo-lg text-tinta-suave">
          <span className="font-medium text-tinta">{empresa}</span> sai do funil e passa a contar nas
          métricas de conversão.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Escolha
            ativo={ganho === true}
            aoEscolher={() => setGanho(true)}
            icone={Trophy}
            rotulo="Ganho"
            descricao="Fechamos com o cliente"
            tomAtivo="bg-emerald-50 text-emerald-800 outline-emerald-600"
          />
          <Escolha
            ativo={ganho === false}
            aoEscolher={() => setGanho(false)}
            icone={XCircle}
            rotulo="Perdido"
            descricao="Não vamos seguir"
            tomAtivo="bg-rose-50 text-rose-800 outline-rose-600"
          />
        </div>

        {ganho === false && (
          <Field rotulo="Motivo da perda" dica="Opcional, mas é o que alimenta a análise do funil.">
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Preço acima do orçamento, escolheu concorrente, projeto adiado…"
              />
            )}
          </Field>
        )}

        {erro && <Alerta>{erro}</Alerta>}
      </div>
    </Modal>
  );
}

function Escolha({
  ativo,
  aoEscolher,
  icone: Icone,
  rotulo,
  descricao,
  tomAtivo,
}: {
  ativo: boolean;
  aoEscolher: () => void;
  icone: React.ComponentType<{ className?: string }>;
  rotulo: string;
  descricao: string;
  tomAtivo: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoEscolher}
      className={clsx(
        "flex flex-col items-start gap-1 rounded-xl px-4 py-3 text-left",
        "outline-2 -outline-offset-2 transition-[background-color,outline-color] duration-150 ease-out",
        "focus-visible:outline-acento",
        ativo ? tomAtivo : "bg-recuo text-tinta-suave outline-transparent hover:text-tinta",
      )}
    >
      <span className="text-corpo-lg flex items-center gap-2 font-medium">
        <Icone className="h-4 w-4" aria-hidden />
        {rotulo}
      </span>
      <span className="text-corpo opacity-80">{descricao}</span>
    </button>
  );
}
