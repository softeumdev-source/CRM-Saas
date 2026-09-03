"use client";

import { useCallback, useId, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, Building2, Mail, Phone, Trophy, XCircle, CheckCircle2, Clock, CalendarClock, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import type { EtapaPipeline, NegocioComRelacoes, Plano, Usuario } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, formatarMoeda, resultadoDaEtapa, type Aba } from "@/lib/types";
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

type PropostaComRelacoes = Record<string, unknown>;
const ABAS: readonly ItemDeAba<Aba>[] = [
  { chave: "geral", rotulo: "Visão Geral" },
  { chave: "cadencia", rotulo: "Cadência" },
  { chave: "proposta", rotulo: "Proposta & Assinatura" },
  { chave: "conversa", rotulo: "Conversa" },
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
  /** Vem de `?tab=` — as notificações do sino abrem direto na cadência. */
  abaInicial?: Aba;
}) {
  const router = useRouter();
  const [negocio, setNegocio] = useState(negocioInicial);
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

  // Entrega do lead ao vendedor. Sai do funil do SDR e entra na etapa de
  // entrada do funil de vendas, com dono definido ali mesmo.
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
        ? `Reunião aceita. Passado de "${negocio.etapa?.nome ?? "—"}" para ${dono.nome}, em "${entrega.etapa.nome}".`
        : `Reunião aceita. Passado de "${negocio.etapa?.nome ?? "—"}" para o pool de "${entrega.etapa.nome}".`,
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
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao pipeline
      </Link>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-5 w-5 text-indigo-600" />
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {negocio.contato?.empresa || negocio.contato?.nome}
              </h1>
              {fechado && (
                <span
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-full ${
                    negocio.ganho
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                  }`}
                >
                  {negocio.ganho ? "Ganho" : "Perdido"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{negocio.titulo}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              {negocio.contato?.email && (
                <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{negocio.contato.email}</span>
              )}
              {negocio.contato?.telefone && (
                <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{negocio.contato.telefone}</span>
              )}
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
                onClick={() => { setDestinatario(''); setEntregando(true); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-xl transition-colors duration-150 ease-out"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" /> Entregar ao vendedor
              </button>
            )}
            {podeFechar.ganho && (
              <button
                onClick={() => { setMotivoPerda(''); setEncerrando(true); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 rounded-xl transition-colors duration-150 ease-out"
              >
                <Trophy className="h-3.5 w-3.5" /> Ganhei
              </button>
            )}
            {podeFechar.perda && (
              <button
                onClick={() => { setMotivoPerda(''); setEncerrando(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 rounded-xl transition-colors duration-150 ease-out"
              >
                <XCircle className="h-3.5 w-3.5" /> {entrega ? "Descartar" : "Perdi"}
              </button>
            )}
          </div>
        </div>

        {/* Termômetro de cadência: o mesmo sinal da bolinha do card */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg ${
              comAtividadeHoje
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${comAtividadeHoje ? "bg-emerald-500" : "bg-amber-500"}`} />
            {comAtividadeHoje
              ? "Atividade registrada hoje"
              : dias === null
                ? "Nenhuma atividade registrada"
                : `${dias} ${dias === 1 ? "dia" : "dias"} sem contato`}
          </span>

          {proxima ? (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg ${
                proximaAtrasada
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                  : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
              }`}
            >
              {proximaAtrasada ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
              {proximaAtrasada ? "Atrasado" : "Próximo passo"}: {formatarDataHora(proxima.data_agendada)} ({descreverPrazo(proxima.data_agendada)})
            </span>
          ) : (
            <button
              onClick={() => setAba("cadencia")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 hover:bg-amber-100"
            >
              <Clock className="h-3 w-3" /> Sem próximo passo — agendar
            </button>
          )}

          {negocio.ultima_atividade_em && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="h-3 w-3" /> Último contato: {formatarDataHora(negocio.ultima_atividade_em)}
            </span>
          )}
        </div>

        {erro && (
          <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2 mt-3">{erro}</p>
        )}

        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Etapa</p>
            <select
              value={negocio.etapa_id || ""}
              onChange={(e) => mudarEtapa(e.target.value)}
              className="w-full mt-1 text-sm font-bold bg-transparent focus:outline-hidden"
            >
              {etapas.map((et) => (
                <option key={et.id} value={et.id}>{et.nome}</option>
              ))}
            </select>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Responsável</p>
            <select
              value={negocio.responsavel_id || ""}
              onChange={(e) => {
                const resp = responsaveis.find((v) => v.id === e.target.value) || null;
                atualizarNegocio({ responsavel_id: e.target.value || null, responsavel: resp });
              }}
              className="w-full mt-1 text-sm font-bold bg-transparent focus:outline-hidden"
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
            <div className="sm:col-span-2 bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3">
              <label
                htmlFor={idRetomada}
                className="text-[10px] font-bold uppercase text-violet-600 dark:text-violet-400"
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
                className="mt-1 w-full max-w-xs px-3 py-2 text-sm font-bold rounded-xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              />
              <p className="mt-1.5 text-[11px] text-violet-700 dark:text-violet-300">
                {negocio.retomar_em
                  ? `O lead volta sozinho para o início do funil em ${formatarDataHora(negocio.retomar_em)}.`
                  : "Sem data, este lead fica parado aqui para sempre — ninguém vai ser lembrado dele."}
              </p>
            </div>
          )}

          {(negocio.valor ?? 0) > 0 && (
            <div className="sm:col-span-2 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase text-indigo-500">Valor da proposta</p>
              <p className="mt-1 text-sm font-extrabold text-indigo-600">
                {formatarMoeda(negocio.valor)}<span className="text-xs font-semibold text-slate-500">/mês</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <Abas
        abas={ABAS.map((t) =>
          t.chave === "cadencia"
            ? { ...t, alerta: proximaAtrasada }
            : t.chave === "conversa" && (negocio.respostas_nao_lidas ?? 0) > 0
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
          aoResponderComparecimento={devolucao ? responderComparecimento : undefined}
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
      {aba === "conversa" && <MensagensTab negocio={negocio} usuarioAtual={usuarioAtual} />}

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
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong className="font-bold text-slate-900 dark:text-slate-100">
                {negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo}
              </strong>{" "}
              sai da prospecção e entra em <strong>{entrega.funil.nome}</strong>, na etapa{" "}
              <strong>{entrega.etapa.nome}</strong>. O histórico e a cadência vão junto.
            </p>
            <Campo rotulo="Quem assume">
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
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <strong className="font-bold text-slate-900 dark:text-slate-100">
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
    </div>
  );
}
