"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Alerta } from "./Superficie";

/**
 * Confirmação de ação destrutiva.
 *
 * Substitui o `confirm()` nativo, que não dá para estilizar, não diz o que
 * exatamente vai acontecer, e — pior — é bloqueante: quando a exclusão falhava,
 * a resposta vinha num `alert()` separado, fora do fluxo.
 *
 * Aqui o erro volta para dentro do próprio diálogo e a ação pode ser tentada
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
  /** Devolve mensagem de erro para mostrar no diálogo, ou nada se deu certo. */
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
          <Button variante="sutil" onClick={fechar}>
            Cancelar
          </Button>
          <Button variante="perigo" carregando={ocupado} onClick={confirmar}>
            {rotuloConfirmar}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-corpo-lg text-tinta-suave">{descricao}</div>
        {erro && <Alerta>{erro}</Alerta>}
      </div>
    </Modal>
  );
}
