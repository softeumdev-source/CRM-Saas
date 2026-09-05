"use client";

import { useCallback, useId, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, Building2, CalendarPlus, Mail, MessageCircle, Phone, RotateCcw, Trophy, XCircle, CheckCircle2, Clock, CalendarClock, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import type { EtapaPipeline, NegocioComRelacoes, Plano, PropostaComRelacoes, Usuario } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, formatarMoeda, resultadoDaEtapa, type Aba } from "@/lib/types";
import { linkDeEmail, linkDeTelefone, linkDoWhatsapp } from "@/lib/contato";
import {
  descreverPrazo,
  diasSemContato,
  estaAtrasada,
  formatarDataHora,
  proximaAtividade,
  temAtividadeHoje,
  type AtividadeComUsuario,
} from "@/lib/atividades";
import { VisaoGeralTab } from "@/components/negocio/VisaoGeralTab";
import { CadenciaTab } from "@/components/negocio/CadenciaTab";
import { PropostaTab } from "@/components/negocio/PropostaTab";
import { MensagensTab } from "@/components/negocio/MensagensTab";
import { useRespostasLidas } from "@/components/negocio/useRespostasLidas";
import { EmailTab } from "@/components/negocio/EmailTab";
import { RegistroDeResposta } from "@/components/negocio/RegistroDeResposta";
import { fecharNegocio, moverEtapa, transferirDeFunil } from "@/lib/negocios";
import type { Pipeline } from "@/lib/pipelines";
import {
  Abas,
  AreaTexto,
  Botao,
  Campo,
  Modal,
  Selecao,
  useAbaNaUrl,
  useIdDeAbas,
  type Aba as ItemDeAba,
} from "@/components/ui";
import { MoverDeFunil } from "@/components/negocio/MoverDeFunil";
import { AgendarReuniao } from "@/components/agenda/AgendarReuniao";

const ABAS: readonly ItemDeAba<Aba>[] = [
  { chave: "geral", rotulo: "Visão Geral" },
  // "Atividades", e não mais "Cadência": esta aba é a agenda do lead — próximo
  // passo, histórico, o no-show. A CADÊNCIA (inscrever, aprovar, mandar) ficava
  // empilhada aqui embaixo dela, e ativar exigia rolar a página inteira. Saiu.
  { chave: "cadencia", rotulo: "Atividades" },
  { chave: "proposta", rotulo: "Proposta & Assinatura" },
  { chave: "email", rotulo: "E-mail" },
  // Era "WhatsApp", uma aba de canal, de quando o envio saía pela API da Meta.
  // Sem a API o WhatsApp deixou de ser um canal com vida própria: ele é um
  // TOQUE da sequência, que a pessoa manda pelo Web. Então o lugar dele é
  // dentro dela — e o botão de ativar a cadência ganha o topo da aba, que é o
  // que faltava.
  { chave: "sequencia", rotulo: "Cadência" },
];

/** Para onde este negócio pode ser entregue (SDR → vendedor). */
type Entrega = { funil: Pipeline; etapa: EtapaPipeline; responsaveis: Usuario[] };
/** De onde ele veio — para onde um no-show volta (vendedor → SDR). */
type Devolucao = { funil: Pipeline; etapa: EtapaPipeline };

