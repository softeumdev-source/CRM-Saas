"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Alerta, Botao } from "@/components/ui";
import { comPrazo } from "@/lib/prazo";
import { mensagemDeFalha } from "@/lib/erros";
import type { RespostaDeSugestoes } from "@/app/api/agenda/sugestoes/route";

/**
 * "Sugerir horários" — o botão que lê a sua agenda e escreve as três opções.
 *
 * ELE NÃO ENVIA NADA. Escreve no rascunho e para. Quem manda continua sendo a
 * pessoa, com o texto na frente: o horário sugerido é um compromisso que a
 * empresa está assumindo com o cliente, e um botão que dispara isso direto
 * transformaria um clique errado numa reunião marcada.
 *
 * O texto é ANEXADO ao que já está escrito, nunca substituindo. Apagar o
 * rascunho de alguém para caber uma sugestão é o tipo de coisa que faz a pessoa
 * nunca mais clicar no botão.
 */
export function BotaoSugerirHorarios({
  aoSugerir,
  desabilitado,
}: {
  aoSugerir: (texto: string) => void;
  desabilitado?: boolean;
}) {
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = async () => {
    setBuscando(true);
    setErro(null);
    try {
      const resp = await comPrazo(fetch("/api/agenda/sugestoes"), 20_000);
      const dados = (await resp.json()) as RespostaDeSugestoes;
      if (!dados.ok) {
        setErro(
          dados.precisaConectar
            ? `${dados.motivo} Conecte a agenda em Admin → Integrações.`
            : dados.motivo,
        );
        return;
      }
      aoSugerir(dados.texto);
    } catch (e) {
      // `e.message` cru punha "Failed to fetch" — a frase do NAVEGADOR, em
      // ingles — dentro de um alerta em portugues. `mensagemDeFalha` troca a
      // falha de rede pela nossa frase e preserva a mensagem quando ela e
      // nossa, que e o caso do `PrazoEsgotado` do `comPrazo`: aquela ja diz
      // quanto tempo esperou, e apaga-la seria perder informacao.
      setErro(mensagemDeFalha(e, "Não foi possível ler a agenda."));
    } finally {
      setBuscando(false);
    }
  };

  return (
    <>
      <Botao
        variante="secundario"
        tamanho="sm"
        icone={CalendarClock}
        disabled={desabilitado || buscando}
        carregando={buscando}
        onClick={() => void buscar()}
        title="Lê a sua agenda do Google e escreve 3 horários livres no rascunho"
      >
        Sugerir horários
      </Botao>

      {/* O motivo fica NA TELA. "Não deu" sem dizer o quê manda a pessoa clicar
          de novo esperando outro resultado — e o motivo aqui é quase sempre
          acionável: agenda desconectada, ou expediente lotado. */}
      {/* `basis-full` porque os dois compositores põem este botão numa linha de
          `flex flex-wrap`: sem isso o aviso viraria mais um item ao lado dos
          botões, espremido em duas palavras por linha. Com ele o aviso quebra
          para a linha de baixo e ocupa a largura toda — nos dois lugares. */}
      {erro && (
        <div className="basis-full">
          <Alerta tom="alerta" titulo="Não deu para sugerir horários">
            {erro}
          </Alerta>
        </div>
      )}
    </>
  );
}
