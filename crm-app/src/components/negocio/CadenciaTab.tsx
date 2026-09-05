"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Pencil,
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
  Check,
  UserX,
} from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { Botao, Confirmar } from "@/components/ui";
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
  ehReuniao,
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
  aoEntregarComReuniao,
  aoEditarReuniao,
}: {
  /**
   * Só existe quando há um funil para onde devolver o no-show. Sem ele a
   * pergunta "compareceu?" não aparece: não adianta perguntar se não há fila
   * de reagendamento do outro lado.
   */
  aoResponderComparecimento?: (atividadeId: string, compareceu: boolean) => Promise<string | void>;
  /**
   * Passa o lead para o funil do vendedor. Só existe no funil do SDR, e é o
   * que transforma "agendar" e "entregar" numa ação só — o pedido era que o
   * fluxo do SDR fosse ATÉ agendar o cliente no card do vendedor.
   *
   * Devolve a mensagem de erro, ou nada em caso de sucesso (a tela navega para
   * o board, porque a RLS já não alcança este negócio).
   */
  aoEntregarComReuniao?: (info: { quando: string | null; comMeet: boolean }) => Promise<string | void>;
  /**
   * Abre a reunião para corrigir título, hora, duração e pauta.
   *
   * Sobe para o card em vez de montar o modal aqui: `AgendarReuniao` precisa do
   * negócio no formato do convite e do nome de quem assina, e o
   * `NegocioDetailClient` já monta os dois para agendar. Mesmo caminho de
   * `aoEntregarComReuniao`.
   */
  aoEditarReuniao?: (atividade: AtividadeComUsuario) => void;
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

  /**
   * Remarcar — e, quando existe convite, remarcar NA AGENDA DO CLIENTE também.
   *
   * Este botão escrevia direto em `atividades` e mais nada. O CRM passava a
   * mostrar a hora nova e o evento continuava na hora velha na agenda do
   * vendedor e na do cliente, com o Meet do horário original, sem ninguém ser
   * avisado. Quem clicava achava que tinha remarcado.
   *
   * Com convite, quem manda é a rota: ela altera o evento na Google ANTES de
   * gravar aqui, então uma falha lá deixa os dois lados concordando na hora
   * antiga em vez de o CRM mentir. Sem convite (reunião só no CRM), o caminho
   * direto continua — não há nada para avisar.
   */
  const reagendar = async (id: string) => {
    if (!novaData) return;
    const alvo = atividades.find((a) => a.id === id);
    const quando = new Date(novaData).toISOString();
    const antes = atividades;
    setAtividades((prev) =>
      prev.map((a) => (a.id === id ? { ...a, data_agendada: quando, lembrete_data: quando, lembrete_enviado: false } : a)),
    );
    setReagendando(null);
    setNovaData("");
    setErro(null);

    if (alvo?.google_evento_id) {
      try {
        const resp = await fetch("/api/google/reuniao", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ atividadeId: id, quando }),
        });
        const dados = await resp.json();
        if (!resp.ok) {
          setAtividades(antes);
          setErro(dados?.error || "Não foi possível reagendar.");
          return;
        }
        if (dados?.aviso) setErro(dados.aviso);
      } catch (e) {
        setAtividades(antes);
        setErro(e instanceof Error ? e.message : "Não foi possível reagendar.");
      }
      return;
    }

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
  /**
   * "Não veio" PERGUNTA antes.
   *
   * Não é cerimônia: o clique devolve o lead para outro funil, tira o dono e
   * te expulsa da página — a RLS deixa de te alcançar no instante seguinte.
   * Uma ação que muda de dono, de funil e de tela não pode acontecer no
   * primeiro clique, ainda mais colada num botão verde de sentido oposto.
   *
   * "Compareceu" não pergunta: ele só conclui a atividade, e é reversível.
   */
  const [confirmandoNoShow, setConfirmandoNoShow] = useState<AtividadeComUsuario | null>(null);

  const responder = async (id: string, compareceu: boolean): Promise<string | void> => {
    if (!aoResponderComparecimento) return;
    setRespondendo(id);
    const erroResposta = await aoResponderComparecimento(id, compareceu);
    setRespondendo(null);
    if (erroResposta) {
      // Devolvido para o diálogo quando veio dele; a faixa cobre o outro botão.
      setErro(`Não foi possível registrar a resposta: ${erroResposta}`);
      return erroResposta;
    }
    setAtividades((prev) =>
      prev.map((a) => (a.id === id ? { ...a, compareceu, concluida: true } : a)),
    );
  };

  const [agendandoGoogle, setAgendandoGoogle] = useState<string | null>(null);

  /**
   * Cria o convite de verdade na agenda de quem clicou, manda para o cliente e,
   * no funil do SDR, ENTREGA o lead ao vendedor na sequência.
   *
   * A ordem não é estilo, é a única garantia possível aqui: o convite é um
   * efeito externo que não volta atrás dentro de uma transação, então ele vem
   * primeiro. Convite falhou → nada se move. Convite criado e a transferência
   * falhou → o evento existe, a atividade já tem `google_evento_id`, e o botão
   * abaixo vira "Entregar ao vendedor", que termina o trabalho num clique. O
   * que não pode acontecer é o contrário — lead entregue sem reunião nenhuma —,
   * que é exatamente o que acontecia antes.
   *
   * O botão de criar some depois, porque a atividade passa a ter
   * `google_evento_id`: é o que impede um clique duplo virar dois convites na
   * caixa do cliente.
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

      if (aoEntregarComReuniao) {
        const erroEntrega = await entregar(id, !!dados.meetLink);
        if (erroEntrega) return;
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o convite.");
    } finally {
      setAgendandoGoogle(null);
    }
  };

  /**
   * A entrega em si, isolada porque tem DOIS chamadores: o agendamento acima e
   * o botão de retomada, para quando o convite saiu e a transferência não.
   */
  const entregar = async (atividadeId: string, comMeet: boolean): Promise<string | void> => {
    if (!aoEntregarComReuniao) return;
    const quando = atividades.find((a) => a.id === atividadeId)?.data_agendada ?? null;
    const erroEntrega = await aoEntregarComReuniao({ quando, comMeet });
    if (erroEntrega) {
      setErro(
        `O convite está criado, mas não consegui entregar o lead ao vendedor: ${erroEntrega}. ` +
          "Tente de novo pelo botão \"Entregar ao vendedor\".",
      );
      return erroEntrega;
    }
  };

  const [excluindo, setExcluindo] = useState<AtividadeComUsuario | null>(null);

  /**
   * Excluir — cancelando o convite na agenda do cliente quando ele existe.
   *
   * Apagar a linha direto destruía o `google_evento_id` junto, e ele é a ÚNICA
   * referência ao evento: o convite ficava na agenda do cliente sem ninguém
   * conseguir cancelá-lo depois. A rota cancela na Google primeiro, justamente
   * porque essa perda é irreversível e a nossa não é.
   */
  const excluirAtividade = async (): Promise<string | void> => {
    if (!excluindo) return;
    const antes = atividades;
    const id = excluindo.id;
    const tinhaConvite = !!excluindo.google_evento_id;
    setAtividades((prev) => prev.filter((a) => a.id !== id));

    if (tinhaConvite) {
      try {
        const resp = await fetch("/api/google/reuniao", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ atividadeId: id }),
        });
        const dados = await resp.json();
        if (!resp.ok) {
          setAtividades(antes);
          return dados?.error || "Não foi possível cancelar a reunião.";
        }
        if (dados?.aviso) setErro(dados.aviso);
      } catch (e) {
        setAtividades(antes);
        return e instanceof Error ? e.message : "Não foi possível cancelar a reunião.";
      }
      return;
    }

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
        className="bg-superficie rounded-2xl border border-fio shadow-cartao p-5 space-y-4"
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
                  className={`foco flex items-center gap-1.5 px-3 py-2 text-rotulo font-medium rounded-xl border transition-colors duration-150 ease-out ${
                    ativo
                      ? "bg-acento-solido text-acento-tinta border-acento"
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
                className={`foco w-full px-3.5 py-2.5 text-corpo leading-relaxed rounded-xl border bg-recuo resize-y min-h-60 ${
                  tocouTexto && textoInvalido ? "border-risco" : "border-fio"
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
                        className="foco px-2.5 py-1 text-rotulo font-medium text-acento bg-superficie border border-fio rounded-lg hover:bg-acento-fraco"
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
            className="foco px-5 py-2.5 text-rotulo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Registrar atividade
          </button>
          <button
            type="button"
            onClick={limparFormulario}
            className="foco px-3 py-2.5 text-rotulo font-medium text-tinta-suave hover:bg-recuo rounded-xl"
          >
            Limpar
          </button>
        </div>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Próximos passos                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-superficie rounded-2xl border border-fio shadow-cartao p-5">
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
                    className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      atrasada ? "bg-risco-solido text-risco-tinta" : "bg-acento-solido text-acento-tinta"
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
                      ehReuniao(a.tipo) && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap rounded-xl bg-superficie/70 border border-risco/40 px-3 py-2">
                          <span className="text-rotulo font-medium text-tinta-suave">
                            O cliente compareceu?
                          </span>
                          {/* Os dois eram `<button>` cru com `hover:bg-ok-fraco`
                              sobre `bg-ok-fraco` — ou seja, o hover trocava a
                              cor por ela mesma e o botão não reagia a nada. Aqui
                              é o `Botao` do sistema, que já traz hover, foco
                              visível, `active` e carregando. */}
                          <Botao
                            tamanho="sm"
                            variante="secundario"
                            icone={Check}
                            carregando={respondendo === a.id}
                            disabled={respondendo !== null}
                            onClick={() => void responder(a.id, true)}
                          >
                            Compareceu
                          </Botao>
                          <Botao
                            tamanho="sm"
                            variante="perigo"
                            icone={UserX}
                            disabled={respondendo !== null}
                            onClick={() => setConfirmandoNoShow(a)}
                          >
                            Não veio
                          </Botao>
                          <span className="text-rotulo text-tinta-fraca">
                            &ldquo;Não veio&rdquo; devolve o lead para o SDR reagendar.
                          </span>
                          {a.google_evento_id && <RespostaDoConvite atividadeId={a.id} />}
                        </div>
                      )}

                    {/* Reunião com hora marcada e sem convite ainda. Só
                        aparece para reunião/demo: convite de Google para uma
                        ligação interna seria ruído na caixa do cliente.

                        No funil do SDR este é O botão do fluxo: agendar é a
                        entrega. Antes eram duas ações que não se conheciam —
                        criar o convite não movia nada, e mover o card não
                        conferia se havia convite. */}
                    {ehReuniao(a.tipo) && a.data_agendada && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
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
                                  className="foco rounded-lg text-rotulo font-medium text-acento hover:underline"
                                >
                                  abrir o Meet
                                </a>
                              )}
                              {/* A retomada: o convite saiu e a transferência
                                  não. Um clique termina o que ficou pela
                                  metade, em vez de deixar o lead preso no SDR
                                  com reunião marcada. */}
                              {aoEntregarComReuniao && !a.concluida && (
                                <button
                                  onClick={() => void entregar(a.id, !!a.google_meet_link)}
                                  className="foco inline-flex items-center gap-1.5 px-2.5 py-1 text-rotulo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-lg transition-colors duration-150 ease-out"
                                >
                                  <ArrowLeftRight className="h-3 w-3" /> Entregar ao vendedor
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => void criarConviteGoogle(a.id)}
                              disabled={agendandoGoogle === a.id}
                              className={`foco inline-flex items-center gap-1.5 px-2.5 py-1 text-rotulo font-medium rounded-lg transition-colors duration-150 ease-out disabled:opacity-60 ${
                                aoEntregarComReuniao
                                  ? "text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover"
                                  : "text-acento bg-acento-fraco hover:bg-acento-fraco"
                              }`}
                            >
                              {agendandoGoogle === a.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CalendarPlus className="h-3 w-3" />
                              )}
                              {aoEntregarComReuniao
                                ? "Agendar e entregar ao vendedor"
                                : "Criar convite no Google"}
                            </button>
                          )}
                        </div>
                        {aoEntregarComReuniao && !a.google_evento_id && (
                          <p className="text-rotulo text-tinta-fraca">
                            Manda o convite com Meet para o cliente e, dando certo, passa o lead para o
                            funil do vendedor. Se o convite falhar, nada se move.
                          </p>
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
                            className="foco px-2 py-1 text-rotulo font-medium text-acento bg-superficie border border-fio rounded-lg"
                          >
                            {p.rotulo}
                          </button>
                        ))}
                        <button
                          onClick={() => reagendar(a.id)}
                          disabled={!novaData}
                          className="foco px-2.5 py-1.5 text-rotulo font-medium text-acento-tinta bg-acento-solido rounded-lg disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setReagendando(null)}
                          className="foco px-2 py-1.5 text-rotulo font-medium text-tinta-suave"
                        >
                          Cancelar
                        </button>
                        {a.google_evento_id ? (
                          <p className="w-full text-rotulo text-tinta-suave">
                            O evento muda na agenda do cliente e a Google avisa por e-mail.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!a.confirmada && (
                      <button
                        onClick={() => confirmarAgenda(a.id)}
                        title="Cliente confirmou a agenda"
                        className="foco text-rotulo font-medium text-acento hover:bg-acento-fraco px-2 py-1.5 rounded-lg"
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
                      className="foco text-tinta-fraca hover:text-acento p-1.5 rounded-lg transition-colors duration-150 ease-out"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    {aoEditarReuniao && a.tipo === "reuniao" && (
                      <button
                        onClick={() => aoEditarReuniao(a)}
                        title="Editar título, duração e pauta"
                        className="foco text-tinta-fraca hover:text-acento p-1.5 rounded-lg transition-colors duration-150 ease-out"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => marcarConcluida(a.id)}
                      className="foco text-rotulo font-medium text-ok hover:bg-ok-fraco px-2 py-1.5 rounded-lg"
                    >
                      Concluir
                    </button>
                    <button
                      onClick={() => setExcluindo(a)}
                      title="Excluir"
                      className="foco text-tinta-fraca hover:text-risco p-1.5 rounded-lg"
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
      <div className="bg-superficie rounded-2xl border border-fio shadow-cartao p-5">
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
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full flex items-center justify-center ring-4 ring-superficie ${
                    a.concluida ? "bg-ok-solido text-ok-tinta" : "bg-tinta-fraca text-superficie"
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
        titulo={excluindo?.google_evento_id ? "Cancelar a reunião?" : "Excluir passo da cadência"}
        rotuloConfirmar={excluindo?.google_evento_id ? "Cancelar reunião" : "Excluir passo"}
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={excluirAtividade}
        descricao={
          <>
            <strong className="font-medium text-tinta">{excluindo?.titulo}</strong>{" "}
            sai do histórico deste negócio. Não dá para desfazer.
            {excluindo?.google_evento_id ? (
              <>
                {" "}
                <strong className="font-medium text-tinta">
                  O convite também será cancelado na agenda do cliente
                </strong>
                , e a Google vai avisá-lo por e-mail.
              </>
            ) : null}
          </>
        }
      />

      {/* O no-show, dito por inteiro ANTES de acontecer. Cada linha aqui é uma
          consequência que a pessoa não veria de outro jeito — principalmente a
          última, que explica por que a tela vai sumir. */}
      <Confirmar
        aberto={confirmandoNoShow !== null}
        titulo="Marcar como no-show e devolver para o SDR?"
        rotuloConfirmar="Sim, devolver para reagendar"
        aoFechar={() => setConfirmandoNoShow(null)}
        aoConfirmar={async () => {
          const alvo = confirmandoNoShow;
          if (!alvo) return;
          const problema = await responder(alvo.id, false);
          if (problema) return problema;
          setConfirmandoNoShow(null);
        }}
        descricao={
          <>
            <strong className="font-medium text-tinta">{confirmandoNoShow?.titulo}</strong> fica
            registrada como não realizada, e o negócio:
            <ul className="mt-2 space-y-1 list-disc pl-4">
              <li>volta para o funil de prospecção, na etapa de reagendamento;</li>
              <li>fica <strong className="font-medium text-tinta">sem dono</strong>, para o próximo SDR livre pegar;</li>
              <li>entra sozinho na cadência de remarcação — o primeiro e-mail já fica pronto.</li>
            </ul>
            <p className="mt-2">
              Depois disso este card sai da sua lista e esta página fecha: ele passa a ser do time
              de prospecção.
            </p>
          </>
        }
      />
    </div>
  );
}

/** Como o convite foi respondido, por tom e por texto. */
const RSVP: Record<string, { texto: string; classe: string }> = {
  aceito: { texto: "o cliente aceitou o convite", classe: "text-ok" },
  recusado: { texto: "o cliente recusou o convite", classe: "text-risco" },
  talvez: { texto: "o cliente respondeu “talvez”", classe: "text-alerta" },
  sem_resposta: { texto: "o cliente não respondeu ao convite", classe: "text-alerta" },
};

/**
 * O que o cliente respondeu ao convite, buscado quando a pergunta "compareceu?"
 * aparece.
 *
 * É um componente próprio, e não um efeito no pai, porque assim a busca
 * acontece exatamente uma vez por bloco renderizado — sem lista de ids já
 * buscados e sem risco de laço quando a lista de atividades muda.
 *
 * Falha em silêncio de propósito: a rota degrada quando o organizador não tem
 * conta conectada, e uma reunião sem RSVP legível não torna a pergunta menos
 * necessária. A linha simplesmente não aparece.
 */
function RespostaDoConvite({ atividadeId }: { atividadeId: string }) {
  const [resposta, setResposta] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await comPrazo(fetch(`/api/google/rsvp?atividadeId=${atividadeId}`), 10_000);
        if (!r.ok) return;
        const dados = await r.json();
        if (vivo) setResposta(typeof dados.resposta === "string" ? dados.resposta : null);
      } catch {
        // Sem rede, sem conta, Google fora: nada disso é problema desta linha.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [atividadeId]);

  const item = resposta ? RSVP[resposta] : undefined;
  if (!item) return null;

  return (
    <span className={`flex items-center gap-1 text-rotulo font-medium ${item.classe}`}>
      <CalendarCheck className="h-3 w-3 shrink-0" aria-hidden /> {item.texto}
    </span>
  );
}
