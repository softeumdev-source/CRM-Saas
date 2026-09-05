"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Clock,
  Mail,
  MessageCircle,
} from "lucide-react";
import type { NegocioComRelacoes } from "@/lib/types";
import { temPendencia } from "@/lib/board";
import type { ResumoCadencia, ResumoDeAprovacao } from "@/lib/board";
import { formatarMoeda, iniciais } from "@/lib/types";
import { Ponto, Selo } from "@/components/ui";
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

  // Uma resposta nao lida manda no card: e a coisa mais urgente que pode
  // acontecer com um lead, e ganha do atraso e do "trabalhado hoje".
  const borda = respondeu
    ? "border-info hover:border-info"
    : temAlgoPendente
      ? "border-alerta hover:border-alerta"
      : comAtividadeHoje
        ? "border-ok/40 hover:border-ok"
        : proximaAtrasada
          ? "border-risco/40 hover:border-risco"
          : "border-fio hover:border-fio-forte";

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
        "foco group block rounded-2xl border bg-superficie p-3.5 shadow-cartao",
        "transition-[border-color] duration-150 ease-out",
        borda,
      ].join(" ")}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Ponto
              tom={comAtividadeHoje ? "ok" : dias === null || dias >= 7 ? "alerta" : "neutro"}
            />
            <h3 className="line-clamp-1 text-corpo font-medium text-tinta">
              {negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo}
            </h3>
            {proxima && (
              <Bell
                className={`h-3.5 w-3.5 shrink-0 ${proximaAtrasada ? "text-risco" : "text-acento"}`}
                aria-hidden
              />
            )}
          </div>
          {negocio.contato?.nome ? (
            <p className="mt-0.5 line-clamp-1 pl-3.5 text-rotulo text-tinta-suave">
              {negocio.contato.nome}
              {negocio.contato.cargo ? ` · ${negocio.contato.cargo}` : ""}
            </p>
          ) : null}
        </div>

        {/* "baixa" nao aparece: um selo cinza em todo card era parte do ruido
            que deixava o board denso. Alta e media continuam. */}
        {negocio.prioridade === "alta" || negocio.prioridade === "media" ? (
          <Selo tom={negocio.prioridade === "alta" ? "risco" : "alerta"}>
            {negocio.prioridade === "alta" ? "Alta" : "Média"}
          </Selo>
        ) : null}
      </div>

      <div className="space-y-1 pl-3.5">
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

        <p className="flex items-center gap-1 text-rotulo text-tinta-suave">
          <Clock className="h-3 w-3 shrink-0" aria-hidden /> {statusContato}
        </p>

        {proxima && (
          <p
            className={`flex items-center gap-1 text-rotulo ${proximaAtrasada ? "font-medium text-risco" : "text-tinta-suave"}`}
            title={proxima.titulo || undefined}
          >
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
            {proximaAtrasada ? "Atrasado: " : "Próximo: "}
            {formatarDataHora(proxima.data_agendada)} ({descreverPrazo(proxima.data_agendada)})
          </p>
        )}

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
        {variante === "vendas" && !emNutricao && !proxima && !comAtividadeHoje && (
          <p className="flex items-center gap-1 text-rotulo font-medium text-alerta">
            <CircleAlert className="h-3 w-3 shrink-0" aria-hidden /> Sem próximo passo agendado
          </p>
        )}
      </div>

      {/* O bloco do meio e o que separa as duas variantes, e separa pela FORMA
          antes do conteudo: faixa cheia de um lado, trilho de fios do outro.
          E o que faz os dois boards se distinguirem de longe, borrados. */}
      {variante === "vendas" ? (
        <div className="my-3 flex items-center justify-between gap-2 rounded-xl bg-recuo px-3 py-2">
          {/* Sem valor, a faixa NÃO grita "R$ 0,00".
              O elemento mais forte do card era um zero — e zero aqui não é o
              preço, é "ainda não foi precificado". A FAIXA fica, porque é ela
              que distingue o card de vendas do card do SDR quando se olha o
              board borrado; o que muda é o que ela diz. Mesmo raciocínio que já
              tinha tirado o "R$ 0,00" da coluna do SDR.
              E `font-medium`: o tamanho (`text-corpo-lg`) já dá o destaque, e o
              DESIGN.md pede hierarquia por cor e tamanho antes de peso. */}
          {negocio.valor ? (
            <span className="text-corpo-lg font-medium text-tinta tabular">
              {formatarMoeda(negocio.valor)}
            </span>
          ) : (
            <span className="text-rotulo text-tinta-suave">Valor a definir</span>
          )}
          {semCnpj && (
            <Selo tom="alerta" icone={AlertTriangle}>
              Falta CNPJ
            </Selo>
          )}
        </div>
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
        <div className="flex items-center gap-1">
          {/* A probabilidade e copiada da etapa em todo insert e em todo
              movimento, e nunca editada por negocio — ou seja, todos os cards
              de uma coluna mostravam o MESMO numero. No board do SDR ela nao
              diz nada, entao sai. */}
          {variante === "vendas" && (
            <span className="text-rotulo text-tinta-fraca tabular">
              {negocio.probabilidade ?? 0}%
            </span>
          )}
          <ChevronRight
            className="h-4 w-4 text-tinta-fraca transition-transform duration-150 ease-out group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}
