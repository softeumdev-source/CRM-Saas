"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Mail,
  MessageCircle,
} from "lucide-react";
import type { NegocioComRelacoes } from "@/lib/types";
import { temPendencia } from "@/lib/board";
import type { ResumoCadencia, ResumoDeAprovacao } from "@/lib/board";
import { formatarMoeda, iniciais } from "@/lib/types";
import { Selo } from "@/components/ui";
import {
  descreverPrazo,
  diasSemContato,
  estaAtrasada,
  formatarDataHora,
  proximaAtividade,
  temAtividadeHoje,
} from "@/lib/atividades";

/**
 * O card do board, nas duas variantes.
 *
 * A variante nao e cosmetica: o vendedor e o SDR olham para coisas
 * diferentes. O vendedor precisa de valor, probabilidade e CNPJ; o SDR precisa
 * saber por onde anda a cadencia e quando sai o proximo toque — em prospeccao
 * o valor e quase sempre zero, e um "R$ 0,00" gigante em todo card e ruido.
 *
 * A primeira versao disto nao cumpriu o combinado: a variante so REMOVIA duas
 * coisas (o valor e a probabilidade) e, no lugar do valor, punha um espacador
 * da mesma altura. Os 17 outros elementos eram identicos e a silhueta tambem,
 * entao os dois boards continuavam iguais. A causa era de dado, nao de layout:
 * o andamento da cadencia nao chegava ao board. Agora chega (`cadencia`), e a
 * variante e ADITIVA — faixa cheia de um lado, trilho de fios do outro.
 *
 * E UM componente com um `if`, e nao dois arquivos, porque duas copias
 * divergem: neste projeto ja aconteceu com `moverEtapa` (uma tinha fallback de
 * probabilidade, a outra nao) e com `ItemNav`.
 */

export type VarianteDoCard = "vendas" | "sdr";

