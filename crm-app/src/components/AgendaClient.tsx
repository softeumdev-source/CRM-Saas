"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Mail,
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

type Grupo = { chave: string; titulo: string; itens: AtividadeAgenda[]; tom: "atrasado" | "hoje" | "futuro" };

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
      { chave: "atrasadas", titulo: "Atrasadas", itens: atrasadas, tom: "atrasado" as const },
      { chave: "hoje", titulo: "Hoje", itens: hoje, tom: "hoje" as const },
      { chave: "semana", titulo: "Próximos 7 dias", itens: semana, tom: "futuro" as const },
      { chave: "depois", titulo: "Mais adiante", itens: depois, tom: "futuro" as const },
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

  const totalAtrasadas = grupos.find((g) => g.chave === "atrasadas")?.itens.length ?? 0;
  const totalHoje = grupos.find((g) => g.chave === "hoje")?.itens.length ?? 0;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-titulo font-semibold text-tinta flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-acento" /> Agenda de cadência
          </h1>
          <p className="text-rotulo text-tinta-suave">
            Todos os próximos passos agendados. Conclua, reagende ou confirme sem sair da tela.
          </p>
        </div>
        <label htmlFor="agendaclie-1" className="flex items-center gap-2 text-rotulo font-medium text-tinta-suave bg-superficie border border-fio px-3 py-2 rounded-xl cursor-pointer">
          <input id="agendaclie-1"
            type="checkbox"
            checked={apenasMinhas}
            onChange={(e) => setApenasMinhas(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Somente minhas
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Indicador rotulo="Atrasadas" valor={totalAtrasadas} cor={totalAtrasadas > 0 ? "text-risco" : undefined} />
        <Indicador rotulo="Para hoje" valor={totalHoje} cor="text-acento" />
        <Indicador rotulo="Total agendado" valor={visiveis.length} />
      </div>

      {erro && <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">{erro}</p>}

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
            {grupo.itens.map((a) => {
              const Icon = ICONES[a.tipo] || MessageSquare;
              const atrasada = estaAtrasada(a.data_agendada);
              const empresa = a.negocio?.contato?.empresa || a.negocio?.contato?.nome || a.negocio?.titulo || "Negócio";
              return (
                <div key={a.id} className="p-4 flex items-start gap-3 flex-wrap sm:flex-nowrap">
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
                    </p>
                    {a.negocio?.contato?.telefone && (
                      <p className="text-rotulo text-tinta-fraca mt-0.5">{a.negocio.contato.telefone}</p>
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
                            className="px-2 py-1 text-rotulo font-semibold text-acento bg-superficie border border-fio rounded-lg"
                          >
                            {p.rotulo}
                          </button>
                        ))}
                        <button
                          onClick={() => reagendar(a.id)}
                          disabled={!novaData}
                          className="px-2.5 py-1.5 text-rotulo font-semibold text-acento-tinta bg-acento-solido rounded-lg disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button onClick={() => setReagendando(null)} className="px-2 py-1.5 text-rotulo font-medium text-tinta-suave">
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!a.confirmada && (
                      <button
                        onClick={() => confirmar(a.id)}
                        className="text-rotulo font-semibold text-acento hover:bg-acento-fraco px-2 py-1.5 rounded-lg"
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
                      onClick={() => concluir(a.id)}
                      className="text-rotulo font-semibold text-ok hover:bg-ok-fraco px-2 py-1.5 rounded-lg"
                    >
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
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Indicador({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="bg-superficie border border-fio rounded-2xl px-3.5 py-2.5">
      <p className="text-rotulo font-semibold uppercase tracking-wider text-tinta-fraca">{rotulo}</p>
      <p className={`text-titulo font-semibold ${cor || "text-tinta"}`}>{valor}</p>
    </div>
  );
}
