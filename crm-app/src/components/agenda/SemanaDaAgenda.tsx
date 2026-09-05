"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, MapPin, Users, Video } from "lucide-react";
import type { EventoDaAgenda } from "@/lib/google/agenda";

const UM_DIA_MS = 86_400_000;

/**
 * A altura de uma hora, em pixels.
 *
 * Era 52, e com a faixa padrão de 8h→19h isso dava 572px de grade mais ~57 de
 * cabeçalho. O shell do dashboard é `h-screen overflow-hidden` e a página não
 * rola para compensar, então num laptop de 13" (com o banner do Google visível,
 * ~523px disponíveis) o dia terminava cortado no meio de uma hora, tendo como
 * única pista uma barra de rolagem interna. Com 44 a mesma faixa ocupa 484px e
 * cabe inteira — que é o que "não ficar cortado" quer dizer aqui.
 */
const ALTURA_DA_HORA = 44;

/** Largura da coluna de horas. Cabe "00:00" a 12px sem apertar. */
const COLUNA_DAS_HORAS = 52;

/** Abaixo desta altura o evento não comporta duas linhas: hora vai junto do título. */
const ALTURA_DE_DUAS_LINHAS = 40;

/** Primeira e última hora que a grade desenha quando ninguém tem nada fora delas. */
const HORA_INICIAL_PADRAO = 8;
const HORA_FINAL_PADRAO = 19;

const DIAS_CURTOS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const HORA_MIN = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });
const SO_DIA = new Intl.DateTimeFormat("pt-BR", { day: "numeric" });

/** Domingo 00:00 da semana em que a data cai. */
export function inicioDaSemana(d: Date): Date {
  const inicio = new Date(d);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - inicio.getDay());
  return inicio;
}

/** A mesma data, à meia-noite local. */
export function meiaNoite(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** `AAAA-MM-DD` em hora LOCAL — `toISOString()` daria o dia errado à noite. */
export function comoDataLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Só depois de montar.
 *
 * A grade inteira depende de QUE HORAS SÃO, e o servidor roda em UTC enquanto o
 * navegador roda no fuso de quem olha. Às 22h de Brasília o servidor já está no
 * dia seguinte — renderizar a semana nos dois lados daria hidratação divergente
 * num componente que é toda ele data. `useSyncExternalStore` com instantâneo de
 * servidor distinto é o jeito que o projeto já usa para isso, e não é
 * `setState` dentro de efeito.
 */
const semAssinatura = () => () => {};
export function useMontado(): boolean {
  return useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  );
}

/**
 * Cabe a semana inteira, ou só três dias?
 *
 * Mesmo mecanismo do `useMontado`, e pelo mesmo motivo: a largura é uma coisa do
 * navegador, e ler `window` no render do servidor divergiria. O instantâneo do
 * servidor é `true` (desktop), que é onde a maioria abre o CRM — assim a
 * primeira pintura do desktop já sai certa e só o celular ajusta.
 *
 * Três dias e não uma lista: a grade continua sendo grade, com as horas do lado.
 * Num telefone de 390px, sete colunas dariam 43px cada — nem o dia caberia.
 */
const CONSULTA_LARGURA = "(min-width: 768px)";
function assinarLargura(aoMudar: () => void) {
  const mq = window.matchMedia(CONSULTA_LARGURA);
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}
export function useSemanaInteira(): boolean {
  return useSyncExternalStore(
    assinarLargura,
    () => window.matchMedia(CONSULTA_LARGURA).matches,
    () => true,
  );
}

type Posicionado = {
  evento: EventoDaAgenda;
  topo: number;
  altura: number;
  coluna: number;
  colunas: number;
};

/**
 * Reparte em colunas os eventos que se sobrepõem no mesmo dia.
 *
 * Sem isto, duas reuniões das 14h ficariam uma EM CIMA da outra e a de baixo
 * sumiria — que é pior do que não mostrar, porque a tela afirma que só existe
 * uma. Cada grupo de eventos encavalados divide a largura em partes iguais.
 *
 * A DURAÇÃO é a real. Antes havia um `Math.max(30, …)` que desenhava uma reunião
 * de 15 minutos como se fosse de 30: o bloco ocupava o dobro do tempo que a
 * reunião ocupa, e a agenda mentia sobre o buraco seguinte. Bloco pequeno demais
 * para ler é problema de RENDERIZAÇÃO, e se resolve lá — com piso de altura e
 * hora na mesma linha do título —, não inventando meia hora que não existe.
 *
 * O `alturaTotal` apara o que passaria do fim do dia: um evento de dois dias
 * viraria uma caixa de 2.500px dentro de uma coluna de 484, transbordando para
 * fora dela e inflando a área de rolagem.
 */
