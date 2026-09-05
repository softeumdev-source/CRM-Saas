"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CalendarPlus, CalendarX } from "lucide-react";
import { Botao } from "@/components/ui";
import { AgendarReuniao } from "@/components/agenda/AgendarReuniao";
import type { NegocioAgendavel } from "@/components/agenda/tipos";
import type { EventoDaAgenda } from "@/lib/google/agenda";
import {
  SemanaDaAgenda,
  comoDataLocal,
  inicioDaSemana,
  meiaNoite,
  useMontado,
  useSemanaInteira,
} from "@/components/agenda/SemanaDaAgenda";

const UM_DIA_MS = 86_400_000;

/** Teto da recarga automática ao voltar para a aba. */
const INTERVALO_GOOGLE_MS = 120_000;

type EstadoDoGoogle =
  | { estado: "carregando" }
  | { estado: "conectada"; eventos: EventoDaAgenda[] }
  | { estado: "indisponivel"; motivo: string; precisaReconectar: boolean };

/**
 * A Agenda mostra A AGENDA — e nada além dela.
 *
 * Esta tela já foi uma lista mista: os próximos passos do CRM (ligar, mandar
 * e-mail, uma nota interna com data) empilhados junto dos compromissos do
 * Google. Medido no banco no dia em que isto mudou: das sete atividades
 * agendadas em aberto, SEIS eram `nota` e ZERO eram `reuniao`. Uma tela
 * chamada Agenda que mostrava seis lembretes e nenhuma reunião.
 *
 * Agora ela é a semana do Google, e só. O follow-up atrasado não se perde:
 * cada coluna do kanban conta os seus em vermelho, e o card do negócio mostra
 * o próximo passo com os botões de concluir e reagendar. É lá que esse
 * trabalho acontece — aqui ele só fazia barulho.
 */
