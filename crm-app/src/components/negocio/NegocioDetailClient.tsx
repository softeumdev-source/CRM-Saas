"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Mail, Phone, Trophy, XCircle, CheckCircle2, Clock, CalendarClock, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import type { EtapaPipeline, NegocioComRelacoes, Plano, Usuario } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, formatarMoeda, resultadoDaEtapa } from "@/lib/types";
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
import { CopilotoTab } from "@/components/negocio/CopilotoTab";

type PropostaComRelacoes = Record<string, unknown>;
export type Aba = "geral" | "cadencia" | "proposta" | "ia";

export function ehAbaValida(valor: string | undefined): valor is Aba {
  return valor === "geral" || valor === "cadencia" || valor === "proposta" || valor === "ia";
}

const ABAS: { id: Aba; label: string }[] = [
  { id: "geral", label: "Visão Geral" },
  { id: "cadencia", label: "Cadência" },
  { id: "proposta", label: "Proposta & Assinatura" },
  { id: "ia", label: "Mensagens" },
];

export function NegocioDetailClient({
  negocioInicial,
  etapas,
  vendedores,
  planos,
  atividadesIniciais,
  propostasIniciais,
  usuarioAtual,
  abaInicial = "geral",
}: {
  negocioInicial: NegocioComRelacoes;
  etapas: EtapaPipeline[];
  vendedores: Usuario[];
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
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [erro, setErro] = useState<string | null>(null);

  const negocioId = negocioInicial.id;

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
    const anterior = negocio.etapa?.nome ?? "—";
    await atualizarNegocio({
      etapa_id: etapaId,
      etapa: nova,
      probabilidade: nova.probabilidade ?? negocio.probabilidade,
      ganho: resultadoDaEtapa(nova),
    });
    await createClient().from("atividades").insert({
      negocio_id: negocio.id,
      usuario_id: usuarioAtual.id,
      tipo: "mudanca_etapa",
      titulo: `Etapa alterada para: ${nova.nome}`,
      descricao: `Movido de "${anterior}" para "${nova.nome}".`,
    });
    void recarregar();
  };

  const fecharNegocio = async (ganho: boolean) => {
    const etapaAlvo = etapas.find((e) => resultadoDaEtapa(e) === ganho);
    if (!etapaAlvo) {
      setErro(`Não encontrei a etapa de ${ganho ? "ganho" : "perda"} no funil.`);
      return;
    }
    if (!confirm(`Marcar este negócio como ${ganho ? "GANHO" : "PERDIDO"}?`)) return;
    const motivo = ganho ? null : window.prompt("Motivo da perda (opcional):") || null;

    const supabase = createClient();
    const { error } = await supabase
      .from("negocios")
      .update({
        etapa_id: etapaAlvo.id,
        ganho,
        motivo_perda: motivo,
        probabilidade: ganho ? 100 : 0,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", negocio.id);
    if (error) {
      setErro(`Não foi possível fechar o negócio: ${error.message}`);
      return;
    }
    await supabase.from("atividades").insert({
      negocio_id: negocio.id,
      usuario_id: usuarioAtual.id,
      tipo: "mudanca_etapa",
      titulo: ganho ? "Negócio marcado como GANHO" : "Negócio marcado como PERDIDO",
      descricao: motivo ? `Motivo da perda: ${motivo}` : null,
    });
    router.push("/");
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => fecharNegocio(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 rounded-xl transition-colors"
            >
              <Trophy className="h-3.5 w-3.5" /> Ganhei
            </button>
            <button
              onClick={() => fecharNegocio(false)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 rounded-xl transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" /> Perdi
            </button>
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
            <p className="text-[10px] font-bold uppercase text-slate-400">Vendedor responsável</p>
            <select
              value={negocio.responsavel_id || ""}
              onChange={(e) => {
                const resp = vendedores.find((v) => v.id === e.target.value) || null;
                atualizarNegocio({ responsavel_id: e.target.value || null, responsavel: resp });
              }}
              className="w-full mt-1 text-sm font-bold bg-transparent focus:outline-hidden"
            >
              <option value="">Sem dono (pool)</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>
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

      <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1 w-fit max-w-full overflow-x-auto">
        {ABAS.map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              aba === t.id ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {t.label}
            {t.id === "cadencia" && proximaAtrasada && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-500 align-middle" />
            )}
          </button>
        ))}
      </div>

      {aba === "geral" && (
        <VisaoGeralTab
          negocio={negocio}
          onAtualizarContato={(campos) => setNegocio((prev) => ({ ...prev, contato: { ...prev.contato!, ...campos } }))}
        />
      )}
      {aba === "cadencia" && (
        <CadenciaTab
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
      {aba === "ia" && <CopilotoTab negocio={negocio} usuarioAtual={usuarioAtual} />}
    </div>
  );
}