export function NegocioDetailClient({
  negocioInicial,
  pipeline,
  etapas,
  entrega,
  devolucao,
  responsaveis,
  planos,
  atividadesIniciais,
  propostasIniciais,
  usuarioAtual,
  vendedor,
  abaInicial = "geral",
}: {
  negocioInicial: NegocioComRelacoes;
  pipeline: Pipeline | null;
  etapas: EtapaPipeline[];
  entrega: Entrega | null;
  devolucao: Devolucao | null;
  responsaveis: Usuario[];
  planos: Plano[];
  atividadesIniciais: AtividadeComUsuario[];
  propostasIniciais: PropostaComRelacoes[];
  usuarioAtual: Usuario;
  /**
   * Quem assina o convite de reunião — o nome da caixa comercial
   * (`tenants.caixa_email_nome`), e não o de quem clicou em agendar. Mesma
   * fonte do `From:` do e-mail: o cliente conhece uma pessoa só.
   */
  vendedor: string;
  /** Vem de `?tab=` — as notificações do sino abrem direto na cadência. */
  abaInicial?: Aba;
}) {
  const router = useRouter();
  const [negocio, setNegocio] = useState(negocioInicial);

  /**
   * ABRIR O NEGÓCIO conta como ler a resposta. Aqui, e não dentro da aba de
   * e-mail.
   *
   * O critério anterior era mais estrito — só a aba de e-mail apagava o sinal —
   * e na prática ele nunca apagava nada: medido na produção, um negócio com
   * duas respostas estava com `respostas_lidas_em` NULO. A pessoa clicava no
   * card, caía na Visão Geral, olhava o lead e voltava; o aviso continuava
   * aceso e ela reportava "eu olhei e continua dizendo que tem mensagem nova".
   * Duas vezes.
   *
   * Quem estava errado era o critério. Abrir o card É o reconhecimento: a
   * resposta está a uma aba de distância, com a contagem no próprio rótulo
   * dela. Um aviso que não some depois de a pessoa fazer a única coisa que
   * podia fazer deixa de ser aviso e vira ruído — e o próximo, que importa,
   * também é ignorado.
   *
   * A trava contra apagar sem ninguém ver continua, e é a certa: a aba do
   * navegador precisa estar VISÍVEL (ver `useRespostasLidas`).
   */
  useRespostasLidas(negocioInicial.id, negocio.respostas_nao_lidas);
  const [atividades, setAtividades] = useState(atividadesIniciais);
  const [propostas, setPropostas] = useState(propostasIniciais);
  // A troca de aba agora vai para a URL: F5 e link compartilhado caem na mesma
  // aba. Antes so `?tab=` da entrada era respeitado, e clicar numa aba nao
  // mudava o endereco.
  const [aba, setAba] = useAbaNaUrl<Aba>(abaInicial);
  const idDasAbas = useIdDeAbas("negocio");
  const [erro, setErro] = useState<string | null>(null);

  const negocioId = negocioInicial.id;
  const idRetomada = useId();

  // Tudo desta tela se mantém vivo: o negócio, a cadência de atividades e as
  // propostas com envelopes/signatários (visualização e assinatura do cliente).
  const recarregar = useCallback(async () => {
    const supabase = createClient();
    const [neg, ativ, props] = await Promise.all([
      supabase.from("negocios").select(SELECT_NEGOCIO_COMPLETO).eq("id", negocioId).single(),
      supabase.from("atividades").select("*, usuario:usuarios(*)").eq("negocio_id", negocioId).order("criado_em", { ascending: false }),
      supabase.from("propostas").select("*, plano:planos(*), envelopes(*, signatarios(*))").eq("negocio_id", negocioId).order("criado_em", { ascending: false }),
    ]);
    if (neg.data) setNegocio(neg.data as unknown as NegocioComRelacoes);
    if (ativ.data) setAtividades(ativ.data as unknown as AtividadeComUsuario[]);
    if (props.data) setPropostas(props.data as PropostaComRelacoes[]);
  }, [negocioId]);

  useSincronizacao(recarregar, {
    canal: `negocio-${negocioId}`,
    tabelas: [
      { tabela: "negocios", filtro: `id=eq.${negocioId}` },
      { tabela: "contatos" },
      { tabela: "atividades", filtro: `negocio_id=eq.${negocioId}` },
      { tabela: "propostas", filtro: `negocio_id=eq.${negocioId}` },
      { tabela: "envelopes" },
      { tabela: "signatarios" },
    ],
  });

  const atualizarNegocio = async (campos: Partial<NegocioComRelacoes>) => {
    setNegocio((prev) => ({ ...prev, ...campos }));
    const supabase = createClient();
    const { etapa, contato, responsavel, atividades_pendentes, ...camposDb } = campos as Record<string, unknown> & {
      etapa?: unknown;
      contato?: unknown;
      responsavel?: unknown;
      atividades_pendentes?: unknown;
    };
    const { error } = await supabase
      .from("negocios")
      .update({ ...camposDb, atualizado_em: new Date().toISOString() })
      .eq("id", negocio.id);
    if (error) setErro(`Não foi possível salvar: ${error.message}`);
  };

  /** Move o negócio de etapa e registra na cadência (mantém o histórico coerente). */
  const mudarEtapa = async (etapaId: string) => {
    const nova = etapas.find((et) => et.id === etapaId);
    if (!nova || etapaId === negocio.etapa_id) return;
    const anterior = negocio.etapa;
    // Otimista; o caminho de escrita e o mesmo do board (lib/negocios).
    setNegocio((prev) => ({
      ...prev,
      etapa_id: etapaId,
      etapa: nova,
      probabilidade: nova.probabilidade ?? prev.probabilidade,
      ganho: resultadoDaEtapa(nova),
    }));
    const r = await moverEtapa({
      negocioId: negocio.id,
      etapa: nova,
      nomeEtapaAnterior: anterior?.nome,
      probabilidadeAtual: negocio.probabilidade,
      usuarioId: usuarioAtual.id,
    });
    if (!r.ok) {
      setErro(`Não foi possível mover o negócio: ${r.erro}`);
      return;
    }
    void recarregar();
  };

  // Era confirm() seguido de window.prompt(): dois dialogos nativos em
  // sequencia, sem como voltar atras no meio e com o motivo da perda digitado
  // numa caixa de sistema. Agora e uma decisao so, dentro do app.
  const [encerrando, setEncerrando] = useState<boolean | null>(null);
  const [motivoPerda, setMotivoPerda] = useState("");

  const encerrarNegocio = async (ganho: boolean, motivo: string | null) => {
    const etapaAlvo = etapas.find((e) => resultadoDaEtapa(e) === ganho);
    if (!etapaAlvo) {
      setErro(`Não encontrei a etapa de ${ganho ? "ganho" : "perda"} no funil.`);
      return;
    }
    const r = await fecharNegocio({
      negocioId: negocio.id,
      etapaAlvo,
      ganho,
      motivo,
      usuarioId: usuarioAtual.id,
    });
    if (!r.ok) {
      setErro(`Não foi possível fechar o negócio: ${r.erro}`);
      return;
    }
    router.push(voltarPara);
    router.refresh();
  };

  // O board de onde este negócio veio — para onde voltar depois de fechar ou
  // de entregar. Um SDR que entrega um lead não pode cair no board do vendedor.
  const voltarPara = pipeline?.chave === "sdr" ? "/sdr" : "/";

  // O outro lado do corredor: para quem este funil entrega, ou de quem ele
  // recebe. Os dois já vêm do servidor, então mover nos dois sentidos não
  // custa consulta nenhuma a mais.
  const outroFunil = entrega?.funil ?? devolucao?.funil ?? null;

  // Ganhei/Perdi só existem em funil que tenha etapa de fechamento. O funil do
  // SDR não tem etapa de ganho de propósito: entregar o lead não é vender.
  const podeFechar = {
    ganho: etapas.some((e) => resultadoDaEtapa(e) === true),
    perda: etapas.some((e) => resultadoDaEtapa(e) === false),
  };

  // Entrega MANUAL, com dono escolhido na hora. O caminho normal é
  // `entregarComReuniao`, disparado pelo agendamento; este continua existindo
  // para quando alguém precisa nomear quem assume, e para retomar uma entrega
  // que ficou pela metade.
  //
  // A descrição não fala mais em "reunião aceita": este caminho não confere
  // reunião nenhuma, e dizer que houve uma era mentira registrada no
  // histórico do negócio.
  const [agendando, setAgendando] = useState(false);
  /** A reunião aberta para correção, ou nada. Ver `aoEditarReuniao`. */
  const [editandoReuniao, setEditandoReuniao] = useState<AtividadeComUsuario | null>(null);
  const [entregando, setEntregando] = useState(false);
  const [destinatario, setDestinatario] = useState("");
  const [entregandoAgora, setEntregandoAgora] = useState(false);

  const entregarAoVendedor = async () => {
    if (!entrega) return;
    setEntregandoAgora(true);
    const dono = entrega.responsaveis.find((v) => v.id === destinatario);
    const r = await transferirDeFunil({
      negocioId: negocio.id,
      etapaDestino: entrega.etapa,
      responsavelId: destinatario || null,
      titulo: `Lead entregue ao funil ${entrega.funil.nome}`,
      descricao: dono
        ? `Entrega manual: passado de "${negocio.etapa?.nome ?? "—"}" para ${dono.nome}, em "${entrega.etapa.nome}".`
        : `Entrega manual: passado de "${negocio.etapa?.nome ?? "—"}" para o pool de "${entrega.etapa.nome}".`,
    });
    setEntregandoAgora(false);
    if (!r.ok) {
      setEntregando(false);
      setErro(`Não foi possível entregar o lead: ${r.erro}`);
      return;
    }
    router.push(voltarPara);
    router.refresh();
  };

  /**
   * A entrega ao vendedor disparada pelo AGENDAMENTO — o "o fluxo do SDR vai
   * até agendar o cliente no card do vendedor".
   *
   * A diferença para `entregarAoVendedor` abaixo não é cosmética: aqui o lead
   * cai no POOL do funil de destino, sem dono, porque quem assume é o próximo
   * vendedor livre; lá alguém escolhe uma pessoa. E aqui a descrição diz a
   * data da reunião porque, pela primeira vez, existe uma reunião de verdade
   * para citar — as duas descrições antigas diziam "Reunião agendada" sem
   * nunca terem conferido nada.
   */
  const entregarComReuniao = async ({
    quando,
    comMeet,
  }: {
    quando: string | null;
    comMeet: boolean;
  }): Promise<string | void> => {
    if (!entrega) return;
    const r = await transferirDeFunil({
      negocioId: negocio.id,
      etapaDestino: entrega.etapa,
      responsavelId: null,
      titulo: `Entregue para ${entrega.funil.nome}`,
      descricao:
        `Reunião agendada para ${formatarDataHora(quando)}${comMeet ? ", com Meet" : ""}. ` +
        `O lead passou de "${negocio.etapa?.nome ?? "—"}" para "${entrega.etapa.nome}" em ` +
        `${entrega.funil.nome}, sem dono, para o próximo vendedor livre assumir.`,
    });
    if (!r.ok) return r.erro;

    // O negócio saiu do funil deste usuário: continuar nesta página daria 404
    // na próxima leitura, porque a RLS já não o alcança.
    router.push(voltarPara);
    router.refresh();
  };

  /**
   * Resposta do vendedor a "o cliente compareceu?".
   *
   * `compareceu = false` não é só um registro: o lead volta para a fila de
   * reagendamento do SDR, sem dono, porque quem reagenda é quem estiver livre.
   * O pool é do funil (RLS), então ele aparece para os SDRs e para mais
   * ninguém.
   */
  const responderComparecimento = async (
    atividadeId: string,
    compareceu: boolean,
  ): Promise<string | void> => {
    const { error } = await createClient()
      .from("atividades")
      .update({ compareceu, concluida: true })
      .eq("id", atividadeId);
    if (error) return error.message;

    if (compareceu || !devolucao) {
      void recarregar();
      return;
    }

    const r = await transferirDeFunil({
      negocioId: negocio.id,
      etapaDestino: devolucao.etapa,
      responsavelId: null,
      titulo: "No-show: devolvido para reagendamento",
      descricao: `O cliente não compareceu à reunião. Voltou para "${devolucao.etapa.nome}" em ${devolucao.funil.nome}, sem dono, para o próximo SDR livre reagendar.`,
    });
    if (!r.ok) return r.erro;

    // O negócio saiu do funil deste usuário: continuar nesta página daria 404
    // na próxima leitura, porque a RLS já não o alcança.
    router.push(voltarPara);
    router.refresh();
  };

  const comAtividadeHoje = temAtividadeHoje(negocio);
  const dias = diasSemContato(negocio);
  const proxima = proximaAtividade(negocio.atividades_pendentes);
  const proximaAtrasada = estaAtrasada(proxima?.data_agendada);
  const fechado = negocio.ganho !== null && negocio.ganho !== undefined;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
      {/* `voltarPara`, e nao "/". Este link estava fixo no board do vendedor
          enquanto as CINCO outras saidas desta tela (fechar, entregar, no-show,
          mover de funil) ja usavam `voltarPara` — calculado tres linhas acima.
          Um SDR abria um lead de prospeccao, clicava aqui e caia no board de
          Vendas, que a RLS mostra vazio para ele: parecia que os leads tinham
          sumido. */}
      <Link
        href={voltarPara}
        className="inline-flex items-center gap-1.5 text-rotulo font-medium text-tinta-suave hover:text-acento"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao pipeline
      </Link>

      <div className="bg-superficie rounded-2xl border border-fio shadow-xs p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-5 w-5 text-acento" />
              <h1 className="text-titulo font-medium text-tinta">
                {negocio.contato?.empresa || negocio.contato?.nome}
              </h1>
              {fechado && (
                <span
                  className={`px-2.5 py-1 text-rotulo font-medium rounded-full ${
                    negocio.ganho
                      ? "bg-ok-fraco text-ok"
                      : "bg-risco-fraco text-risco"
                  }`}
                >
                  {negocio.ganho ? "Ganho" : "Perdido"}
                </span>
              )}
              {/* Este lead NAO e frio: um vendedor ja falou com essa pessoa e a
                  parqueou para depois. Sem este selo, quem pega o card no board
                  do SDR abre uma cadencia de primeiro contato com alguem que ja
                  conhece a empresa — e o cliente percebe.

                  So aparece enquanto o lead esta em reaquecimento (ou seja, no
                  funil de prospeccao). Depois de entregue, a informacao vira
                  historico e sai da frente. */}
              {negocio.vendedor_origem_id && entrega && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-info-fraco px-2.5 py-1 text-rotulo font-medium text-info"
                  title="Voltou da nutricao para o SDR reaquecer. Ja teve contato com um vendedor."
                >
                  <RotateCcw className="h-3 w-3" aria-hidden /> Em reaquecimento
                </span>
              )}
            </div>
            <p className="text-rotulo text-tinta-suave mt-1">{negocio.titulo}</p>
            {/* Os dados do contato deixam de ser texto e viram AÇÃO. Antes
                eram três spans: para falar com o cliente era preciso
                selecionar, copiar e trocar de aplicativo.

                O número do WhatsApp é normalizado (`lib/contato.ts`): o cadastro
                guarda "(11) 99999-8888" e o `wa.me` exige dígitos com código do
                país. Quando não dá para ter certeza — número sem DDD, por
                exemplo — o botão SOME em vez de abrir conversa com o número de
                outra pessoa. */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <ContatoAcao
                href={linkDoWhatsapp(negocio.contato?.whatsapp || negocio.contato?.telefone)}
                icone={MessageCircle}
                rotulo={negocio.contato?.whatsapp || negocio.contato?.telefone || ""}
                titulo="Abrir conversa no WhatsApp"
                externo
              />
              <ContatoAcao
                href={linkDeEmail(negocio.contato?.email)}
                icone={Mail}
                rotulo={negocio.contato?.email || ""}
                titulo="Escrever para este e-mail"
              />
              {/* Só quando o telefone é DIFERENTE do WhatsApp: repetir o mesmo
                  número em dois chips é ruído, não opção. */}
              {negocio.contato?.telefone &&
                negocio.contato.telefone !== negocio.contato?.whatsapp && (
                  <ContatoAcao
                    href={linkDeTelefone(negocio.contato.telefone)}
                    icone={Phone}
                    rotulo={negocio.contato.telefone}
                    titulo="Ligar"
                  />
                )}
              {/* A terceira forma de alcançar o cliente, ao lado das outras
                  duas. Antes, marcar uma reunião custava seis passos dentro da
                  aba Cadência — registrar uma atividade, marcar "agendar
                  próximo", escolher tipo e data, salvar, achar a linha na lista
                  e só então pedir o convite. Ninguém agenda assim, e era por
                  isso que o Google Agenda parecia não existir aqui.

                  Este é um BOTÃO no meio de links: agendar muda o estado do
                  mundo (cria evento e manda e-mail ao cliente), enquanto os
                  outros três só abrem um aplicativo. */}
              <button
                type="button"
                onClick={() => setAgendando(true)}
                title="Agendar reunião com Meet e convite"
                className="foco inline-flex max-w-full items-center gap-1.5 rounded-lg border border-fio bg-recuo px-2.5 py-1.5 text-rotulo text-tinta transition-colors duration-150 ease-out hover:border-fio-forte hover:text-acento pointer-coarse:min-h-11"
              >
                <CalendarPlus className="h-3.5 w-3.5 shrink-0 text-tinta-suave" aria-hidden />
                <span className="truncate">Agendar reunião</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mover de funil nos DOIS sentidos, sempre disponível. O botão
                "Entregar ao vendedor" abaixo continua existindo porque ele faz
                outra coisa: escolhe UMA pessoa para assumir. Este aqui é a
                saída geral — inclusive a volta de Vendas para prospecção, que
                antes só acontecia como resposta a "não compareceu". */}
            {outroFunil && (
              <MoverDeFunil
                negocio={negocio}
                outroFunil={outroFunil}
                aoMover={() => {
                  router.push(voltarPara);
                  router.refresh();
                }}
              />
            )}
            {/* O SDR não fecha venda: o que ele faz com um lead pronto é
                entregar. Por isso a ação principal do funil de prospecção é
                esta, e "Ganhei" nem chega a existir lá. */}
            {entrega && (
              <button
                onClick={() => {
                  // Pre-seleciona quem era o dono ANTES de o lead ir para o
                  // SDR. Dois caminhos gravam `vendedor_origem_id`: o lead que
                  // voltou da nutricao, e o lead mandado para a prospeccao a
                  // partir da carteira de um vendedor. Nos dois, devolver ao
                  // rodizio jogaria fora o relacionamento ja construido.
                  //
                  // So se ele ainda estiver entre os que podem receber: um
                  // vendedor desativado nao pode ser pre-selecionado, ou a
                  // entrega falharia com o campo parecendo preenchido.
                  const origem = negocio.vendedor_origem_id;
                  setDestinatario(
                    origem && entrega?.responsaveis.some((v) => v.id === origem) ? origem : '',
                  );
                  setEntregando(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-rotulo font-medium text-acento bg-acento-fraco hover:bg-acento-fraco rounded-xl transition-colors duration-150 ease-out"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" /> Entregar ao vendedor
              </button>
            )}
            {podeFechar.ganho && (
              <button
                onClick={() => { setMotivoPerda(''); setEncerrando(true); }}
                className="flex items-center gap-1.5 px-3 py-2 text-rotulo font-medium text-ok bg-ok-fraco hover:bg-ok-fraco rounded-xl transition-colors duration-150 ease-out"
              >
                <Trophy className="h-3.5 w-3.5" /> Ganhei
              </button>
            )}
            {podeFechar.perda && (
              <button
                onClick={() => { setMotivoPerda(''); setEncerrando(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-rotulo font-medium text-risco bg-risco-fraco hover:bg-risco-fraco rounded-xl transition-colors duration-150 ease-out"
              >
                <XCircle className="h-3.5 w-3.5" /> {entrega ? "Descartar" : "Perdi"}
              </button>
            )}
          </div>
        </div>

        {/* Termômetro de cadência: o mesmo sinal da bolinha do card */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-rotulo font-medium rounded-lg ${
              comAtividadeHoje
                ? "bg-ok-fraco text-ok"
                : "bg-alerta-fraco text-alerta"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${comAtividadeHoje ? "bg-ok" : "bg-alerta"}`} />
            {comAtividadeHoje
              ? "Atividade registrada hoje"
              : dias === null
                ? "Nenhuma atividade registrada"
                : `${dias} ${dias === 1 ? "dia" : "dias"} sem contato`}
          </span>

          {proxima ? (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-rotulo font-medium rounded-lg ${
                proximaAtrasada
                  ? "bg-risco-fraco text-risco"
                  : "bg-acento-fraco text-acento"
              }`}
            >
              {proximaAtrasada ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
              {proximaAtrasada ? "Atrasado" : "Próximo passo"}: {formatarDataHora(proxima.data_agendada)} ({descreverPrazo(proxima.data_agendada)})
            </span>
          ) : (
            <button
              onClick={() => setAba("cadencia")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-rotulo font-medium rounded-lg bg-alerta-fraco text-alerta hover:bg-alerta-fraco"
            >
              <Clock className="h-3 w-3" /> Sem próximo passo — agendar
            </button>
          )}

          {negocio.ultima_atividade_em && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-rotulo font-medium rounded-lg bg-recuo text-tinta-suave">
              <CheckCircle2 className="h-3 w-3" /> Último contato: {formatarDataHora(negocio.ultima_atividade_em)}
            </span>
          )}
        </div>

        {erro && (
          <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2 mt-3">{erro}</p>
        )}

        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <div className="bg-recuo rounded-xl p-3">
            <p className="text-rotulo font-medium uppercase text-tinta-fraca">Etapa</p>
            <select
              value={negocio.etapa_id || ""}
              onChange={(e) => mudarEtapa(e.target.value)}
              className="w-full mt-1 text-corpo font-medium bg-transparent focus:outline-hidden"
            >
              {etapas.map((et) => (
                <option key={et.id} value={et.id}>{et.nome}</option>
              ))}
            </select>
          </div>
          <div className="bg-recuo rounded-xl p-3">
            <p className="text-rotulo font-medium uppercase text-tinta-fraca">Responsável</p>
            <select
              value={negocio.responsavel_id || ""}
              onChange={(e) => {
                const resp = responsaveis.find((v) => v.id === e.target.value) || null;
                atualizarNegocio({ responsavel_id: e.target.value || null, responsavel: resp });
              }}
              className="w-full mt-1 text-corpo font-medium bg-transparent focus:outline-hidden"
            >
              <option value="">Sem dono (pool)</option>
              {responsaveis.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>
          {/* Etapa de nutrição: o lead está parado esperando uma data. Sem a
              data ele fica parado para sempre — é por isso que o campo avisa
              quando está vazio, em vez de só existir. */}
          {negocio.etapa?.funcao === "nutricao" && (
            <div className="sm:col-span-2 bg-info-fraco rounded-xl p-3">
              <label
                htmlFor={idRetomada}
                className="text-rotulo font-medium uppercase text-info"
              >
                Voltar a procurar em
              </label>
              <input
                id={idRetomada}
                type="date"
                value={negocio.retomar_em ? negocio.retomar_em.slice(0, 10) : ""}
                onChange={(e) =>
                  atualizarNegocio({
                    retomar_em: e.target.value ? new Date(`${e.target.value}T09:00`).toISOString() : null,
                  })
                }
                className="mt-1 w-full max-w-xs px-3 py-2 text-corpo font-medium rounded-xl bg-superficie border border-info/40 focus-visible:outline-2 focus-visible:outline-offset-2 "
              />
              <p className="mt-1.5 text-rotulo text-info">
                {negocio.retomar_em
                  ? `O lead volta sozinho para o início do funil em ${formatarDataHora(negocio.retomar_em)}.`
                  : "Sem data, este lead fica parado aqui para sempre — ninguém vai ser lembrado dele."}
              </p>
            </div>
          )}

          {(negocio.valor ?? 0) > 0 && (
            <div className="sm:col-span-2 bg-acento-fraco rounded-xl p-3">
              <p className="text-rotulo font-medium uppercase text-acento">Valor da proposta</p>
              <p className="mt-1 text-corpo font-medium text-acento">
                {formatarMoeda(negocio.valor)}<span className="text-rotulo font-medium text-tinta-suave">/mês</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <Abas
        abas={ABAS.map((t) =>
          t.chave === "cadencia"
            ? { ...t, alerta: proximaAtrasada }
            : t.chave === "email" && (negocio.respostas_nao_lidas ?? 0) > 0
              ? { ...t, contagem: negocio.respostas_nao_lidas ?? 0 }
              : t,
        )}
        valor={aba}
        aoTrocar={setAba}
        idBase={idDasAbas}
      />

      {aba === "geral" && (
        <VisaoGeralTab
          negocio={negocio}
          onAtualizarContato={(campos) => setNegocio((prev) => ({ ...prev, contato: { ...prev.contato!, ...campos } }))}
        />
      )}
      {aba === "cadencia" && (
        <CadenciaTab
          aoEditarReuniao={setEditandoReuniao}
          aoResponderComparecimento={devolucao ? responderComparecimento : undefined}
          aoEntregarComReuniao={entrega ? entregarComReuniao : undefined}
          negocio={negocio}
          atividadesIniciais={atividades}
          usuarioAtual={usuarioAtual}
          onRegistrouAtividade={() => {
            setNegocio((prev) => ({ ...prev, ultima_atividade_em: new Date().toISOString() }));
            void recarregar();
          }}
        />
      )}
      {aba === "proposta" && (
        <PropostaTab negocio={negocio} planos={planos} propostasIniciais={propostas} usuarioAtual={usuarioAtual} />
      )}
      {aba === "email" && <EmailTab negocio={negocio} />}

      {/* A CADÊNCIA, com o ativar em primeiro lugar.
          `MensagensTab` em cima porque é ela que responde "e agora?": inscrever
          o lead, ver o plano com as datas, aprovar o e-mail da vez e mandar o
          toque de WhatsApp.

          Embaixo, só o registro da resposta. O fluxo de bolhas saiu junto com a
          aba de WhatsApp: sem a API da Meta ele era um histórico quase sempre
          vazio. O que sobrou é a única parte que MUDA alguma coisa — registrar
          a resposta para a cadência e acende o selo no Kanban —, e ela fica
          aqui, colada na fila de aprovação, porque separá-las era pedir para
          alguém aprovar o toque 4 de quem respondeu na tela do lado. */}
      {aba === "sequencia" && (
        <div className="space-y-5">
          <MensagensTab negocio={negocio} usuarioAtual={usuarioAtual} />
          <RegistroDeResposta negocio={negocio} />
        </div>
      )}

      {entrega && (
        <Modal
          aberto={entregando}
          aoFechar={() => setEntregando(false)}
          titulo="Entregar ao vendedor"
          rodape={
            <>
              <Botao variante="secundario" onClick={() => setEntregando(false)} disabled={entregandoAgora}>
                Cancelar
              </Botao>
              <Botao variante="primario" onClick={() => void entregarAoVendedor()} disabled={entregandoAgora}>
                {entregandoAgora ? "Entregando…" : "Entregar"}
              </Botao>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-corpo text-tinta-suave">
              <strong className="font-medium text-tinta">
                {negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo}
              </strong>{" "}
              sai da prospecção e entra em <strong>{entrega.funil.nome}</strong>, na etapa{" "}
              <strong>{entrega.etapa.nome}</strong>. O histórico e a cadência vão junto.
            </p>
            <Campo
              rotulo="Quem assume"
              dica={
                negocio.vendedor_origem_id && destinatario === negocio.vendedor_origem_id
                  ? "Já vem escolhido: este lead veio da carteira dessa pessoa antes de entrar na prospecção."
                  : undefined
              }
            >
              {(props) => (
                <Selecao {...props} value={destinatario} onChange={(e) => setDestinatario(e.target.value)}>
                  <option value="">Deixar no pool (qualquer vendedor pega)</option>
                  {entrega.responsaveis.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          </div>
        </Modal>
      )}

      <Modal
        aberto={encerrando !== null}
        aoFechar={() => setEncerrando(null)}
        titulo={encerrando ? "Marcar como ganho" : "Marcar como perdido"}
        rodape={
          <>
            <Botao variante="sutil" onClick={() => setEncerrando(null)}>
              Cancelar
            </Botao>
            <Botao
              variante={encerrando ? "primario" : "perigo"}
              onClick={() => {
                const ganho = encerrando === true;
                setEncerrando(null);
                void encerrarNegocio(ganho, ganho ? null : motivoPerda.trim() || null);
              }}
            >
              {encerrando ? "Marcar como ganho" : "Marcar como perdido"}
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-corpo text-tinta-suave">
            <strong className="font-medium text-tinta">
              {negocio.contato?.empresa || negocio.contato?.nome}
            </strong>{" "}
            sai do funil e passa a contar nas métricas de conversão.
          </p>
          {encerrando === false && (
            <Campo rotulo="Motivo da perda" dica="Opcional, mas é o que alimenta a análise do funil.">
              {(p) => (
                <AreaTexto
                  {...p}
                  rows={3}
                  value={motivoPerda}
                  onChange={(e) => setMotivoPerda(e.target.value)}
                  placeholder="Preço acima do orçamento, escolheu concorrente, projeto adiado…"
                />
              )}
            </Campo>
          )}
        </div>
      </Modal>

      {/* A reunião nasce inteira daqui: atividade no CRM e convite com Meet na
          mesma chamada. `recarregar` traz a atividade nova para a aba Cadência
          sem recarregar a página; o aviso só aparece quando o convite falhou e
          a reunião ficou só no CRM — caso em que a própria aba Cadência tem o
          botão de retomada. */}
      {agendando && (
        <AgendarReuniao
          aoFechar={() => setAgendando(false)}
          vendedor={vendedor}
          negocios={[
            {
              id: negocio.id,
              titulo: negocio.titulo,
              contato: negocio.contato
                ? {
                    nome: negocio.contato.nome,
                    empresa: negocio.contato.empresa,
                    email: negocio.contato.email,
                  }
                : null,
            },
          ]}
          aoAgendado={(r) => {
            if (r.aviso) setErro(r.aviso);
            void recarregar();
          }}
        />
      )}

      {/* O MESMO modal, em modo de edição. Montado só quando há reunião aberta,
          pela mesma razão do de cima: cada abertura começa com o estado da
          reunião certa, sem um efeito copiando campo por campo. */}
      {editandoReuniao && (
        <AgendarReuniao
          aoFechar={() => setEditandoReuniao(null)}
          vendedor={vendedor}
          negocios={[
            {
              id: negocio.id,
              titulo: negocio.titulo,
              contato: negocio.contato
                ? {
                    nome: negocio.contato.nome,
                    empresa: negocio.contato.empresa,
                    email: negocio.contato.email,
                  }
                : null,
            },
          ]}
          edicao={{
            atividadeId: editandoReuniao.id,
            titulo: editandoReuniao.titulo,
            descricao: editandoReuniao.descricao ?? "",
            quando: editandoReuniao.data_agendada ?? new Date().toISOString(),
            temConvite: !!editandoReuniao.google_evento_id,
          }}
          aoAgendado={(r) => {
            if (r.aviso) setErro(r.aviso);
            void recarregar();
          }}
        />
      )}
    </div>
  );
}

/**
 * Um dado do contato que se pode clicar.
 *
 * Devolve `null` quando não há link possível — e isso é deliberado: um chip
 * apagado que não faz nada seria pior do que a ausência dele, porque ensina a
 * pessoa a clicar num lugar que não responde.
 */
function ContatoAcao({
  href,
  icone: Icone,
  rotulo,
  titulo,
  externo = false,
}: {
  href: string | null;
  icone: typeof Mail;
  rotulo: string;
  titulo: string;
  externo?: boolean;
}) {
  if (!href || !rotulo) return null;
  return (
    <a
      href={href}
      title={titulo}
      {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="foco inline-flex max-w-full items-center gap-1.5 rounded-lg border border-fio bg-recuo px-2.5 py-1.5 text-rotulo text-tinta transition-colors duration-150 ease-out hover:border-fio-forte hover:text-acento pointer-coarse:min-h-11"
    >
      <Icone className="h-3.5 w-3.5 shrink-0 text-tinta-suave" aria-hidden />
      <span className="truncate">{rotulo}</span>
    </a>
  );
}