export function AgendaClient({
  negociosAgendaveis = [],
  vendedor,
}: {
  /** Negócios abertos e visíveis, para o seletor do agendamento. */
  negociosAgendaveis?: NegocioAgendavel[];
  /**
   * Quem assina o convite de reunião — o nome da caixa comercial
   * (`tenants.caixa_email_nome`), e não o de quem clicou em agendar. Mesma
   * fonte do `From:` do e-mail: o cliente conhece uma pessoa só.
   */
  vendedor: string;
}) {
  const montado = useMontado();
  const semanaInteira = useSemanaInteira();
  /**
   * O dia escolhido, como `AAAA-MM-DD`. `null` = "a semana de hoje".
   *
   * String e não `Date` porque é o que vai e volta da URL sem ambiguidade de
   * fuso — o mesmo motivo de `comoDataLocal` existir.
   */
  const [dia, setDia] = useState<string | null>(null);
  const [google, setGoogle] = useState<EstadoDoGoogle>({ estado: "carregando" });
  /** Verdadeiro durante QUALQUER busca, não só a primeira. Ver `buscarGoogle`. */
  const [buscando, setBuscando] = useState(true);
  const [agendando, setAgendando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  /** Sete dias no desktop, três no celular — a grade continua grade. */
  const quantosDias = semanaInteira ? 7 : 3;

  /**
   * A semana só existe DEPOIS de montar, e isso não é preciosismo.
   *
   * O servidor roda em UTC e o navegador no fuso de quem olha. Num sábado às
   * 21h de Brasília já é domingo em UTC — os dois lados calculariam semanas
   * diferentes e a hidratação divergiria numa tela que é toda data. Enquanto
   * `montado` é falso a grade não desenha, e é honesto: sem o Google
   * respondido não há o que desenhar mesmo.
   */
  const inicio = useMemo(() => {
    if (!montado) return null;
    // A semana pedida pela URL, na primeira pintura; depois, a que a pessoa
    // escolheu. Ler `location` aqui é seguro porque `montado` já garante que
    // isto só roda no navegador.
    const daUrl = dia ?? new URLSearchParams(window.location.search).get("semana");
    const base = daUrl ? new Date(`${daUrl}T00:00:00`) : new Date();
    const valida = Number.isNaN(base.getTime()) ? new Date() : base;
    // No desktop a grade é sempre domingo→sábado; no celular ela começa no dia
    // escolhido, senão as setas de 3 em 3 nunca sairiam do começo da semana.
    return semanaInteira ? inicioDaSemana(valida) : meiaNoite(valida);
  }, [montado, dia, semanaInteira]);

  /**
   * A semana mora na URL.
   *
   * Sem isso, recarregar a página, voltar do modal de agendamento ou mandar o
   * link para alguém devolvia sempre a semana atual — e não havia como apontar
   * para uma semana específica. `replaceState` e não `router.push`: trocar de
   * semana não é navegar, e empilhar histórico faria o "voltar" do navegador
   * andar semana a semana.
   */
  useEffect(() => {
    if (!inicio) return;
    const url = new URL(window.location.href);
    url.searchParams.set("semana", comoDataLocal(inicio));
    window.history.replaceState(null, "", url);
  }, [inicio]);

  const naSemanaAtual = useMemo(() => {
    if (!inicio || !montado) return false;
    const agora = semanaInteira ? inicioDaSemana(new Date()) : meiaNoite(new Date());
    return agora.getTime() === inicio.getTime();
  }, [inicio, montado, semanaInteira]);

  const andar = (passos: number) => {
    if (!inicio) return;
    setDia(comoDataLocal(new Date(inicio.getTime() + passos * quantosDias * UM_DIA_MS)));
  };

  /**
   * A agenda do Google fica FORA do `useSincronizacao` de propósito.
   *
   * Aquele gancho recarrega a cada 8 s quando o websocket não sobe, e é o certo
   * para o nosso banco. Bater na Google nesse ritmo seria queimar cota da conta
   * de alguém para redesenhar uma grade que muda algumas vezes por dia. Aqui a
   * recarga é: ao montar, ao TROCAR DE SEMANA, ao voltar para a aba (no máximo
   * de dois em dois minutos) e depois de agendar.
   */
  const ultimaBusca = useRef(0);
  const buscarGoogle = useCallback(async (de: Date, dias: number, forcar = false) => {
    if (!forcar && Date.now() - ultimaBusca.current < INTERVALO_GOOGLE_MS) return;
    ultimaBusca.current = Date.now();
    // `buscando` cobre TODA busca. O `carregando` de antes era
    // `google.estado === "carregando"`, que só é verdade antes da PRIMEIRA
    // resposta: trocar de semana esvaziava a lista e desenhava a grade vazia,
    // sem uma palavra, até a Google responder. Parecia que não havia reuniões.
    setBuscando(true);
    try {
      const resp = await fetch(`/api/google/eventos?de=${comoDataLocal(de)}&dias=${dias}`);
      const dados = await resp.json();
      if (dados?.conectado) setGoogle({ estado: "conectada", eventos: dados.eventos || [] });
      else
        setGoogle({
          estado: "indisponivel",
          motivo: dados?.motivo || "Agenda do Google indisponível.",
          precisaReconectar: !!dados?.precisaReconectar,
        });
    } catch {
      setGoogle({
        estado: "indisponivel",
        motivo: "Não foi possível falar com a Google.",
        precisaReconectar: false,
      });
    } finally {
      setBuscando(false);
    }
  }, []);

  // A regra `set-state-in-effect` acusa qualquer efeito que chame função que
  // mexe em estado, mesmo quando TODO `setState` acontece depois de um `await`
  // — medido com uma sonda: a busca assíncrona é acusada igual à atribuição
  // síncrona. `buscarGoogle` só escreve quando a Google responde, e buscar
  // dado ao montar é o que efeito serve para fazer.
  useEffect(() => {
    if (!inicio) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscarGoogle(inicio, quantosDias, true);
    const aoVoltar = () => {
      if (!document.hidden) void buscarGoogle(inicio, quantosDias);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [buscarGoogle, inicio, quantosDias]);

  const eventos = google.estado === "conectada" ? google.eventos : [];

  return (
    // `max-w-pagina` e nao `max-w-6xl`: era a unica tela do sistema com um
    // container proprio. Medido a 1790px, `6xl` dava 1102px de grade e 150px
    // por coluna de dia — e "Softeum x Casa do Parafuso — apresentacao da
    // plataforma" precisa de 350px, entao aparecia UM TERCO do titulo. No
    // container da pagina cada coluna vai a ~228px pelo mesmo aluguel de tela
    // que o board e a Lista ja pagam.
    <div className="max-w-pagina mx-auto w-full px-4 sm:px-6 py-6 flex flex-col flex-1 min-h-0 gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-titulo font-semibold text-tinta flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-acento" /> Agenda
          </h1>
          <p className="text-rotulo text-tinta-suave">
            As reuniões da sua agenda do Google, na semana.
          </p>
        </div>
        <Botao variante="primario" icone={CalendarPlus} onClick={() => setAgendando(true)}>
          Agendar reunião
        </Botao>
      </div>

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

      {aviso && (
        <p className="text-rotulo font-medium text-alerta bg-alerta-fraco rounded-lg px-3 py-2" role="alert">
          {aviso}
        </p>
      )}

      {inicio ? (
        <SemanaDaAgenda
          eventos={eventos}
          inicio={inicio}
          quantosDias={quantosDias}
          carregando={buscando}
          naSemanaAtual={naSemanaAtual}
          onAnterior={() => andar(-1)}
          onSeguinte={() => andar(1)}
          onHoje={() => setDia(null)}
          onEscolherData={setDia}
        />
      ) : (
        <div className="flex-1 min-h-96 rounded-2xl border border-fio bg-superficie" aria-hidden />
      )}

      {/* Montado só quando abre: é o que garante que cada abertura comece com
          o formulário limpo, sem um efeito zerando campo por campo. */}
      {agendando && (
        <AgendarReuniao
          aoFechar={() => setAgendando(false)}
          negocios={negociosAgendaveis}
          vendedor={vendedor}
          aoAgendado={(r) => {
            setAviso(r.aviso);
            if (inicio) void buscarGoogle(inicio, quantosDias, true);
          }}
        />
      )}
    </div>
  );
}
