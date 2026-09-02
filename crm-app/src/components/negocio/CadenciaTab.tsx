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
} from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
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
}: {
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

  const excluirAtividade = async (id: string) => {
    if (!confirm("Excluir este passo da cadência?")) return;
    const antes = atividades;
    setAtividades((prev) => prev.filter((a) => a.id !== id));
    const { error } = await createClient().from("atividades").delete().eq("id", id);
    if (error) {
      setAtividades(antes);
      setErro(`Não foi possível excluir: ${error.message}`);
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
        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Registrar atividade</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Ao salvar, o card fica verde e desce para o fim da coluna do pipeline.
            </p>
          </div>
          {ok && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-lg">
              <CheckCircle2 className="h-4 w-4" /> Atividade registrada
            </span>
          )}
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1.5">Tipo de contato</label>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_REGISTRAVEIS.map((t) => {
              const Icon = ICONES[t] || MessageSquare;
              const ativo = tipo === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
                    ativo
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
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
              <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                O que aconteceu <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={12}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onBlur={() => setTocouTexto(true)}
                placeholder={
                  "Anote aqui tudo que importa:\n• Com quem falou e qual o cargo\n• Dores e prioridades levantadas\n• Objeções, concorrentes e preço discutido\n• O que ficou combinado e o prazo"
                }
                className={`w-full px-3.5 py-2.5 text-sm leading-relaxed rounded-xl border bg-slate-50 dark:bg-slate-800 resize-y min-h-[240px] outline-hidden focus:ring-1 ${
                  tocouTexto && textoInvalido
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500"
                    : "border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500"
                }`}
              />
              {tocouTexto && textoInvalido ? (
                <p className="text-[11px] font-semibold text-rose-600 mt-1">Escreva o que aconteceu no contato.</p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-1">
                  {descricao.length} caracteres · a primeira linha vira o resumo no histórico
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Realizada em</label>
              <input
                type="datetime-local"
                value={realizadaEm}
                onChange={(e) => setRealizadaEm(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Agendamento do próximo passo */}
          <div
            className={`rounded-2xl border p-4 space-y-3 h-fit ${
              agendarProximo
                ? "border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
            }`}
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agendarProximo}
                onChange={(e) => setAgendarProximo(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-indigo-600"
              />
              <span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-indigo-600" /> Agendar próximo passo
                </span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Nunca deixe o negócio sem próxima ação. Você recebe o alerta pelo sino na data.
                </span>
              </span>
            </label>

            {agendarProximo && (
              <>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Quando</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PRESETS_AGENDAMENTO.map((p, i) => (
                      <button
                        key={p.rotulo}
                        type="button"
                        onClick={() => aplicarPreset(i)}
                        className="px-2.5 py-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
                      >
                        {p.rotulo}
                      </button>
                    ))}
                  </div>
                  <input
                    type="datetime-local"
                    value={dataAgendada}
                    onChange={(e) => setDataAgendada(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  {dataAgendada && (
                    <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                      {descreverPrazo(new Date(dataAgendada).toISOString())} · {formatarDataHora(new Date(dataAgendada).toISOString())}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Tipo do próximo passo</label>
                  <select
                    value={tipoProximo}
                    onChange={(e) => setTipoProximo(e.target.value as TipoAtividade)}
                    className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {TIPOS_REGISTRAVEIS.map((t) => (
                      <option key={t} value={t}>{ROTULOS_ATIVIDADE[t]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Descrição do próximo passo <span className="font-semibold normal-case text-slate-400">(opcional)</span>
                  </label>
                  <input
                    value={tituloProximo}
                    onChange={(e) => setTituloProximo(e.target.value)}
                    maxLength={120}
                    placeholder={`${ROTULOS_ATIVIDADE[tipoProximo]} — ${empresa}`}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={salvando}
            className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Registrar atividade
          </button>
          <button
            type="button"
            onClick={limparFormulario}
            className="px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          >
            Limpar
          </button>
        </div>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Próximos passos                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-indigo-600" /> Próximos passos ({proximosPassos.length})
        </h3>

        {proximosPassos.length === 0 ? (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
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
                      ? "bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900"
                      : "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900"
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full text-white flex items-center justify-center shrink-0 ${
                      atrasada ? "bg-rose-600" : "bg-indigo-600"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{a.titulo}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 flex-wrap">
                      <Clock className="h-3 w-3" />
                      {formatarDataHora(a.data_agendada)}
                      <span className={`font-bold ${atrasada ? "text-rose-600 dark:text-rose-400" : "text-slate-500"}`}>
                        ({descreverPrazo(a.data_agendada)})
                      </span>
                      {atrasada && (
                        <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold ml-1">
                          <AlertTriangle className="h-3 w-3" /> atrasado
                        </span>
                      )}
                      {a.confirmada && (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold ml-1">
                          <BadgeCheck className="h-3 w-3" /> agenda confirmada
                        </span>
                      )}
                    </p>

                    {reagendando === a.id && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <input
                          type="datetime-local"
                          value={novaData}
                          onChange={(e) => setNovaData(e.target.value)}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        {PRESETS_AGENDAMENTO.slice(0, 4).map((p) => (
                          <button
                            key={p.rotulo}
                            onClick={() => setNovaData(paraInputDataHora(dataDoPreset(p)))}
                            className="px-2 py-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg"
                          >
                            {p.rotulo}
                          </button>
                        ))}
                        <button
                          onClick={() => reagendar(a.id)}
                          disabled={!novaData}
                          className="px-2.5 py-1.5 text-[11px] font-bold text-white bg-indigo-600 rounded-lg disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setReagendando(null)}
                          className="px-2 py-1.5 text-[11px] font-semibold text-slate-500"
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
                        className="text-[11px] font-bold text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 px-2 py-1.5 rounded-lg"
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
                      className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => marcarConcluida(a.id)}
                      className="text-[11px] font-bold text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 px-2 py-1.5 rounded-lg"
                    >
                      Concluir
                    </button>
                    <button
                      onClick={() => excluirAtividade(a.id)}
                      title="Excluir"
                      className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg"
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
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Histórico ({historico.length})</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={buscaHistorico}
                onChange={(e) => setBuscaHistorico(e.target.value)}
                placeholder="Buscar no histórico..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg w-48"
              />
            </div>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="todos">Todos os tipos</option>
              {TIPOS_ATIVIDADE.map((t) => (
                <option key={t} value={t}>{ROTULOS_ATIVIDADE[t]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
          {historico.map((a) => {
            const Icon = ICONES[a.tipo] || MessageSquare;
            // Nos registros feitos aqui o título é o resumo do próprio texto —
            // repetir os dois deixaria a primeira linha duplicada na timeline.
            const tituloRedundante = !!a.descricao && a.descricao.trimStart().startsWith(a.titulo.replace(/…$/, ""));
            return (
              <div key={a.id} className="relative pl-9">
                <div
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full text-white flex items-center justify-center ring-4 ring-white dark:ring-slate-900 ${
                    a.concluida ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                >
                  {a.concluida ? <CheckCircle2 className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2 text-xs mb-1 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-slate-400" />
                      {tituloRedundante ? ROTULOS_ATIVIDADE[a.tipo] || a.tipo : a.titulo}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatarDataHora(a.concluida_em || a.criado_em)}
                    </span>
                  </div>
                  {a.descricao && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{a.descricao}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">
                    Por {a.usuario?.nome || "Sistema"}
                  </p>
                </div>
              </div>
            );
          })}
          {historico.length === 0 && <p className="text-xs text-slate-400 pl-9">Nenhum registro encontrado.</p>}
        </div>
      </div>
    </div>
  );
}
