"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  MessageSquare,
  PhoneCall,
  RotateCcw,
  Users,
  Video,
  FileText,
} from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import type { Atividade, Usuario } from "@/lib/types";
import {
  PRESETS_AGENDAMENTO,
  ROTULOS_ATIVIDADE,
  dataDoPreset,
  descreverPrazo,
  ehHoje,
  estaAtrasada,
  formatarDataHora,
  paraInputDataHora,
} from "@/lib/atividades";
import { SELECT_AGENDA } from "@/lib/types";
import { Botao } from "@/components/ui";
import { AgendarReuniao } from "@/components/agenda/AgendarReuniao";
import type { NegocioAgendavel } from "@/components/agenda/tipos";
import { duracaoCurta, type EventoDaAgenda } from "@/lib/google/agenda";

export type AtividadeAgenda = Atividade & {
  negocio: {
    id: string;
    titulo: string;
    responsavel_id: string | null;
    contato: { nome: string; empresa: string | null; telefone: string | null; whatsapp: string | null } | null;
    responsavel: { id: string; nome: string } | null;
  } | null;
};

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  ligacao: PhoneCall,
  email: Mail,
  demo: Video,
  proposta: FileText,
  nota: MessageSquare,
  whatsapp: MessageSquare,
  reuniao: Users,
};

const UM_DIA_MS = 86_400_000;

/**
 * Uma linha da agenda. As duas metades da tela são coisas DIFERENTES, e por
 * isso são tipos diferentes e não um registro com campos opcionais:
 *
 * - `atividade` é uma TAREFA do CRM: tem dono, tem negócio, e alguém precisa
 *   concluí-la, reagendá-la ou confirmá-la;
 * - `evento` é um COMPROMISSO da agenda do Google: já aconteceu ou vai
 *   acontecer, e não há nada para "concluir" nele.
 *
 * A tela desenha as duas com silhuetas distintas justamente porque tratá-las
 * igual foi o erro que a aba de e-mail cometeu com o WhatsApp.
 */
type ItemDaAgenda =
  | { chave: string; quando: number; tipo: "atividade"; atividade: AtividadeAgenda }
  | { chave: string; quando: number; tipo: "evento"; evento: EventoDaAgenda; passou: boolean };

type Grupo = { chave: string; titulo: string; itens: ItemDaAgenda[]; tom: "atrasado" | "hoje" | "futuro" };

type EstadoDoGoogle =
  | { estado: "carregando" }
  | { estado: "conectada"; eventos: EventoDaAgenda[] }
  | { estado: "indisponivel"; motivo: string; precisaReconectar: boolean };

/** Não bater na Google mais de uma vez a cada dois minutos por foco de aba. */
const INTERVALO_GOOGLE_MS = 120_000;

