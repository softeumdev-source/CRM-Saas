"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CalendarCheck2,
  ChevronRight,
  FileText,
  Mail,
  MessageSquare,
  PhoneCall,
  RotateCcw,
  Users,
  Video,
} from "lucide-react";
import clsx from "clsx";
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
import { Alerta, Button, Cartao, Input, Rotulo, Segmentado, Vazio } from "@/components/ui";

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

type Grupo = { chave: string; titulo: string; itens: AtividadeAgenda[]; atrasado: boolean };

export function AgendaClient({
  atividadesIniciais,
  usuarioAtual,
}: {
  atividadesIniciais: AtividadeAgenda[];
  usuarioAtual: Usuario;
}) {
  const [atividades, setAtividades] = useEstadoDaProp(atividadesIniciais);
  const [apenasMinhas, setApenasMinhas] = useState(usuarioAtual.role !== "admin");
  const [reagendando, setReagendando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");
  const [erro, setErro] = useState<string | null>(null);

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

  const visiveis = useMemo(
    () =>
      atividades.filter(
        (a) => !apenasMinhas || a.usuario_id === usuarioAtual.id || a.negocio?.responsavel_id === usuarioAtual.id,
      ),
    [atividades, apenasMinhas, usuarioAtual.id],
  );

  const grupos: Grupo[] = useMemo(() => {
    const agora = new Date();
    const fimSemana = new Date(agora.getTime() + 7 * UM_DIA_MS);
    const atrasadas: AtividadeAgenda[] = [];
    const hoje: AtividadeAgenda[] = [];
    const semana: AtividadeAgenda[] = [];
    const depois: AtividadeAgenda[] = [];

    for (const a of visiveis) {
      if (estaAtrasada(a.data_agendada, agora) && !ehHoje(a.data_agendada, agora)) atrasadas.push(a);
      else if (ehHoje(a.data_agendada, agora)) hoje.push(a);
      else if (a.data_agendada && new Date(a.data_agendada) <= fimSemana) semana.push(a);
      else depois.push(a);
    }

    return [
      { chave: "atrasadas", titulo: "Atrasadas", itens: atrasadas, atrasado: true },
      { chave: "hoje", titulo: "Hoje", itens: hoje, atrasado: false },
      { chave: "semana", titulo: "Próximos 7 dias", itens: semana, atrasado: false },
      { chave: "depois", titulo: "Mais adiante", itens: depois, atrasado: false },
    ].filter((g) => g.itens.length > 0);
  }, [visiveis]);

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

  const atrasadas = grupos.find((g) => g.chave === "atrasadas")?.itens.length ?? 0;
  const hoje = grupos.find((g) => g.chave === "hoje")?.itens.length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-serif text-display text-tinta">Agenda</h1>
          {/* Os tres cartoes de indicador sairam: os mesmos numeros ja estao no
              titulo de cada grupo, e ali eles dizem onde clicar. */}
          <p className="text-corpo-lg tabular-nums text-tinta-suave">
            {visiveis.length} {visiveis.length === 1 ? "passo agendado" : "passos agendados"}
            {atrasadas > 0 && <span className="text-rose-700"> · {atrasadas} atrasados</span>}
            {hoje > 0 && <span className="text-emerald-700"> · {hoje} para hoje</span>}
          </p>
        </div>

        <Segmentado
          rotulo="Filtrar por responsável"
          valor={apenasMinhas ? "minhas" : "todas"}
          aoTrocar={(v) => setApenasMinhas(v === "minhas")}
          opcoes={[
            { chave: "minhas" as const, label: "Minhas" },
            { chave: "todas" as const, label: "Todas" },
          ]}
        />
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      {grupos.length === 0 && (
        <Cartao className="p-0">
          <Vazio
            icone={CalendarCheck2}
            titulo="Nenhum passo agendado"
            descricao="Abra um negócio, registre a atividade e já agende a próxima ação para ele não sumir do radar."
          />
        </Cartao>
      )}

      {grupos.map((grupo) => (
        <section key={grupo.chave} className="flex flex-col gap-2">
          <Rotulo tom={grupo.atrasado ? "perigo" : "fraco"}>
            {grupo.titulo} · {grupo.itens.length}
          </Rotulo>

          <Cartao className="flex flex-col p-0">
            {grupo.itens.map((a, i) => {
              const Icone = ICONES[a.tipo] || MessageSquare;
              const atrasada = estaAtrasada(a.data_agendada);
              const empresa =
                a.negocio?.contato?.empresa || a.negocio?.contato?.nome || a.negocio?.titulo || "Negócio";

              return (
                <div
                  key={a.id}
                  className={clsx(
                    "flex flex-wrap items-start gap-3 px-5 py-4 sm:flex-nowrap",
                    i > 0 && "border-t border-fio",
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      atrasada ? "bg-rose-50 text-rose-700" : "bg-recuo text-tinta-suave",
                    )}
                  >
                    <Icone className="h-3.5 w-3.5" />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-titulo text-tinta">{a.titulo}</span>
                    <p className="text-corpo flex flex-wrap items-center gap-x-1.5 text-tinta-suave">
                      <span className="font-medium text-tinta">{empresa}</span>
                      <span aria-hidden>·</span>
                      <span>{ROTULOS_ATIVIDADE[a.tipo] || a.tipo}</span>
                      <span aria-hidden>·</span>
                      <span className={atrasada ? "font-medium text-rose-700" : undefined}>
                        {formatarDataHora(a.data_agendada)} ({descreverPrazo(a.data_agendada)})
                      </span>
                      {a.confirmada && (
                        <span className="flex items-center gap-1 font-medium text-emerald-700">
                          <BadgeCheck className="h-3 w-3" aria-hidden /> confirmada
                        </span>
                      )}
                      {a.negocio?.contato?.telefone && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums text-tinta-fraca">
                            {a.negocio.contato.telefone}
                          </span>
                        </>
                      )}
                    </p>

                    {reagendando === a.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {/* O Input nasce w-full para servir dentro do Field;
                            solto numa linha de acoes, quem manda e o involucro. */}
                        <div className="w-52">
                          <Input
                            type="datetime-local"
                            value={novaData}
                            onChange={(e) => setNovaData(e.target.value)}
                            aria-label="Nova data e hora"
                          />
                        </div>
                        {PRESETS_AGENDAMENTO.slice(0, 4).map((p) => (
                          <Button
                            key={p.rotulo}
                            tamanho="sm"
                            onClick={() => setNovaData(paraInputDataHora(dataDoPreset(p)))}
                          >
                            {p.rotulo}
                          </Button>
                        ))}
                        <Button
                          variante="primario"
                          tamanho="sm"
                          disabled={!novaData}
                          onClick={() => reagendar(a.id)}
                        >
                          Salvar
                        </Button>
                        <Button variante="sutil" tamanho="sm" onClick={() => setReagendando(null)}>
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!a.confirmada && (
                      <Button variante="sutil" tamanho="sm" onClick={() => confirmar(a.id)}>
                        Confirmar
                      </Button>
                    )}
                    <Button
                      variante="sutil"
                      tamanho="sm"
                      icone={RotateCcw}
                      aria-label="Reagendar"
                      title="Reagendar"
                      onClick={() => {
                        setReagendando(a.id);
                        setNovaData(a.data_agendada ? paraInputDataHora(new Date(a.data_agendada)) : "");
                      }}
                    />
                    <Button variante="secundario" tamanho="sm" onClick={() => concluir(a.id)}>
                      Concluir
                    </Button>
                    {a.negocio && (
                      <Link
                        href={`/negocios/${a.negocio.id}?tab=cadencia`}
                        title="Abrir negócio"
                        aria-label={`Abrir ${empresa}`}
                        className="rounded-lg p-1.5 text-tinta-fraca transition-colors duration-150 ease-out hover:bg-recuo hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </Cartao>
        </section>
      ))}
    </div>
  );
}
