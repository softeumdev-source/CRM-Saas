"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Video, MapPin, Users } from "lucide-react";
import type { EventoDaAgenda } from "@/lib/google/agenda";

const UM_DIA_MS = 86_400_000;
const ALTURA_DA_HORA = 52;

/** Primeira hora e última hora que a grade desenha quando a semana é vazia. */
const HORA_INICIAL_PADRAO = 8;
const HORA_FINAL_PADRAO = 19;

const DIAS_CURTOS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const HORA_MIN = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Domingo 00:00 da semana em que a data cai. */
export function inicioDaSemana(d: Date): Date {
  const inicio = new Date(d);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - inicio.getDay());
  return inicio;
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
 */
function posicionar(eventos: EventoDaAgenda[], horaBase: number): Posicionado[] {
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
      const duracao = Math.max(30, (fim.getTime() - inicio.getTime()) / 60_000);
      saida.push({
        evento,
        topo: (minutosDoInicio / 60) * ALTURA_DA_HORA,
        altura: (duracao / 60) * ALTURA_DA_HORA,
        coluna: i,
        colunas: grupo.length,
      });
    });
  }
  return saida;
}

export function SemanaDaAgenda({
  eventos,
  inicio,
  onSemanaAnterior,
  onSemanaSeguinte,
  onHoje,
  carregando,
}: {
  eventos: EventoDaAgenda[];
  /** Domingo 00:00 da semana desenhada. */
  inicio: Date;
  onSemanaAnterior: () => void;
  onSemanaSeguinte: () => void;
  onHoje: () => void;
  carregando?: boolean;
}) {
  const montado = useMontado();

  const dias = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(inicio.getTime() + i * UM_DIA_MS)),
    [inicio],
  );

  const { comHora, diaInteiro } = useMemo(() => {
    const fimDaSemana = inicio.getTime() + 7 * UM_DIA_MS;
    const dentro = eventos.filter((e) => {
      const t = new Date(e.inicio).getTime();
      return t >= inicio.getTime() && t < fimDaSemana;
    });
    return {
      comHora: dentro.filter((e) => !e.diaInteiro),
      diaInteiro: dentro.filter((e) => e.diaInteiro),
    };
  }, [eventos, inicio]);

  // A faixa de horas segue os eventos: uma grade de 00h às 23h seria quase toda
  // vazia, e a reunião das 14h ficaria perdida no meio de nada.
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

  const hoje = montado ? new Date() : null;
  const rotuloDoMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    dias[3],
  );

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={onSemanaAnterior}
            aria-label="Semana anterior"
            className="p-1.5 rounded-lg text-tinta-suave hover:text-tinta hover:bg-recuo transition-colors duration-150 ease-out"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={onHoje}
            className="px-3 py-1.5 text-rotulo font-semibold text-tinta-suave hover:text-acento border border-fio rounded-lg transition-colors duration-150 ease-out"
          >
            Hoje
          </button>
          <button
            onClick={onSemanaSeguinte}
            aria-label="Próxima semana"
            className="p-1.5 rounded-lg text-tinta-suave hover:text-tinta hover:bg-recuo transition-colors duration-150 ease-out"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-corpo font-medium text-tinta capitalize">{rotuloDoMes}</span>
        </div>
        {carregando && <span className="text-rotulo text-tinta-fraca">Carregando…</span>}
      </div>

      <div className="flex-1 min-h-0 overflow-auto border border-fio rounded-2xl bg-superficie">
        <div className="min-w-[720px]">
          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)] sticky top-0 z-10 bg-superficie border-b border-fio">
            <div />
            {dias.map((d) => {
              const ehHoje = hoje != null && d.toDateString() === hoje.toDateString();
              return (
                <div key={d.toISOString()} className="py-2 text-center border-l border-fio">
                  <div className="text-rotulo font-semibold uppercase tracking-wide text-tinta-fraca">
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

          {/* Faixa de dia inteiro — só aparece quando existe algo nela */}
          {diaInteiro.length > 0 && (
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-fio">
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
                        className="block px-1.5 py-0.5 rounded bg-acento-fraco text-acento text-rotulo font-medium truncate"
                      >
                        {e.titulo}
                      </a>
                    ))}
                </div>
              ))}
            </div>
          )}

          {/* A grade */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)]">
            <div>
              {horas.map((h) => (
                <div
                  key={h}
                  style={{ height: ALTURA_DA_HORA }}
                  className="pr-2 text-right text-rotulo text-tinta-fraca tabular -translate-y-2"
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {dias.map((d) => {
              const doDia = comHora.filter(
                (e) => new Date(e.inicio).toDateString() === d.toDateString(),
              );
              const postos = posicionar(doDia, horaInicial);
              const ehHoje = hoje != null && d.toDateString() === hoje.toDateString();
              const minutosAgora = hoje ? hoje.getHours() * 60 + hoje.getMinutes() : 0;
              const topoDoAgora = ((minutosAgora - horaInicial * 60) / 60) * ALTURA_DA_HORA;
              const mostrarAgora =
                ehHoje && topoDoAgora >= 0 && topoDoAgora <= horas.length * ALTURA_DA_HORA;

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

                  {postos.map(({ evento, topo, altura, coluna, colunas }) => (
                    <a
                      key={evento.id}
                      href={evento.link ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${HORA_MIN.format(new Date(evento.inicio))} · ${evento.titulo}`}
                      style={{
                        top: topo,
                        height: Math.max(altura, 22),
                        left: `calc(${(coluna / colunas) * 100}% + 2px)`,
                        width: `calc(${100 / colunas}% - 4px)`,
                      }}
                      className="absolute overflow-hidden rounded-lg border-l-2 border-acento bg-acento-fraco px-1.5 py-1 hover:bg-acento-fraco/80 transition-colors duration-150 ease-out"
                    >
                      <div className="text-rotulo font-semibold text-acento leading-tight truncate">
                        {evento.titulo}
                      </div>
                      {altura > 34 && (
                        <div className="text-rotulo text-tinta-suave leading-tight truncate">
                          {HORA_MIN.format(new Date(evento.inicio))}
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
                      )}
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