export function AgendaClient({
  atividadesIniciais,
  usuarioAtual,
  negociosAgendaveis = [],
}: {
  atividadesIniciais: AtividadeAgenda[];
  usuarioAtual: Usuario;
  /** Negócios abertos e visíveis, para o seletor do agendamento. */
  negociosAgendaveis?: NegocioAgendavel[];
}) {
  const [atividades, setAtividades] = useEstadoDaProp(atividadesIniciais);
  const [apenasMinhas, setApenasMinhas] = useState(usuarioAtual.role !== "admin");
  const [reagendando, setReagendando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [google, setGoogle] = useState<EstadoDoGoogle>({ estado: "carregando" });
  const [mostrarGoogle, setMostrarGoogle] = useState(true);
  const [agendando, setAgendando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const { data } = await createClient()
      .from("atividades")
      .select(SELECT_AGENDA)
      .not("data_agendada", "is", null)
      .or("concluida.is.null,concluida.is.false")
      .order("data_agendada", { ascending: true });
    if (data) setAtividades(data as unknown as AtividadeAgenda[]);
  }, []);

  useSincronizacao(recarregar, {
    canal: "agenda",
    tabelas: [{ tabela: "atividades" }, { tabela: "negocios" }],
  });

  /**
   * A agenda do Google fica FORA do `useSincronizacao` de propósito.
   *
   * Aquele gancho recarrega a cada 8 s quando o websocket não sobe, e é o certo
   * para o nosso banco. Bater na Google nesse ritmo seria queimar cota da conta
   * de alguém para redesenhar uma lista que muda algumas vezes por dia. Aqui a
   * recarga é: ao montar, ao voltar para a aba (no máximo de dois em dois
   * minutos) e depois de agendar — que são os três momentos em que a agenda
   * realmente pode ter mudado.
   */
  const ultimaBuscaGoogle = useRef(0);
  const buscarGoogle = useCallback(async (forcar = false) => {
    if (!forcar && Date.now() - ultimaBuscaGoogle.current < INTERVALO_GOOGLE_MS) return;
    ultimaBuscaGoogle.current = Date.now();
    try {
      const resp = await fetch("/api/google/eventos?dias=30");
      const dados = await resp.json();
      if (dados?.conectado) setGoogle({ estado: "conectada", eventos: dados.eventos || [] });
      else
        setGoogle({
          estado: "indisponivel",
          motivo: dados?.motivo || "Agenda do Google indisponível.",
          precisaReconectar: !!dados?.precisaReconectar,
        });
    } catch {
      // Rede caiu. A agenda do CRM continua inteira; esta linha só some.
      setGoogle({ estado: "indisponivel", motivo: "Não foi possível falar com a Google.", precisaReconectar: false });
    }
  }, []);

  /**
   * A busca acontece no NAVEGADOR, e não no servidor junto com o resto da
   * página. É uma escolha, e o custo dela é visível: o lint do React marca este
   * efeito (setState alcançável a partir de um efeito — o mesmo aviso que já
   * existe em dez outros pontos do projeto).
   *
   * A alternativa seria buscar os eventos no server component e entregá-los
   * junto de `atividadesIniciais`: sem efeito, sem piscada, e o lint calado.
   * Mas aí o render da página de Agenda passaria a ESPERAR a Google. Numa
   * conta lenta, ou com a Google fora do ar, a tela inteira do CRM ficaria
   * presa por causa de um painel auxiliar — exatamente o tipo de lentidão que
   * esta rodada foi aberta para consertar.
   *
   * Então: a agenda do CRM pinta na hora, e a do Google chega quando chegar.
   */
  useEffect(() => {
    void buscarGoogle(true);
    const aoVoltar = () => {
      if (!document.hidden) void buscarGoogle();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [buscarGoogle]);

  const visiveis = useMemo(
    () =>
      atividades.filter(
        (a) => !apenasMinhas || a.usuario_id === usuarioAtual.id || a.negocio?.responsavel_id === usuarioAtual.id,
      ),
    [atividades, apenasMinhas, usuarioAtual.id],
  );

  /**
   * Os eventos que a tela mostra, já sem os que o CRM também conhece.
   *
   * Sem esta subtração toda reunião agendada pelo CRM apareceria DUAS vezes —
   * uma como tarefa (com negócio, dono e botões) e outra como compromisso. A
   * linha do CRM é a que fica: ela é mais rica e é a única em que dá para
   * clicar "Concluir".
   */
  const eventosGoogle = useMemo(() => {
    if (!mostrarGoogle || google.estado !== "conectada") return [];
    const jaNoCrm = new Set(
      atividades.map((a) => a.google_evento_id).filter((id): id is string => !!id),
    );
    return google.eventos.filter((e) => !jaNoCrm.has(e.id));
  }, [google, mostrarGoogle, atividades]);

  const grupos: Grupo[] = useMemo(() => {
    const agora = new Date();
    const fimSemana = new Date(agora.getTime() + 7 * UM_DIA_MS);
    const atrasadas: ItemDaAgenda[] = [];
    const hoje: ItemDaAgenda[] = [];
    const semana: ItemDaAgenda[] = [];
    const depois: ItemDaAgenda[] = [];

    for (const a of visiveis) {
      const item: ItemDaAgenda = {
        chave: `a:${a.id}`,
        quando: a.data_agendada ? new Date(a.data_agendada).getTime() : 0,
        tipo: "atividade",
        atividade: a,
      };
      if (estaAtrasada(a.data_agendada, agora) && !ehHoje(a.data_agendada, agora)) atrasadas.push(item);
      else if (ehHoje(a.data_agendada, agora)) hoje.push(item);
      else if (a.data_agendada && new Date(a.data_agendada) <= fimSemana) semana.push(item);
      else depois.push(item);
    }

    for (const e of eventosGoogle) {
      const inicio = new Date(e.inicio);
      // `passou` é decidido AQUI, com o mesmo `agora` que decide o grupo, e não
      // dentro da linha. Ler o relógio durante o render de um componente o torna
      // impuro (o lint do React aponta), e — pior — dois relógios diferentes
      // podem discordar: um evento no grupo "Hoje" desenhado como futuro.
      const item: ItemDaAgenda = {
        chave: `g:${e.id}`,
        quando: inicio.getTime(),
        tipo: "evento",
        evento: e,
        passou: inicio.getTime() < agora.getTime(),
      };
      // Compromisso que já passou NÃO é "atrasado": não há nada para fazer com
      // ele. Uma reunião de ontem em vermelho como se fosse tarefa esquecida
      // seria mentira — por isso o que passou do dia de hoje simplesmente sai.
      if (ehHoje(e.inicio, agora)) hoje.push(item);
      else if (inicio <= fimSemana && inicio > agora) semana.push(item);
      else if (inicio > agora) depois.push(item);
    }

    const porHora = (x: ItemDaAgenda, y: ItemDaAgenda) => x.quando - y.quando;

    return [
      { chave: "atrasadas", titulo: "Atrasadas", itens: atrasadas.sort(porHora), tom: "atrasado" as const },
      { chave: "hoje", titulo: "Hoje", itens: hoje.sort(porHora), tom: "hoje" as const },
      { chave: "semana", titulo: "Próximos 7 dias", itens: semana.sort(porHora), tom: "futuro" as const },
      { chave: "depois", titulo: "Mais adiante", itens: depois.sort(porHora), tom: "futuro" as const },
    ].filter((g) => g.itens.length > 0);
  }, [visiveis, eventosGoogle]);

  const concluir = async (id: string) => {
    const antes = atividades;
    setAtividades((prev) => prev.filter((a) => a.id !== id));
    const { error } = await createClient().from("atividades").update({ concluida: true }).eq("id", id);
    if (error) {
      setAtividades(antes);
      setErro(`Não foi possível concluir: ${error.message}`);
    }
  };

  const confirmar = async (id: string) => {
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

  const totalAtrasadas = grupos.find((g) => g.chave === "atrasadas")?.itens.length ?? 0;
  const totalHoje = grupos.find((g) => g.chave === "hoje")?.itens.length ?? 0;
  const totalEventos = eventosGoogle.length;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-titulo font-semibold text-tinta flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-acento" /> Agenda
          </h1>
          <p className="text-rotulo text-tinta-suave">
            Os próximos passos do CRM e os compromissos da sua agenda do Google, no mesmo dia.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label
            htmlFor="agenda-minhas"
            className="flex items-center gap-2 text-rotulo font-medium text-tinta-suave bg-superficie border border-fio px-3 py-2 rounded-xl cursor-pointer pointer-coarse:min-h-11"
          >
            <input
              id="agenda-minhas"
              type="checkbox"
              checked={apenasMinhas}
              onChange={(e) => setApenasMinhas(e.target.checked)}
              className="h-4 w-4 accent-[var(--cor-acento-solido)]"
            />
            Somente minhas
          </label>
          {google.estado === "conectada" && (
            <label
              htmlFor="agenda-google"
              className="flex items-center gap-2 text-rotulo font-medium text-tinta-suave bg-superficie border border-fio px-3 py-2 rounded-xl cursor-pointer pointer-coarse:min-h-11"
            >
              <input
                id="agenda-google"
                type="checkbox"
                checked={mostrarGoogle}
                onChange={(e) => setMostrarGoogle(e.target.checked)}
                className="h-4 w-4 accent-[var(--cor-acento-solido)]"
              />
              Google ({google.eventos.length})
            </label>
          )}
          <Botao variante="primario" icone={CalendarPlus} onClick={() => setAgendando(true)}>
            Agendar reunião
          </Botao>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Indicador rotulo="Atrasadas" valor={totalAtrasadas} cor={totalAtrasadas > 0 ? "text-risco" : undefined} />
        <Indicador rotulo="Para hoje" valor={totalHoje} cor="text-acento" />
        <Indicador rotulo="Na agenda do Google" valor={totalEventos} />
      </div>

      {/* A agenda do Google é um ACRÉSCIMO: quando ela falha, a tela continua
          inteira e o aviso fica discreto, ao lado — nunca no lugar da lista. */}
      {google.estado === "indisponivel" && (
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-fio bg-recuo px-3.5 py-2.5">
          <CalendarX className="h-4 w-4 shrink-0 text-tinta-fraca" aria-hidden />
          <p className="text-rotulo text-tinta-suave">
            A agenda do Google não está sendo mostrada: {google.motivo}
          </p>
          {google.precisaReconectar && (
            <a
              href="/api/google/conectar"
              className="foco rounded-lg text-rotulo font-semibold text-acento hover:underline"
            >
              conectar a agenda
            </a>
          )}
        </div>
      )}

      {erro && <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">{erro}</p>}
      {aviso && (
        <p className="text-rotulo font-medium text-alerta bg-alerta-fraco rounded-lg px-3 py-2" role="alert">
          {aviso}
        </p>
      )}

      {grupos.length === 0 && (
        <div className="bg-superficie rounded-2xl border border-fio p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-ok mx-auto mb-2" />
          <p className="text-corpo font-semibold text-tinta">Nenhum passo agendado</p>
          <p className="text-rotulo text-tinta-suave mt-1">
            Abra um negócio, registre a atividade e já agende a próxima ação para ele não sumir do radar.
          </p>
        </div>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.chave} className="bg-superficie rounded-2xl border border-fio shadow-xs overflow-hidden">
          <div
            className={`px-5 py-3 border-b flex items-center gap-2 ${
              grupo.tom === "atrasado"
                ? "bg-risco-fraco border-risco/40"
                : grupo.tom === "hoje"
                  ? "bg-acento-fraco border-fio"
                  : "bg-recuo border-fio"
            }`}
          >
            {grupo.tom === "atrasado" ? (
              <AlertTriangle className="h-4 w-4 text-risco" />
            ) : (
              <Clock className="h-4 w-4 text-acento" />
            )}
            <h2 className="text-corpo font-semibold text-tinta">
              {grupo.titulo} ({grupo.itens.length})
            </h2>
          </div>

          <div className="divide-y divide-fio">
            {grupo.itens.map((item) =>
              item.tipo === "evento" ? (
                <LinhaDoGoogle key={item.chave} evento={item.evento} passou={item.passou} />
              ) : (
                <LinhaDoCrm
                  key={item.chave}
                  a={item.atividade}
                  reagendando={reagendando === item.atividade.id}
                  novaData={novaData}
                  setNovaData={setNovaData}
                  abrirReagendar={() => {
                    setReagendando(item.atividade.id);
                    setNovaData(
                      item.atividade.data_agendada ? paraInputDataHora(new Date(item.atividade.data_agendada)) : "",
                    );
                  }}
                  fecharReagendar={() => setReagendando(null)}
                  salvarReagendar={() => void reagendar(item.atividade.id)}
                  confirmar={() => void confirmar(item.atividade.id)}
                  concluir={() => void concluir(item.atividade.id)}
                />
              ),
            )}
          </div>
        </div>
      ))}

      {/* Montado só quando abre: é o que garante que cada abertura comece com
          o formulário limpo, sem um efeito zerando campo por campo. */}
      {agendando && (
        <AgendarReuniao
          aoFechar={() => setAgendando(false)}
          negocios={negociosAgendaveis}
          aoAgendado={(r) => {
            setAviso(r.aviso);
            void recarregar();
            void buscarGoogle(true);
          }}
        />
      )}
    </div>
  );
}

/**
 * A tarefa do CRM: disco sólido à esquerda e uma faixa de botões à direita.
 * É a forma que diz "isto é seu, e você precisa fazer alguma coisa com isto".
 */
function LinhaDoCrm({
  a,
  reagendando,
  novaData,
  setNovaData,
  abrirReagendar,
  fecharReagendar,
  salvarReagendar,
  confirmar,
  concluir,
}: {
  a: AtividadeAgenda;
  reagendando: boolean;
  novaData: string;
  setNovaData: (v: string) => void;
  abrirReagendar: () => void;
  fecharReagendar: () => void;
  salvarReagendar: () => void;
  confirmar: () => void;
  concluir: () => void;
}) {
  const Icon = ICONES[a.tipo] || MessageSquare;
  const atrasada = estaAtrasada(a.data_agendada);
  const empresa = a.negocio?.contato?.empresa || a.negocio?.contato?.nome || a.negocio?.titulo || "Negócio";

  return (
    <div className="p-4 flex items-start gap-3 flex-wrap sm:flex-nowrap">
      <div
        className={`h-9 w-9 rounded-full text-white flex items-center justify-center shrink-0 ${
          atrasada ? "bg-risco-solido" : "bg-acento-solido"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-corpo font-semibold text-tinta">{a.titulo}</p>
        <p className="text-rotulo text-tinta-suave flex items-center gap-1.5 flex-wrap mt-0.5">
          <span className="font-medium text-tinta-suave">{empresa}</span>
          <span>·</span>
          <span>{ROTULOS_ATIVIDADE[a.tipo] || a.tipo}</span>
          <span>·</span>
          <span className={atrasada ? "font-semibold text-risco" : ""}>
            {formatarDataHora(a.data_agendada)} ({descreverPrazo(a.data_agendada)})
          </span>
          {a.confirmada && (
            <span className="flex items-center gap-1 text-ok font-medium">
              <BadgeCheck className="h-3 w-3" /> confirmada
            </span>
          )}
          {/* A reunião que virou convite de verdade diz isso aqui — é o que
              distingue "marquei na minha lista" de "o cliente foi avisado". */}
          {a.google_evento_id && (
            <span className="flex items-center gap-1 text-acento font-medium">
              <Video className="h-3 w-3" /> convite enviado
            </span>
          )}
        </p>
        {a.negocio?.contato?.telefone && (
          <p className="text-rotulo text-tinta-fraca mt-0.5">{a.negocio.contato.telefone}</p>
        )}

        {reagendando && (
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
                className="px-2 py-1 text-rotulo font-semibold text-acento bg-superficie border border-fio rounded-lg"
              >
                {p.rotulo}
              </button>
            ))}
            <button
              onClick={salvarReagendar}
              disabled={!novaData}
              className="px-2.5 py-1.5 text-rotulo font-semibold text-acento-tinta bg-acento-solido rounded-lg disabled:opacity-50"
            >
              Salvar
            </button>
            <button onClick={fecharReagendar} className="px-2 py-1.5 text-rotulo font-medium text-tinta-suave">
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!a.confirmada && (
          <button
            onClick={confirmar}
            className="text-rotulo font-semibold text-acento hover:bg-acento-fraco px-2 py-1.5 rounded-lg"
          >
            Confirmar
          </button>
        )}
        <button
          onClick={abrirReagendar}
          title="Reagendar"
          className="text-tinta-fraca hover:text-acento p-1.5 rounded-lg"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button onClick={concluir} className="text-rotulo font-semibold text-ok hover:bg-ok-fraco px-2 py-1.5 rounded-lg">
          Concluir
        </button>
        {a.negocio && (
          <Link
            href={`/negocios/${a.negocio.id}?tab=cadencia`}
            className="text-tinta-fraca hover:text-acento p-1.5 rounded-lg"
            title="Abrir negócio"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * O compromisso da agenda: calha de HORA à esquerda, trilho de 2px, e nenhum
 * botão à direita.
 *
 * A forma é o ponto. Se as duas linhas tivessem a mesma silhueta — disco
 * colorido e faixa de botões —, a agenda do Google viraria "mais uma tarefa
 * com outro rótulo", que é exatamente a crítica que a aba de e-mail levou por
 * desenhar e-mail como se fosse WhatsApp. Borradas, estas duas linhas se
 * separam: uma tem coluna de números e um fio vertical, a outra tem um círculo
 * cheio e um bloco de controles.
 *
 * E não há botão porque não há o que fazer: este evento não é nosso, mora na
 * agenda da pessoa. O único destino possível é abri-lo lá.
 */
function LinhaDoGoogle({ evento, passou }: { evento: EventoDaAgenda; passou: boolean }) {
  const inicio = new Date(evento.inicio);
  const duracao = evento.diaInteiro ? null : duracaoCurta(evento.inicio, evento.fim);

  return (
    <div className={`flex items-stretch gap-3 p-4 ${passou ? "opacity-60" : ""}`}>
      <div className="w-14 shrink-0 pt-0.5 text-right">
        <p className="text-corpo font-semibold text-tinta tabular">
          {evento.diaInteiro ? "dia" : HORA.format(inicio)}
        </p>
        {duracao && <p className="text-rotulo text-tinta-fraca tabular">{duracao}</p>}
      </div>

      <div className="w-0.5 shrink-0 rounded-full bg-acento/40" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-corpo font-medium text-tinta">{evento.titulo}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-rotulo text-tinta-suave">
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden /> Google Agenda
          </span>
          {evento.convidados > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3 shrink-0" aria-hidden />
              {evento.convidados} {evento.convidados === 1 ? "convidado" : "convidados"}
            </span>
          )}
          {evento.local && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{evento.local}</span>
            </span>
          )}
          {evento.minhaResposta === "sem_resposta" && (
            <span className="font-medium text-alerta">você ainda não respondeu</span>
          )}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          {evento.meetLink && (
            <a
              href={evento.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="foco inline-flex items-center gap-1 rounded text-rotulo font-semibold text-acento hover:underline"
            >
              <Video className="h-3 w-3" aria-hidden /> entrar no Meet
            </a>
          )}
          {evento.link && (
            <a
              href={evento.link}
              target="_blank"
              rel="noopener noreferrer"
              className="foco inline-flex items-center gap-1 rounded text-rotulo text-tinta-suave hover:text-acento"
            >
              <ExternalLink className="h-3 w-3" aria-hidden /> abrir no Google
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="bg-superficie border border-fio rounded-2xl px-3.5 py-2.5">
      <p className="text-rotulo font-semibold uppercase tracking-wider text-tinta-fraca">{rotulo}</p>
      <p className={`text-titulo font-semibold tabular ${cor || "text-tinta"}`}>{valor}</p>
    </div>
  );
}
