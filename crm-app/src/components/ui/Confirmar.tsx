"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Botao } from "./Botao";

/**
 * Confirmacao de acao destrutiva.
 *
 * Substitui o `confirm()` nativo, que nao da para estilizar, nao diz o que
 * exatamente vai acontecer e — pior — e bloqueante: quando a exclusao falhava,
 * a resposta vinha num `alert()` separado, depois de o primeiro ja ter fechado.
 *
 * Aqui o erro volta para dentro do proprio dialogo e a acao pode ser tentada
 * de novo sem reabrir nada.
 */
export function Confirmar({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar = "Confirmar",
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: React.ReactNode;
  rotuloConfirmar?: string;
  aoFechar: () => void;
  /** Devolve mensagem de erro para mostrar no dialogo, ou nada se deu certo. */
  aoConfirmar: () => Promise<string | void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fechar = () => {
    setErro(null);
    aoFechar();
  };

  const confirmar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const problema = await aoConfirmar();
      if (problema) {
        setErro(problema);
        return;
      }
      fechar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo={titulo}
      rodape={
        <>
          <Botao variante="sutil" onClick={fechar}>
            Cancelar
          </Botao>
          <Botao variante="perigo" carregando={ocupado} onClick={confirmar}>
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-slate-600 dark:text-slate-300">{descricao}</div>
        {erro && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 dark:bg-rose-950/40">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}