function posicionar(
  eventos: EventoDaAgenda[],
  horaBase: number,
  alturaTotal: number,
): Posicionado[] {
  const ordenados = [...eventos].sort(
    (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
  );

  const grupos: EventoDaAgenda[][] = [];
  let atual: EventoDaAgenda[] = [];
  let fimDoGrupo = 0;

  for (const e of ordenados) {
    const inicio = new Date(e.inicio).getTime();
    const fim = new Date(e.fim).getTime();
    if (atual.length > 0 && inicio < fimDoGrupo) {
      atual.push(e);
      fimDoGrupo = Math.max(fimDoGrupo, fim);
    } else {
      if (atual.length) grupos.push(atual);
      atual = [e];
      fimDoGrupo = fim;
    }
  }
  if (atual.length) grupos.push(atual);

  const saida: Posicionado[] = [];
  for (const grupo of grupos) {
    grupo.forEach((evento, i) => {
      const inicio = new Date(evento.inicio);
      const fim = new Date(evento.fim);
      const minutosDoInicio = inicio.getHours() * 60 + inicio.getMinutes() - horaBase * 60;
      const duracao = (fim.getTime() - inicio.getTime()) / 60_000;
      const topo = Math.max(0, (minutosDoInicio / 60) * ALTURA_DA_HORA);
      saida.push({
        evento,
        topo,
        altura: Math.min((duracao / 60) * ALTURA_DA_HORA, alturaTotal - topo),
        coluna: i,
        colunas: grupo.length,
      });
    });
  }
  return saida;
}

/**
 * "1 – 7 de setembro" · "31 de agosto – 6 de setembro" · "29 de dez de 2025 – 4 de jan de 2026".
 *
 * O rótulo era só o mês, tirado de `dias[3]` — a QUARTA-FEIRA. Numa semana que
 * cruza o mês, 31/ago a 6/set, ele dizia "setembro" e sumia com a informação de
 * que a semana começa em agosto. Aqui os dois extremos aparecem, e o mês só se
 * repete quando de fato muda.
 */
function intervalo(primeiro: Date, ultimo: Date): string {
  const mesmoAno = primeiro.getFullYear() === ultimo.getFullYear();
  const mesmoMes = mesmoAno && primeiro.getMonth() === ultimo.getMonth();
  const ano = (d: Date) => ` de ${d.getFullYear()}`;

  if (mesmoMes) {
    return `${SO_DIA.format(primeiro)} – ${DIA_E_MES.format(ultimo)}${
      ultimo.getFullYear() === new Date().getFullYear() ? "" : ano(ultimo)
    }`;
  }
  const esquerda = DIA_E_MES.format(primeiro) + (mesmoAno ? "" : ano(primeiro));
  return `${esquerda} – ${DIA_E_MES.format(ultimo)}${
    mesmoAno && ultimo.getFullYear() === new Date().getFullYear() ? "" : ano(ultimo)
  }`;
}

const BOTAO_NAV =
  "foco inline-flex items-center justify-center rounded-lg text-tinta-suave transition-colors duration-150 ease-out hover:bg-recuo hover:text-tinta disabled:opacity-40 disabled:hover:bg-transparent p-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11";

export function SemanaDaAgenda({
  eventos,
  inicio,
  quantosDias,
  onAnterior,
  onSeguinte,
  onHoje,
  onEscolherData,
  naSemanaAtual,
  carregando,
}: {
  eventos: EventoDaAgenda[];
  /** Primeiro dia desenhado — domingo no desktop, o dia escolhido no celular. */
  inicio: Date;
  quantosDias: number;
  onAnterior: () => void;
  onSeguinte: () => void;
  onHoje: () => void;
  onEscolherData: (dia: string) => void;
  naSemanaAtual: boolean;
  carregando?: boolean;
}) {
  const montado = useMontado();
  const rolagem = useRef<HTMLDivElement>(null);

  const dias = useMemo(
    () => Array.from({ length: quantosDias }, (_, i) => new Date(inicio.getTime() + i * UM_DIA_MS)),
    [inicio, quantosDias],
  );

  const { comHora, diaInteiro } = useMemo(() => {
    const fim = inicio.getTime() + quantosDias * UM_DIA_MS;
    const dentro = eventos.filter((e) => {
      const t = new Date(e.inicio).getTime();
      return t >= inicio.getTime() && t < fim;
    });
    return {
      comHora: dentro.filter((e) => !e.diaInteiro),
      diaInteiro: dentro.filter((e) => e.diaInteiro),
    };
  }, [eventos, inicio, quantosDias]);

  // A faixa segue os eventos: uma grade de 00h às 23h seria quase toda vazia, e
  // a reunião das 14h ficaria perdida no meio de nada.
  const { horaInicial, horaFinal } = useMemo(() => {
    let min = HORA_INICIAL_PADRAO;
    let max = HORA_FINAL_PADRAO;
    for (const e of comHora) {
      min = Math.min(min, new Date(e.inicio).getHours());
      const f = new Date(e.fim);
      max = Math.max(max, f.getMinutes() > 0 ? f.getHours() + 1 : f.getHours());
    }
    return { horaInicial: Math.max(0, min), horaFinal: Math.min(24, Math.max(max, min + 4)) };
  }, [comHora]);

  const horas = useMemo(
    () => Array.from({ length: horaFinal - horaInicial }, (_, i) => horaInicial + i),
    [horaInicial, horaFinal],
  );
  const alturaTotal = horas.length * ALTURA_DA_HORA;

  /**
   * Rola até o horário comercial quando a faixa cresceu para trás.
   *
   * A faixa se estica para caber um evento das 6h, e sem isto a grade abriria
   * mostrando três horas vazias enquanto o dia de trabalho fica fora da vista.
   * É rolagem de um `ref`, não estado — nada re-renderiza por causa disto.
   */
  useEffect(() => {
    const caixa = rolagem.current;
    if (!caixa || horaInicial >= HORA_INICIAL_PADRAO) return;
    caixa.scrollTop = (HORA_INICIAL_PADRAO - horaInicial) * ALTURA_DA_HORA;
  }, [horaInicial, inicio]);

  const hoje = montado ? new Date() : null;
  const colunas = `${COLUNA_DAS_HORAS}px repeat(${dias.length}, minmax(0, 1fr))`;
  const vazia = comHora.length === 0 && diaInteiro.length === 0;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={onAnterior} aria-label="Período anterior" className={BOTAO_NAV}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={onHoje}
            disabled={naSemanaAtual}
            className="foco px-3 py-2 text-rotulo font-medium text-tinta-suave border border-fio rounded-lg transition-colors duration-150 ease-out hover:text-acento hover:border-fio-forte disabled:opacity-40 disabled:hover:text-tinta-suave disabled:hover:border-fio pointer-coarse:min-h-11"
          >
            Hoje
          </button>
          <button onClick={onSeguinte} aria-label="Próximo período" className={BOTAO_NAV}>
            <ChevronRight className="h-4 w-4" />
          </button>
          {/* O intervalo por extenso, e um seletor de data ao lado: sem ele,
              chegar a uma semana de três meses adiante custava doze cliques. */}
          <span className="ml-2 text-corpo font-medium text-tinta first-letter:capitalize">
            {intervalo(dias[0], dias[dias.length - 1])}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {carregando && <span className="text-rotulo text-tinta-fraca">Carregando…</span>}
          <label className="flex items-center gap-1.5 text-rotulo text-tinta-suave">
            <CalendarRange className="h-4 w-4 text-tinta-fraca" aria-hidden />
            <span className="sr-only">Ir para a data</span>
            <input
              type="date"
              value={comoDataLocal(inicio)}
              onChange={(e) => e.target.value && onEscolherData(e.target.value)}
              className="foco rounded-lg border border-fio bg-superficie px-2 py-1.5 text-rotulo text-tinta pointer-coarse:min-h-11"
            />
          </label>
        </div>
      </div>

      {vazia && !carregando && (
        <p className="mb-2 text-rotulo text-tinta-suave">
          Nenhuma reunião neste período. As horas livres abaixo são todas suas.
        </p>
      )}

      <div
        ref={rolagem}
        className="flex-1 min-h-0 overflow-y-auto border border-fio rounded-2xl bg-superficie"
      >
        {/* Cabeçalho e faixa de dia inteiro dentro de UM `sticky` só.
            `z-20` contra o `z-10` da linha do agora, que antes empatava e
            pintava o traço vermelho por cima do cabeçalho. E um contêiner em vez
            de dois `sticky` empilhados porque o segundo precisaria saber a
            altura do primeiro — um `top-[57px]` que o `DESIGN.md` proíbe e que
            quebraria no dia em que o cabeçalho mudasse de altura. */}
        <div className="sticky top-0 z-20 bg-superficie">
        <div
          className="grid border-b border-fio"
          style={{ gridTemplateColumns: colunas }}
        >
          <div />
          {dias.map((d) => {
            const ehHoje = hoje != null && d.toDateString() === hoje.toDateString();
            return (
              <div key={d.toISOString()} className="py-2 text-center border-l border-fio">
                <div className="text-rotulo font-medium uppercase tracking-wide text-tinta-fraca">
                  {DIAS_CURTOS[d.getDay()]}
                </div>
                <div
                  className={
                    ehHoje
                      ? "mx-auto mt-0.5 h-7 w-7 flex items-center justify-center rounded-full bg-acento-solido text-acento-tinta text-corpo font-semibold tabular"
                      : "mt-0.5 text-corpo font-medium text-tinta tabular"
                  }
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Faixa de dia inteiro — só aparece quando existe algo nela. */}
        {diaInteiro.length > 0 && (
          <div
            className="grid border-b border-fio"
            style={{ gridTemplateColumns: colunas }}
          >
            <div className="py-1.5 pr-2 text-right text-rotulo text-tinta-fraca">dia</div>
            {dias.map((d) => (
              <div key={d.toISOString()} className="border-l border-fio p-1 space-y-1">
                {diaInteiro
                  .filter((e) => new Date(e.inicio).toDateString() === d.toDateString())
                  .map((e) => (
                    <a
                      key={e.id}
                      href={e.link ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={e.titulo}
                      className="foco block px-1.5 py-0.5 rounded bg-acento-fraco text-acento text-rotulo font-medium truncate"
                    >
                      {e.titulo}
                    </a>
                  ))}
              </div>
            ))}
          </div>
        )}
        </div>

        <div className="grid" style={{ gridTemplateColumns: colunas }}>
          <div>
            {horas.map((h, i) => (
              <div key={h} style={{ height: ALTURA_DA_HORA }} className="relative">
                {/* A PRIMEIRA hora não sobe. Ela subia junto com as outras e ia
                    parar atrás do cabeçalho `sticky`, que pinta por cima: metade
                    do primeiro horário da grade ficava permanentemente
                    escondida. */}
                <span
                  className={`absolute right-2 text-rotulo text-tinta-fraca tabular ${
                    i === 0 ? "top-0.5" : "-top-2"
                  }`}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {dias.map((d) => {
            const doDia = comHora.filter(
              (e) => new Date(e.inicio).toDateString() === d.toDateString(),
            );
            const postos = posicionar(doDia, horaInicial, alturaTotal);
            const ehHoje = hoje != null && d.toDateString() === hoje.toDateString();
            const minutosAgora = hoje ? hoje.getHours() * 60 + hoje.getMinutes() : 0;
            const topoDoAgora = ((minutosAgora - horaInicial * 60) / 60) * ALTURA_DA_HORA;
            const mostrarAgora = ehHoje && topoDoAgora >= 0 && topoDoAgora <= alturaTotal;

            return (
              <div key={d.toISOString()} className="relative border-l border-fio">
                {horas.map((h) => (
                  <div key={h} style={{ height: ALTURA_DA_HORA }} className="border-b border-fio/60" />
                ))}

                {mostrarAgora && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{ top: topoDoAgora }}
                    aria-hidden
                  >
                    <div className="h-px bg-risco" />
                    <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-risco" />
                  </div>
                )}

                {postos.map(({ evento, topo, altura, coluna, colunas: qtd }) => {
                  const hora = HORA_MIN.format(new Date(evento.inicio));
                  const cabeDuasLinhas = altura >= ALTURA_DE_DUAS_LINHAS;
                  return (
                    <a
                      key={evento.id}
                      href={evento.link ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${hora}, ${evento.titulo}`}
                      title={`${hora} · ${evento.titulo}`}
                      style={{
                        top: topo,
                        height: Math.max(altura, 20),
                        left: `calc(${(coluna / qtd) * 100}% + 2px)`,
                        width: `calc(${100 / qtd}% - 4px)`,
                      }}
                      className="foco absolute overflow-hidden rounded-lg border-l-2 border-acento bg-acento-fraco px-1.5 py-0.5 transition-colors duration-150 ease-out hover:bg-acento-fraco/70"
                    >
                      {/* A HORA APARECE SEMPRE. Ela só saía quando o bloco tinha
                          mais de 34px, ou seja: sumia em toda reunião de 15 e de
                          30 minutos — justo as que mais precisam dizer a que
                          horas são. Sem espaço para duas linhas, ela entra na
                          mesma linha do título. */}
                      {cabeDuasLinhas ? (
                        <>
                          <div className="text-rotulo font-medium text-acento leading-tight truncate">
                            {evento.titulo}
                          </div>
                          <div className="text-rotulo text-tinta-suave leading-tight truncate">
                            {hora}
                            {evento.meetLink && <Video className="inline h-3 w-3 ml-1 -mt-0.5" />}
                            {!evento.meetLink && evento.local && (
                              <MapPin className="inline h-3 w-3 ml-1 -mt-0.5" />
                            )}
                            {evento.convidados > 0 && (
                              <span className="ml-1">
                                <Users className="inline h-3 w-3 -mt-0.5" /> {evento.convidados}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="text-rotulo leading-tight truncate">
                          <span className="text-tinta-suave tabular">{hora}</span>{" "}
                          <span className="font-semibold text-acento">{evento.titulo}</span>
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
