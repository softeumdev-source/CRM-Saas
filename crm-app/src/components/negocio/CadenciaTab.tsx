"use client";

import { useMemo, useState } from "react";
import {
  PhoneCall,
  Mail,
  Video,
  FileText,
  MessageSquare,
  Users,
  CheckCircle2,
  Bell,
  Plus,
  Clock,
  ArrowLeftRight,
  BadgeCheck,
  AlertTriangle,
  CalendarClock,
  Loader2,
  Search,
  Trash2,
  RotateCcw,
  CalendarPlus,
  CalendarCheck,
} from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { Confirmar } from "@/components/ui";
import { comPrazo } from "@/lib/prazo";
import { createClient } from "@/lib/supabase/client";
import type { NegocioComRelacoes, TipoAtividade, Usuario } from "@/lib/types";
import type { TablesInsert } from "@/lib/supabase/types";
import { TIPOS_ATIVIDADE } from "@/lib/types";
import {
  PRESETS_AGENDAMENTO,
  ROTULOS_ATIVIDADE,
  resumirTexto,
  dataDoPreset,
  descreverPrazo,
  estaAtrasada,
  formatarDataHora,
  paraInputDataHora,
  type AtividadeComUsuario,
} from "@/lib/atividades";

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  ligacao: PhoneCall,
  email: Mail,
  demo: Video,
  proposta: FileText,
  nota: MessageSquare,
  whatsapp: MessageSquare,
  reuniao: Users,
  mudanca_etapa: ArrowLeftRight,
};

const TIPOS_REGISTRAVEIS = TIPOS_ATIVIDADE.filter((t) => t !== "mudanca_etapa");

