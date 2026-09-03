"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Search, X, AlertTriangle, CheckCircle2, CalendarClock, Wallet } from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { KanbanBoard } from "@/components/KanbanBoard";
import { NewLeadModal } from "@/components/NewLeadModal";
import { moverEtapa } from "@/lib/negocios";
import { recorteDeFunil } from "@/lib/pipelines";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, formatarMoeda, resultadoDaEtapa } from "@/lib/types";
import { estaAtrasada, proximaAtividade, temAtividadeHoje } from "@/lib/atividades";

type Foco = "todos" | "atencao" | "atrasados" | "sem_agenda";

const FOCOS: { chave: Foco; label: string }[] = [
  { chave: "todos", label: "Todos" },
  { chave: "atencao", label: "Sem atividade hoje" },
  { chave: "atrasados", label: "Atrasados" },
  { chave: "sem_agenda", label: "Sem próximo passo" },
];

export function KanbanPageClient({
  pipelineId,
  etapas,
  negocios: negociosIniciais,
  responsaveis,
  usuarioAtual,
}: {
  pipelineId: string | null;
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
  /** Quem pode ser dono de um card deste funil (`pipelines.role_operador`). */
  responsaveis: Usuario[];
  usuarioAtual: Usuario;
}) {
  const [negocios, setNegocios] = useEstadoDaProp(negociosIniciais);
  const [modalAberto, setModalAberto] = useState(false);
  const [etapaNovoNegocio, setEtapaNovoNegocio] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState<Foco>("todos");
  // O RLS já limita o vendedor aos seus negócios + os do pool (sem dono);
  // filtrar por responsável aqui esconderia justamente os leads do pool.
  const [responsavel, setResponsavel] = useState<string>("todos");
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const { data } = await createClient()
      .from("negocios")
      .select(SELECT_NEGOCIO_COMPLETO)
      .eq("pipeline_id", recorteDeFunil(pipelineId))
      .order("criado_em", { ascending: false });
    if (data) setNegocios(data as unknown as NegocioComRelacoes[]);
  }, [pipelineId]);

  // Duas coisas nesta assinatura:
  //
  // 1. O filtro por funil chega até o Realtime — sem ele, mexer num negócio do
  //    SDR faria este board recarregar inteiro à toa. Funciona porque
  //    `negocios` está com `replica identity full`: sem isso o Postgres não
  //    manda a coluna nos eventos de UPDATE/DELETE e o board pararia de
  //    atualizar ao arrastar card.
  // 2. `atividades` NÃO é assinada. Toda mudança de atividade que este board
  //    mostra já toca `negocios` pelo gatilho `atividades_tocar_negocio`
  //    (criar, concluir, reagendar e excluir), então assinar as duas fazia
  //    cada atividade recarregar o board duas vezes — e a assinatura de
  //    `atividades` não tem filtro de funil, o que anularia o item 1.
  useSincronizacao(recarregar, {
    canal: "pipeline",
    tabelas: [
      { tabela: "negocios", filtro: `pipeline_id=eq.${recorteDeFunil(pipelineId)}` },
      { tabela: "contatos" },
    ],
  });

  const moverNegocio = useCallback(
    async (negocioId: string, etapaId: string) => {
      const atual = negocios.find((n) => n.id === negocioId);
      if (!atual || atual.etapa_id === etapaId) return;
      const etapa = etapas.find((et) => et.id === etapaId);
      const anterior = negocios;
      const agora = new Date().toISOString();
      // Arrastar para "Fechado (Ganho)"/"Perdido" fecha o negócio; arrastar de
      // volta para o funil o reabre. Sem isso as métricas ficavam sem fechado_em.
      const ganho = resultadoDaEtapa(etapa);

      // Otimista: a coluna, a probabilidade e a bolinha verde mudam na hora.
      setNegocios((prev) =>
        prev.map((n) =>
          n.id === negocioId
            ? {
                ...n,
                etapa_id: etapaId,
                etapa: etapa ?? n.etapa,
                probabilidade: etapa?.probabilidade ?? n.probabilidade,
                ganho,
                ultima_atividade_em: agora,
              }
            : n,
        ),
      );
      setErro(null);

      if (!etapa) return;
      const r = await moverEtapa({
        negocioId,
        etapa,
        nomeEtapaAnterior: atual.etapa?.nome,
        probabilidadeAtual: atual.probabilidade,
        usuarioId: usuarioAtual.id,
        sufixoDescricao: " no pipeline",
      });

      if (!r.ok) {
        setNegocios(anterior);
        setErro(`Não foi possível mover o negócio: ${r.erro}`);
        return;
      }
      void recarregar();
    },
    [negocios, etapas, usuarioAtual.id, recarregar],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");

    return negocios.filter((n) => {
      if (responsavel !== "todos" && n.responsavel_id !== responsavel) return false;

      if (foco !== "todos") {
        const proxima = proximaAtividade(n.atividades_pendentes);
        if (foco === "atencao" && temAtividadeHoje(n)) return false;
        if (foco === "atrasados" && !estaAtrasada(proxima?.data_agendada)) return false;
        if (foco === "sem_agenda" && proxima) return false;
      }

      if (!termo) return true;
      const c = n.contato;
      if (termoDigitos.length >= 3) {
        const docs = [c?.cnpj, c?.telefone, c?.telefone_comercial, c?.whatsapp].map((v) => (v || "").replace(/\D/g, ""));
        if (docs.some((d) => d && d.includes(termoDigitos))) return true;
      }
      const campos = [c?.empresa, c?.nome, c?.email, c?.cnpj, c?.telefone, c?.telefone_comercial, c?.whatsapp, n.titulo];
      return campos.some((v) => v && String(v).toLowerCase().includes(termo));
    });
  }, [negocios, busca, foco, responsavel]);

  const resumo = useMemo(() => {
    const abertos = filtrados.filter((n) => n.ganho === null || n.ganho === undefined);
    return {
      abertos: abertos.length,
      valor: abertos.reduce((acc, n) => acc + (n.valor || 0), 0),
      ponderado: abertos.reduce((acc, n) => acc + (n.valor || 0) * ((n.probabilidade ?? 0) / 100), 0),
      hoje: filtrados.filter((n) => temAtividadeHoje(n)).length,
      atrasados: filtrados.filter((n) => estaAtrasada(proximaAtividade(n.atividades_pendentes)?.data_agendada)).length,
      semAgenda: abertos.filter((n) => !proximaAtividade(n.atividades_pendentes)).length,
    };
  }, [filtrados]);

  const abrirNovoNegocio = (etapaId: string) => {
    setEtapaNovoNegocio(etapaId);
    setModalAberto(true);
  };

  const filtroAtivo = foco !== "todos" || busca.trim() !== "" || (usuarioAtual.role === "admin" && responsavel !== "todos");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="max-w-[1700px] mx-auto w-full px-4 sm:px-6 pt-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Pipeline de Vendas</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Arraste os cards entre as etapas. Quem recebe atividade hoje fica verde e desce para o fim da coluna.
            </p>
          </div>
          <button
            onClick={() => abrirNovoNegocio(etapas[0]?.id || "")}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md active:scale-[0.98] transition-colors duration-150 ease-out"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Negócio</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <ResumoCard
            icone={<Wallet className="h-3.5 w-3.5" />}
            rotulo={`Pipeline aberto (${resumo.abertos})`}
            valor={formatarMoeda(resumo.valor)}
            detalhe={`Ponderado: ${formatarMoeda(resumo.ponderado)}`}
          />
          <ResumoCard
            icone={<CheckCircle2 className="h-3.5 w-3.5" />}
            rotulo="Trabalhados hoje"
            valor={String(resumo.hoje)}
            cor="text-emerald-600 dark:text-emerald-400"
          />
          <ResumoCard
            icone={<AlertTriangle className="h-3.5 w-3.5" />}
            rotulo="Passos atrasados"
            valor={String(resumo.atrasados)}
            cor={resumo.atrasados > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
          />
          <ResumoCard
            icone={<CalendarClock className="h-3.5 w-3.5" />}
            rotulo="Sem próximo passo"
            valor={String(resumo.semAgenda)}
            cor={resumo.semAgenda > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por empresa, nome, e-mail, telefone ou CNPJ..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-hidden"
            />
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1">
            {FOCOS.map((f) => (
              <button
                key={f.chave}
                onClick={() => setFoco(f.chave)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors duration-150 ease-out whitespace-nowrap ${
                  foco === f.chave
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {usuarioAtual.role === "admin" && (
            <select
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
            >
              <option value="todos">Todos os responsáveis</option>
              {responsaveis.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          )}

          {filtroAtivo && (
            <button
              onClick={() => {
                setBusca("");
                setFoco("todos");
                if (usuarioAtual.role === "admin") setResponsavel("todos");
              }}
              className="flex items-center gap-1 px-3 py-2 text-[11px] font-bold text-slate-500 hover:text-rose-600 rounded-xl"
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
        </div>

        {erro && (
          <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>
        )}
      </div>

      <KanbanBoard
        etapas={etapas}
        negocios={filtrados}
        onNovoNegocio={abrirNovoNegocio}
        onMoverNegocio={moverNegocio}
      />

      {modalAberto && (
        <NewLeadModal
          pipelineId={pipelineId}
          etapas={etapas}
          etapaInicial={etapaNovoNegocio}
          responsaveis={responsaveis}
          usuarioAtual={usuarioAtual}
          onClose={() => setModalAberto(false)}
        />
      )}
    </div>
  );
}

function ResumoCard({
  icone,
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  detalhe?: string;
  cor?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3.5 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        {icone} {rotulo}
      </p>
      <p className={`text-base font-extrabold mt-0.5 ${cor || "text-slate-900 dark:text-slate-100"}`}>{valor}</p>
      {detalhe && <p className="text-[10px] text-slate-400 font-medium">{detalhe}</p>}
    </div>
  );
}