export function LeadCard({
  negocio,
  variante = "vendas",
  cadencia,
  aprovacao,
}: {
  negocio: NegocioComRelacoes;
  variante?: VarianteDoCard;
  /** Andamento da cadencia deste negocio. So o board do SDR passa. */
  cadencia?: ResumoCadencia;
  /** O que esta parado esperando um clique. Os dois boards passam. */
  aprovacao?: ResumoDeAprovacao;
}) {
  const comAtividadeHoje = temAtividadeHoje(negocio);
  const dias = diasSemContato(negocio);
  const proxima = proximaAtividade(negocio.atividades_pendentes);
  const proximaAtrasada = estaAtrasada(proxima?.data_agendada);
  const emNutricao = negocio.etapa?.funcao === "nutricao";
  const semCnpj = !negocio.contato?.cnpj;

  const naoLidas = negocio.respostas_nao_lidas ?? 0;
  const respondeu = naoLidas > 0;

  // O que espera uma pessoa AGORA. Dois verbos, e por isso duas contas: o
  // e-mail se aprova, o WhatsApp se manda pelo Web.
  const paraAprovar = aprovacao?.email ?? 0;
  const paraMandar = aprovacao?.whatsapp ?? 0;
  const pendentes = paraAprovar + paraMandar;
  // O MESMO predicado que o filtro "Precisa aprovação" do board usa, e por
  // isso importado em vez de reescrito aqui: um card com a borda âmbar que o
  // filtro não encontra é pior do que não ter filtro nenhum.
  const temAlgoPendente = temPendencia(aprovacao);
  const IconePendente = paraAprovar > 0 ? Mail : MessageCircle;
  const textoPendente =
    paraAprovar > 0 && paraMandar > 0
      ? `${pendentes} mensagens esperando você`
      : paraAprovar > 0
        ? paraAprovar === 1
          ? "1 e-mail para aprovar"
          : `${paraAprovar} e-mails para aprovar`
        : paraMandar === 1
          ? "1 WhatsApp para você mandar"
          : `${paraMandar} WhatsApp para você mandar`;

  /**
   * Para onde o clique leva.
   *
   * O card sempre abria a Visão Geral — inclusive quando o motivo de ele estar
   * chamando atenção era uma resposta por ler ou um e-mail parado esperando
   * aprovação. A pessoa clicava no aviso e caía numa tela que não falava dele,
   * e o aviso continuava aceso porque ler é o que o apaga.
   *
   * Resposta ganha da aprovação: cliente esperando vale mais que fila nossa.
   */
  const destino = respondeu
    ? `/negocios/${negocio.id}?tab=email`
    : temAlgoPendente
      ? `/negocios/${negocio.id}?tab=sequencia`
      : `/negocios/${negocio.id}`;
  const IconeCanal = negocio.ultima_resposta_canal === "whatsapp" ? MessageCircle : Mail;
  const IconeCadencia = cadencia?.canalProximo === "whatsapp" ? MessageCircle : Mail;

  // O denominador do trilho. `Math.max` porque uma cadencia sem passos (0) ou
  // um `passo_atual` que ja passou do ultimo renderizariam "Passo 1 de 0" e um
  // trilho vazio — feio e, pior, mentiroso.
  const totalDePassos = Math.max(cadencia?.totalPassos ?? 0, cadencia?.passoAtual ?? 0, 1);

  const statusContato = comAtividadeHoje
    ? "Atividade registrada hoje"
    : dias === null
      ? "Nenhuma atividade registrada"
      : `${dias} ${dias === 1 ? "dia" : "dias"} sem contato`;

  /** Hoje ou amanhã — quando a HORA do compromisso ainda muda o dia de alguém. */
  const ehIminente = (() => {
    const prazo = proxima ? descreverPrazo(proxima.data_agendada) : "";
    return prazo === "hoje" || prazo === "amanhã";
  })();
  /** Só o relógio de `formatarDataHora`, que devolve "01/09, 16:44". */
  const horaDe = (iso: string | null | undefined) =>
    formatarDataHora(iso).split(", ").pop() ?? "";

  // Uma resposta nao lida manda no card: e a coisa mais urgente que pode
  // acontecer com um lead, e ganha do atraso e do "trabalhado hoje".
  //
  // O CARD DE RESPOSTA TROCA A SUPERFICIE, e nao so a borda. Um fio de 1px
  // colorido em volta de um card de 300px nao se ve de longe: com o board
  // desfocado, os 25 cards liam todos igual, que e a monotonia do craft R4. O
  // unico estado em que alguem esta esperando do outro lado ganha um fundo
  // tingido e passa a ser achavel de relance.
  //
  // Trocar, e nao EMPILHAR: nos outros estados a superficie continua neutra e
  // quem fala e a borda. Fundo tingido + fio forte + sombra no mesmo elemento e
  // o que o craft R10 proibe.
  const borda = respondeu
    ? "border-info bg-info-fraco hover:border-info"
    : temAlgoPendente
      ? "border-alerta bg-superficie hover:border-alerta"
      : comAtividadeHoje
        ? "border-ok/40 bg-superficie hover:border-ok"
        : proximaAtrasada
          ? "border-risco/40 bg-superficie hover:border-risco"
          : "border-fio bg-superficie hover:border-fio-forte";

  return (
    <Link
      href={destino}
      // `prefetch={false}` não é micro-otimização: MEDIDO nos logs de produção,
      // abrir o Kanban disparava 12 requisições a 8 páginas `/negocios/<id>`
      // no MESMO segundo (02:04:27). O Next prefetcha todo `<Link>` que entra
      // no viewport, e cada prefetch RENDERIZA a página inteira do negócio no
      // servidor — com as consultas dela, atravessando até o banco.
      //
      // Num board de 25 cards isso é o trabalho de 25 páginas para abrir uma. A
      // navegação real (o clique) continua rápida: o que se perde é o palpite
      // de que a pessoa vai abrir justamente aquele card.
      prefetch={false}
      className={[
        "foco group block rounded-2xl border p-3.5 shadow-cartao",
        "transition-[border-color] duration-150 ease-out",
        borda,
      ].join(" ")}
    >
      {/* SAÍRAM TRÊS SINAIS DESTA LINHA, e a conta é a razão.
          O card carregava SEIS avisos de estado ao mesmo tempo: a bolinha, o
          sino, o selo de prioridade, a cor da borda e DUAS linhas de tempo.
          Com seis, nenhum manda — é o craft R4 e o Rams #4 (o produto tem que
          se explicar) na mesma imagem.

          - A BOLINHA dizia o mesmo que a cor da borda, 2px ao lado dela.
          - O SINO aparecia em todo card que tem próximo passo, ou seja, em
            quase todos. Sinal que quase nunca varia não é sinal.
          - O SELO "Média" estava em 100% dos cards: medido, os 25 negócios do
            banco têm `prioridade = 'media'`. E em ÂMBAR, que em todo o resto
            do app quer dizer "atenção" — um alarme permanente que treina a
            pessoa a ignorar a cor justo quando ela importar. "Alta" fica,
            porque essa é rara e é notícia de verdade.

          Sobra a borda, que já fazia o trabalho sozinha.

          E o VALOR sobe para cá. Ele estava numa faixa `bg-recuo rounded-xl`
          no meio do card, que no screenshot lê como um CAMPO DE FORMULÁRIO
          desabilitado — e sem valor dizia "Valor a definir" exatamente onde um
          `placeholder` ficaria. O card prometia uma edição que não existe
          (Rams #6, honestidade). Aqui em cima, alinhado à direita do nome, ele
          é o que é: um atributo do negócio. */}
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="line-clamp-1 text-corpo font-medium text-tinta">
          {negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo}
        </h3>
        {variante === "vendas" ? (
          negocio.valor ? (
            <span className="shrink-0 text-corpo font-medium text-tinta tabular">
              {formatarMoeda(negocio.valor)}
            </span>
          ) : (
            <span className="shrink-0 text-rotulo text-tinta-fraca">a definir</span>
          )
        ) : null}
      </div>

      {negocio.contato?.nome ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-rotulo text-tinta-suave">
          <span className="line-clamp-1">
            {negocio.contato.nome}
            {negocio.contato.cargo ? ` · ${negocio.contato.cargo}` : ""}
          </span>
          {negocio.prioridade === "alta" ? (
            <Selo tom="risco">Alta</Selo>
          ) : null}
        </p>
      ) : null}

      <div className="mt-2 space-y-1">
        {/* O sinal de resposta vem PRIMEIRO, acima de tudo. */}
        {respondeu && (
          <p className="flex items-center gap-1 text-rotulo font-medium text-info">
            <IconeCanal className="h-3 w-3 shrink-0" aria-hidden />
            {naoLidas === 1 ? "Respondeu" : `${naoLidas} respostas`}
            {negocio.ultima_resposta_em ? ` · ${formatarDataHora(negocio.ultima_resposta_em)}` : ""}
          </p>
        )}

        {/* Logo abaixo da resposta: é a segunda coisa mais urgente do card, e
            a única que a pessoa resolve com um clique. Ficava invisível daqui —
            só aparecia depois de abrir o negócio e ir até a aba certa. */}
        {temAlgoPendente && (
          <p className="flex items-center gap-1 text-rotulo font-medium text-alerta">
            <IconePendente className="h-3 w-3 shrink-0" aria-hidden />
            {textoPendente}
          </p>
        )}

        {/* UMA linha de tempo, e não duas.
            Eram "18 dias sem contato" e "Atrasado: 01/09, 16:39 (há 4 dias)",
            uma embaixo da outra, as duas sobre tempo, as duas em cor de aviso.
            Agora o PRÓXIMO PASSO é a frase — é o que se resolve com um clique —
            e o tempo sem contato vira o complemento dela, em tinta suave.
            Quem não tem próximo passo continua tendo a linha, dizendo isso. */}
        <p
          className={`flex items-start gap-1 text-rotulo ${
            proximaAtrasada ? "text-risco" : "text-tinta-suave"
          }`}
          title={
            proxima
              ? `${proxima.titulo || "Próximo passo"} — ${formatarDataHora(proxima.data_agendada)}`
              : undefined
          }
        >
          {proximaAtrasada ? (
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <CalendarClock className="mt-px h-3 w-3 shrink-0" aria-hidden />
          )}
          <span className="min-w-0">
            {proxima ? (
              <span className={proximaAtrasada ? "font-medium" : "text-tinta"}>
                {proximaAtrasada ? "Atrasado " : "Próximo "}
                {descreverPrazo(proxima.data_agendada)}
                {/* A HORA só quando ela é acionável: hoje e amanhã, quando a
                    pessoa está montando o dia. Para "em 12 dias" ou "há 4
                    dias" o relógio não muda nada e só empurrava a linha para
                    uma segunda — o que, medido na coluna de 288px, comia toda
                    a altura que a limpeza do card tinha economizado. A data
                    exata continua no `title`. */}
                {ehIminente ? `, ${horaDe(proxima.data_agendada)}` : ""}
              </span>
            ) : (
              <span className="text-tinta-suave">Sem próximo passo</span>
            )}
            {/* O tempo sem contato só entra quando ele MESMO é a notícia: não
                há passo atrasado gritando por cima, e faz uma semana ou mais.
                Antes vinha sempre, inclusive colado a um "Atrasado há 4 dias"
                — dois fatos sobre tempo na mesma linha, dizendo quase o
                mesmo. */}
            {!proximaAtrasada && (dias === null || dias >= 7) ? (
              <span className="text-tinta-fraca"> · {statusContato.toLowerCase()}</span>
            ) : null}
          </span>
        </p>

        {/* Lead parado em nutricao TEM proximo passo: a data em que o sistema o
            devolve. Sem isto ele aparecia como "sem proximo passo", em ambar,
            como se estivesse esquecido — e e o contrario. */}
        {emNutricao && negocio.retomar_em && (
          <p className="flex items-center gap-1 text-rotulo text-tinta-suave">
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden /> Volta em{" "}
            {formatarDataHora(negocio.retomar_em)}
          </p>
        )}
        {emNutricao && !negocio.retomar_em && (
          <p className="flex items-center gap-1 text-rotulo font-medium text-alerta">
            <CircleAlert className="h-3 w-3 shrink-0" aria-hidden /> Em nutrição sem data de retomada
          </p>
        )}
        {/* No board do SDR este aviso nao vale: o bloco logo abaixo ja responde
            a mesma pergunta com mais precisao — ou o trilho da cadencia (o
            proximo passo EXISTE, e o proximo toque) ou "Fora de cadencia".
            Deixar os dois punha dois ambares seguidos dizendo quase o mesmo. */}
        {/* O "Falta CNPJ" morava dentro da faixa cinza do valor. Com a faixa
            fora, ele vem para cá, junto dos outros avisos — que é onde um
            aviso pertence. */}
        {variante === "vendas" && semCnpj && (
          <p className="flex items-center gap-1 text-rotulo font-medium text-alerta">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> Falta CNPJ para a proposta
          </p>
        )}
      </div>

      {/* O bloco do meio e o que separa as duas variantes, e separa pela FORMA
          antes do conteudo: faixa cheia de um lado, trilho de fios do outro.
          E o que faz os dois boards se distinguirem de longe, borrados.

          A faixa recua um degrau da superficie DO CARD — e num card de resposta
          a superficie e o tingido, entao quem recua e o branco. Sem isto, um
          `bg-recuo` cinza ficaria boiando sobre o azul palido. */}
      {variante === "vendas" ? (
        /* A faixa do valor SAIU. Ela existia para distinguir o card de vendas
           do card do SDR com o board desfocado — mas fazia isso desenhando uma
           caixa cinza no meio do card, que lê como campo de formulário. A
           distinção continua existindo e é melhor: o card de vendas tem VALOR
           no canto superior direito, o do SDR tem o trilho da cadência. Forma
           diferente, sem inventar uma moldura para isso. */
        null
      ) : cadencia ? (
        <div className="my-3 space-y-1.5">
          <div
            className="flex items-center gap-1"
            role="img"
            aria-label={`${cadencia.nome}: passo ${cadencia.passoAtual} de ${totalDePassos}`}
          >
            {Array.from({ length: totalDePassos }, (_, i) => {
              const ordem = i + 1;
              return (
                <span
                  key={ordem}
                  className={`h-1 flex-1 rounded-full ${
                    ordem < cadencia.passoAtual
                      ? "bg-acento"
                      : ordem === cadencia.passoAtual
                        ? "bg-acento/45"
                        : "bg-fio-forte"
                  }`}
                />
              );
            })}
          </div>
          <p className="flex items-center gap-1 text-rotulo text-tinta-suave">
            <IconeCadencia className="h-3 w-3 shrink-0" aria-hidden />
            <span className="tabular">
              Passo {cadencia.passoAtual} de {totalDePassos}
            </span>
            {cadencia.status === "pausada"
              ? " · pausada"
              : cadencia.proximoEnvioEm
                ? ` · ${descreverPrazo(cadencia.proximoEnvioEm)}`
                : ""}
          </p>
        </div>
      ) : (
        <div className="my-3 space-y-1.5">
          <div className="border-t border-dashed border-fio-forte" />
          {/* Lead que ninguem esta tocando e o problema numero um de um SDR —
              nao um espaco em branco. */}
          <p className="flex items-center gap-1 text-rotulo font-medium text-alerta">
            <CircleAlert className="h-3 w-3 shrink-0" aria-hidden /> Fora de cadência
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-fio pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-acento-fraco text-rotulo font-medium text-acento"
            aria-hidden
          >
            {negocio.responsavel ? iniciais(negocio.responsavel.nome) : "—"}
          </span>
          <span className="truncate text-rotulo text-tinta-suave">
            {negocio.responsavel?.nome.split(" ")[0] || "Sem dono"}
          </span>
        </div>
        {/* A PROBABILIDADE SAIU DOS DOIS BOARDS.
            O comentário que estava aqui já dizia o motivo — "é copiada da
            etapa em todo insert e em todo movimento, e nunca editada por
            negócio, ou seja, todos os cards de uma coluna mostravam o MESMO
            número" — e mesmo assim ela tinha sido removida só do board do SDR.
            No print do board de vendas os quatro cards da coluna diziam "70%",
            os dois da seguinte "70%": um número diferente por coluna, igual
            dentro dela. Isso é a etapa dita de novo, e a etapa é o nome no topo
            da coluna. */}
        <ChevronRight
          className="h-4 w-4 shrink-0 text-tinta-fraca transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </Link>
  );
}