export function CadenciaTab({
  negocio,
  atividadesIniciais,
  usuarioAtual,
  onRegistrouAtividade,
  aoResponderComparecimento,
}: {
  /**
   * Só existe quando há um funil para onde devolver o no-show. Sem ele a
   * pergunta "compareceu?" não aparece: não adianta perguntar se não há fila
   * de reagendamento do outro lado.
   */
  aoResponderComparecimento?: (atividadeId: string, compareceu: boolean) => Promise<string | void>;
  negocio: NegocioComRelacoes;
  atividadesIniciais: AtividadeComUsuario[];
  usuarioAtual: Usuario;
  /** Avisa o pai para pintar a bolinha do card de verde na hora. */
  onRegistrouAtividade?: () => void;
}) {
  // O pai assina o Realtime de atividades e repassa a lista viva por props.
  const [atividades, setAtividades] = useEstadoDaProp(atividadesIniciais);

  const [tipo, setTipo] = useState<TipoAtividade>("ligacao");
  const [descricao, setDescricao] = useState("");
  const [realizadaEm, setRealizadaEm] = useState(() => paraInputDataHora(new Date()));

  const [agendarProximo, setAgendarProximo] = useState(true);
  const [tipoProximo, setTipoProximo] = useState<TipoAtividade>("ligacao");
  const [tituloProximo, setTituloProximo] = useState("");
  const [dataAgendada, setDataAgendada] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tocouTexto, setTocouTexto] = useState(false);
  const [ok, setOk] = useState(false);

  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [reagendando, setReagendando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");

  const empresa = negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo;

  const proximosPassos = useMemo(
    () =>
      atividades
        .filter((a) => !a.concluida && a.data_agendada)
        .sort((a, b) => new Date(a.data_agendada!).getTime() - new Date(b.data_agendada!).getTime()),
    [atividades],
  );

  const historico = useMemo(() => {
    const termo = buscaHistorico.trim().toLowerCase();
    return atividades
      .filter((a) => a.concluida || !a.data_agendada)
      .filter((a) => filtroTipo === "todos" || a.tipo === filtroTipo)
      .filter(
        (a) =>
          !termo ||
          (a.titulo || "").toLowerCase().includes(termo) ||
          (a.descricao || "").toLowerCase().includes(termo),
      );
  }, [atividades, filtroTipo, buscaHistorico]);

  const textoInvalido = descricao.trim().length === 0;
  const proximoInvalido = agendarProximo && !dataAgendada;

  const limparFormulario = () => {
    setDescricao("");
    setRealizadaEm(paraInputDataHora(new Date()));
    setTituloProximo("");
    setDataAgendada("");
    setTocouTexto(false);
  };

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setTocouTexto(true);
    setErro(null);
    if (textoInvalido) return;
    if (proximoInvalido) {
      setErro("Escolha a data do próximo passo ou desmarque o agendamento.");
      return;
    }

    setSalvando(true);
    const supabase = createClient();
    const realizada = realizadaEm ? new Date(realizadaEm) : new Date();

    const registros: TablesInsert<"atividades">[] = [
      {
        negocio_id: negocio.id,
        usuario_id: usuarioAtual.id,
        tipo,
        // O formulário tem só o texto; o título (obrigatório no banco) vem da
        // primeira linha da anotação e serve de resumo na timeline.
        titulo: resumirTexto(descricao, ROTULOS_ATIVIDADE[tipo] || "Atividade"),
        descricao: descricao.trim(),
        concluida: true,
        concluida_em: realizada.toISOString(),
      },
    ];

    if (agendarProximo && dataAgendada) {
      const quando = new Date(dataAgendada).toISOString();
      registros.push({
        negocio_id: negocio.id,
        usuario_id: usuarioAtual.id,
        tipo: tipoProximo,
        titulo: tituloProximo.trim() || `${ROTULOS_ATIVIDADE[tipoProximo]} — ${empresa}`,
        concluida: false,
        data_agendada: quando,
        lembrete_data: quando,
      });
    }

    const { data, error } = await supabase.from("atividades").insert(registros).select("*, usuario:usuarios(*)");
    setSalvando(false);

    if (error) {
      setErro(`Não foi possível registrar: ${error.message}`);
      return;
    }

    if (data) {
      const novas = data as AtividadeComUsuario[];
      setAtividades((prev) => [...novas, ...prev.filter((a) => !novas.some((n) => n.id === a.id))]);
    }
    limparFormulario();
    setOk(true);
    setTimeout(() => setOk(false), 2500);
    onRegistrouAtividade?.();
  };

  const marcarConcluida = async (id: string) => {
    const antes = atividades;
    const agora = new Date().toISOString();
    setAtividades((prev) => prev.map((a) => (a.id === id ? { ...a, concluida: true, concluida_em: agora } : a)));
    const { error } = await createClient().from("atividades").update({ concluida: true }).eq("id", id);
    if (error) {
      setAtividades(antes);
      setErro(`Não foi possível concluir: ${error.message}`);
      return;
    }
    onRegistrouAtividade?.();
  };

  const confirmarAgenda = async (id: string) => {
    const antes = atividades;
    setAtividades((prev) => prev.map((a) => (a.id === id ? { ...a, confirmada: true } : a)));
    const { error } = await createClient().from("atividades").update({ confirmada: true }).eq("id", id);
    if (error) {
      setAtividades(antes);
      setErro(`Não foi possível confirmar: ${error.message}`);
    }
  };

  const reagendar = async (id: string) => {
    if (!novaData) return;
    const quando = new Date(novaData).toISOString();
    const antes = atividades;
    setAtividades((prev) =>
      prev.map((a) => (a.id === id ? { ...a, data_agendada: quando, lembrete_data: quando, lembrete_enviado: false } : a)),
    );
    setReagendando(null);
    setNovaData("");
    const { error } = await createClient()
      .from("atividades")
      .update({ data_agendada: quando, lembrete_data: quando, lembrete_enviado: false })
      .eq("id", id);
    if (error) {
      setAtividades(antes);
      setErro(`Não foi possível reagendar: ${error.message}`);
    }
  };

  const [respondendo, setRespondendo] = useState<string | null>(null);

  const responder = async (id: string, compareceu: boolean) => {
    if (!aoResponderComparecimento) return;
    setRespondendo(id);
    const erroResposta = await aoResponderComparecimento(id, compareceu);
    setRespondendo(null);
    if (erroResposta) {
      setErro(`Não foi possível registrar a resposta: ${erroResposta}`);
      return;
    }
    setAtividades((prev) =>
      prev.map((a) => (a.id === id ? { ...a, compareceu, concluida: true } : a)),
    );
  };

  const [agendandoGoogle, setAgendandoGoogle] = useState<string | null>(null);

  /**
   * Cria o convite de verdade na agenda de quem clicou e manda para o cliente.
   * O botão some depois, porque a atividade passa a ter `google_evento_id` — é
   * o que impede um clique duplo virar dois convites na caixa do cliente.
   */
  const criarConviteGoogle = async (id: string) => {
    setAgendandoGoogle(id);
    try {
      const resp = await comPrazo(
        fetch("/api/google/agendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ atividadeId: id, minutos: 30 }),
        }),
        20_000,
      );
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.error || "Não foi possível criar o convite.");
        return;
      }
      setAtividades((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, google_evento_id: dados.id, google_meet_link: dados.meetLink, google_resposta: "sem_resposta" }
            : a,
        ),
      );
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o convite.");
    } finally {
      setAgendandoGoogle(null);
    }
  };

  const [excluindo, setExcluindo] = useState<AtividadeComUsuario | null>(null);

  const excluirAtividade = async (): Promise<string | void> => {
    if (!excluindo) return;
    const antes = atividades;
    const id = excluindo.id;
    setAtividades((prev) => prev.filter((a) => a.id !== id));
    const { error } = await createClient().from("atividades").delete().eq("id", id);
    if (error) {
      setAtividades(antes);
      return error.message;
    }
  };

  const aplicarPreset = (indice: number) => {
    setDataAgendada(paraInputDataHora(dataDoPreset(PRESETS_AGENDAMENTO[indice])));
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Registro da atividade — ocupa a largura toda, com espaço para digitar */}
      {/* ------------------------------------------------------------------ */}
      <form
        onSubmit={handleRegistrar}
        className="bg-superficie rounded-2xl border border-fio shadow-xs p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-medium text-corpo text-tinta">Registrar atividade</h3>
            <p className="text-rotulo text-tinta-suave">
              Ao salvar, o card fica verde e desce para o fim da coluna do pipeline.
            </p>
          </div>
          {ok && (
            <span className="flex items-center gap-1.5 text-rotulo font-medium text-ok bg-ok-fraco px-3 py-1.5 rounded-lg">
              <CheckCircle2 className="h-4 w-4" /> Atividade registrada
            </span>
          )}
        </div>

        <div>
          <span className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1.5">Tipo de contato</span>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_REGISTRAVEIS.map((t) => {
              const Icon = ICONES[t] || MessageSquare;
              const ativo = tipo === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-rotulo font-medium rounded-xl border transition-colors duration-150 ease-out ${
                    ativo
                      ? "bg-acento-solido text-acento-tinta border-acento shadow-md"
                      : "bg-recuo text-tinta-suave border-fio hover:border-fio-forte"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {ROTULOS_ATIVIDADE[t]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          <div className="space-y-3">
            <div>
              <label htmlFor="cadenciata-1" className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">
                O que aconteceu <span className="text-risco">*</span>
              </label>
              <textarea id="cadenciata-1"
                rows={12}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onBlur={() => setTocouTexto(true)}
                placeholder={
                  "Anote aqui tudo que importa:\n• Com quem falou e qual o cargo\n• Dores e prioridades levantadas\n• Objeções, concorrentes e preço discutido\n• O que ficou combinado e o prazo"
                }
                className={`w-full px-3.5 py-2.5 text-corpo leading-relaxed rounded-xl border bg-recuo resize-y min-h-[240px] outline-hidden focus:ring-1 ${
                  tocouTexto && textoInvalido
                    ? "border-risco focus:border-risco focus:ring-risco"
                    : "border-fio focus:border-acento focus:ring-acento"
                }`}
              />
              {tocouTexto && textoInvalido ? (
                <p className="text-rotulo font-medium text-risco mt-1">Escreva o que aconteceu no contato.</p>
              ) : (
                <p className="text-rotulo text-tinta-fraca mt-1">
                  {descricao.length} caracteres · a primeira linha vira o resumo no histórico
                </p>
              )}
            </div>

            <div>
              <label htmlFor="cadenciata-2" className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">Realizada em</label>
              <input id="cadenciata-2"
                type="datetime-local"
                value={realizadaEm}
                onChange={(e) => setRealizadaEm(e.target.value)}
                className="w-full px-3.5 py-2.5 text-corpo rounded-xl border border-fio bg-recuo"
              />
            </div>
          </div>

          {/* Agendamento do próximo passo */}
          <div
            className={`rounded-2xl border p-4 space-y-3 h-fit ${
              agendarProximo
                ? "border-fio bg-acento-fraco/60"
                : "border-fio bg-recuo"
            }`}
          >
            <label htmlFor="cadenciata-3" className="flex items-start gap-2 cursor-pointer">
              <input id="cadenciata-3"
                type="checkbox"
                checked={agendarProximo}
                onChange={(e) => setAgendarProximo(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-indigo-600"
              />
              <span>
                <span className="text-rotulo font-medium text-tinta flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-acento" /> Agendar próximo passo
                </span>
                <span className="block text-rotulo text-tinta-suave mt-0.5">
                  Nunca deixe o negócio sem próxima ação. Você recebe o alerta pelo sino na data.
                </span>
              </span>
            </label>

            {agendarProximo && (
              <>
                <div>
                  <span className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">Quando</span>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PRESETS_AGENDAMENTO.map((p, i) => (
                      <button
                        key={p.rotulo}
                        type="button"
                        onClick={() => aplicarPreset(i)}
                        className="px-2.5 py-1 text-rotulo font-medium text-acento bg-superficie border border-fio rounded-lg hover:bg-acento-fraco"
                      >
                        {p.rotulo}
                      </button>
                    ))}
                  </div>
                  <input
                    type="datetime-local"
                    value={dataAgendada}
                    onChange={(e) => setDataAgendada(e.target.value)}
                    className="w-full px-3 py-2 text-corpo rounded-xl border border-fio bg-superficie"
                  />
                  {dataAgendada && (
                    <p className="text-rotulo font-medium text-acento mt-1">
                      {descreverPrazo(new Date(dataAgendada).toISOString())} · {formatarDataHora(new Date(dataAgendada).toISOString())}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="cadenciata-4" className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">Tipo do próximo passo</label>
                  <select id="cadenciata-4"
                    value={tipoProximo}
                    onChange={(e) => setTipoProximo(e.target.value as TipoAtividade)}
                    className="w-full px-3 py-2 text-corpo font-medium rounded-xl border border-fio bg-superficie"
                  >
                    {TIPOS_REGISTRAVEIS.map((t) => (
                      <option key={t} value={t}>{ROTULOS_ATIVIDADE[t]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cadenciata-5" className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">
                    Descrição do próximo passo <span className="font-medium normal-case text-tinta-fraca">(opcional)</span>
                  </label>
                  <input id="cadenciata-5"
                    value={tituloProximo}
                    onChange={(e) => setTituloProximo(e.target.value)}
                    maxLength={120}
                    placeholder={`${ROTULOS_ATIVIDADE[tipoProximo]} — ${empresa}`}
                    className="w-full px-3 py-2 text-corpo rounded-xl border border-fio bg-superficie"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {erro && <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">{erro}</p>}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={salvando}
            className="px-5 py-2.5 text-rotulo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Registrar atividade
          </button>
          <button
            type="button"
            onClick={limparFormulario}
            className="px-3 py-2.5 text-rotulo font-medium text-tinta-suave hover:bg-recuo rounded-xl"
          >
            Limpar
          </button>
        </div>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Próximos passos                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-superficie rounded-2xl border border-fio shadow-xs p-5">
        <h3 className="font-medium text-corpo text-tinta mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-acento" /> Próximos passos ({proximosPassos.length})
        </h3>

        {proximosPassos.length === 0 ? (
          <div className="flex items-start gap-2 p-3 bg-alerta-fraco border border-alerta/40 rounded-xl">
            <AlertTriangle className="h-4 w-4 text-alerta shrink-0 mt-0.5" />
            <p className="text-rotulo text-alerta">
              Nenhum próximo passo agendado — este negócio some do radar. Registre uma atividade acima já agendando a próxima ação.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {proximosPassos.map((a) => {
              const Icon = ICONES[a.tipo] || MessageSquare;
              const atrasada = estaAtrasada(a.data_agendada);
              return (
                <div
                  key={a.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${
                    atrasada
                      ? "bg-risco-fraco/70 border-risco/40"
                      : "bg-acento-fraco/60 border-fio"
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full text-white flex items-center justify-center shrink-0 ${
                      atrasada ? "bg-risco-solido" : "bg-acento-solido"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-corpo font-medium text-tinta">{a.titulo}</p>
                    <p className="text-rotulo text-tinta-suave flex items-center gap-1 mt-0.5 flex-wrap">
                      <Clock className="h-3 w-3" />
                      {formatarDataHora(a.data_agendada)}
                      <span className={`font-medium ${atrasada ? "text-risco" : "text-tinta-suave"}`}>
                        ({descreverPrazo(a.data_agendada)})
                      </span>
                      {atrasada && (
                        <span className="flex items-center gap-1 text-risco font-medium ml-1">
                          <AlertTriangle className="h-3 w-3" /> atrasado
                        </span>
                      )}
                      {a.confirmada && (
                        <span className="flex items-center gap-1 text-ok font-medium ml-1">
                          <BadgeCheck className="h-3 w-3" /> agenda confirmada
                        </span>
                      )}
                    </p>

                    {/* Reunião cuja hora já passou e ninguém disse se houve.
                        Sem esta pergunta o no-show fica invisível: o card
                        continua "atrasado" para sempre e o SDR nunca sabe que
                        tem alguém para reagendar. */}
                    {aoResponderComparecimento &&
                      atrasada &&
                      a.compareceu == null &&
                      (a.tipo === "reuniao" || a.tipo === "demo") && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap rounded-xl bg-superficie/70 border border-risco/40 px-3 py-2">
                          <span className="text-rotulo font-medium text-tinta-suave">
                            O cliente compareceu?
                          </span>
                          <button
                            onClick={() => void responder(a.id, true)}
                            disabled={respondendo === a.id}
                            className="px-2.5 py-1 text-rotulo font-medium text-ok bg-ok-fraco hover:bg-ok-fraco rounded-lg transition-colors duration-150 ease-out disabled:opacity-60"
                          >
                            Compareceu
                          </button>
                          <button
                            onClick={() => void responder(a.id, false)}
                            disabled={respondendo === a.id}
                            className="px-2.5 py-1 text-rotulo font-medium text-risco bg-risco-fraco hover:bg-risco-fraco rounded-lg transition-colors duration-150 ease-out disabled:opacity-60"
                          >
                            Não veio
                          </button>
                          {respondendo === a.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-tinta-fraca" />}
                          <span className="text-rotulo text-tinta-fraca">
                            &ldquo;Não veio&rdquo; devolve o lead para o SDR reagendar.
                          </span>
                        </div>
                      )}

                    {/* Reunião com hora marcada e sem convite ainda. Só
                        aparece para reunião/demo: convite de Google para uma
                        ligação interna seria ruído na caixa do cliente. */}
                    {(a.tipo === "reuniao" || a.tipo === "demo") && a.data_agendada && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {a.google_evento_id ? (
                          <>
                            <span className="inline-flex items-center gap-1 text-rotulo font-medium text-ok">
                              <CalendarCheck className="h-3 w-3" /> convite enviado
                            </span>
                            {a.google_meet_link && (
                              <a
                                href={a.google_meet_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-rotulo font-medium text-acento hover:underline focus-visible:outline-2 focus-visible:outline-offset-2  rounded"
                              >
                                abrir o Meet
                              </a>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={() => void criarConviteGoogle(a.id)}
                            disabled={agendandoGoogle === a.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-rotulo font-medium text-acento bg-acento-fraco hover:bg-acento-fraco rounded-lg transition-colors duration-150 ease-out disabled:opacity-60"
                          >
                            {agendandoGoogle === a.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CalendarPlus className="h-3 w-3" />
                            )}
                            Criar convite no Google
                          </button>
                        )}
                      </div>
                    )}

                    {reagendando === a.id && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <input
                          type="datetime-local"
                          value={novaData}
                          onChange={(e) => setNovaData(e.target.value)}
                          className="px-2.5 py-1.5 text-rotulo rounded-lg border border-fio bg-superficie"
                        />
                        {PRESETS_AGENDAMENTO.slice(0, 4).map((p) => (
                          <button
                            key={p.rotulo}
                            onClick={() => setNovaData(paraInputDataHora(dataDoPreset(p)))}
                            className="px-2 py-1 text-rotulo font-medium text-acento bg-superficie border border-fio rounded-lg"
                          >
                            {p.rotulo}
                          </button>
                        ))}
                        <button
                          onClick={() => reagendar(a.id)}
                          disabled={!novaData}
                          className="px-2.5 py-1.5 text-rotulo font-medium text-acento-tinta bg-acento-solido rounded-lg disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setReagendando(null)}
                          className="px-2 py-1.5 text-rotulo font-medium text-tinta-suave"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!a.confirmada && (
                      <button
                        onClick={() => confirmarAgenda(a.id)}
                        title="Cliente confirmou a agenda"
                        className="text-rotulo font-medium text-acento hover:bg-acento-fraco px-2 py-1.5 rounded-lg"
                      >
                        Confirmar
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setReagendando(a.id);
                        setNovaData(a.data_agendada ? paraInputDataHora(new Date(a.data_agendada)) : "");
                      }}
                      title="Reagendar"
                      className="text-tinta-fraca hover:text-acento p-1.5 rounded-lg"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => marcarConcluida(a.id)}
                      className="text-rotulo font-medium text-ok hover:bg-ok-fraco px-2 py-1.5 rounded-lg"
                    >
                      Concluir
                    </button>
                    <button
                      onClick={() => setExcluindo(a)}
                      title="Excluir"
                      className="text-tinta-fraca hover:text-risco p-1.5 rounded-lg"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Histórico                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-superficie rounded-2xl border border-fio shadow-xs p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="font-medium text-corpo text-tinta">Histórico ({historico.length})</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-tinta-fraca" />
              <input
                value={buscaHistorico}
                onChange={(e) => setBuscaHistorico(e.target.value)}
                placeholder="Buscar no histórico..."
                className="pl-8 pr-3 py-1.5 text-rotulo bg-recuo border border-fio rounded-lg w-48"
              />
            </div>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-2.5 py-1.5 text-rotulo font-medium bg-recuo border border-fio rounded-lg"
            >
              <option value="todos">Todos os tipos</option>
              {TIPOS_ATIVIDADE.map((t) => (
                <option key={t} value={t}>{ROTULOS_ATIVIDADE[t]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-fio">
          {historico.map((a) => {
            const Icon = ICONES[a.tipo] || MessageSquare;
            // Nos registros feitos aqui o título é o resumo do próprio texto —
            // repetir os dois deixaria a primeira linha duplicada na timeline.
            const tituloRedundante = !!a.descricao && a.descricao.trimStart().startsWith(a.titulo.replace(/…$/, ""));
            return (
              <div key={a.id} className="relative pl-9">
                <div
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full text-white flex items-center justify-center ring-4 ring-superficie ${
                    a.concluida ? "bg-ok" : "bg-tinta-fraca"
                  }`}
                >
                  {a.concluida ? <CheckCircle2 className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                </div>
                <div className="p-3 bg-recuo rounded-xl border border-fio/80">
                  <div className="flex items-center justify-between gap-2 text-rotulo mb-1 flex-wrap">
                    <span className="font-medium text-tinta flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-tinta-fraca" />
                      {tituloRedundante ? ROTULOS_ATIVIDADE[a.tipo] || a.tipo : a.titulo}
                    </span>
                    <span className="text-rotulo text-tinta-fraca">
                      {formatarDataHora(a.concluida_em || a.criado_em)}
                    </span>
                  </div>
                  {a.descricao && (
                    <p className="text-rotulo text-tinta-suave whitespace-pre-wrap">{a.descricao}</p>
                  )}
                  <p className="text-rotulo text-tinta-fraca mt-1 font-medium">
                    Por {a.usuario?.nome || "Sistema"}
                  </p>
                </div>
              </div>
            );
          })}
          {historico.length === 0 && <p className="text-rotulo text-tinta-fraca pl-9">Nenhum registro encontrado.</p>}
        </div>
      </div>

      <Confirmar
        aberto={!!excluindo}
        titulo="Excluir passo da cadência"
        rotuloConfirmar="Excluir passo"
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={excluirAtividade}
        descricao={
          <>
            <strong className="font-medium text-tinta">{excluindo?.titulo}</strong>{" "}
            sai do histórico deste negócio. Não dá para desfazer.
          </>
        }
      />
    </div>
  );
}
