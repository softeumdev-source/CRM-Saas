"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Search, X, AlertTriangle, CheckCircle2, CalendarClock, Users, Wallet } from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { KanbanBoard } from "@/components/KanbanBoard";
import { NewLeadModal } from "@/components/NewLeadModal";
import { moverEtapa } from "@/lib/negocios";
import { recorteDeFunil, type Pipeline } from "@/lib/pipelines";
import {
  CARDS_POR_ETAPA,
  buscarCadenciaDoBoard,
  buscarNegociosDoBoard,
  contarPorEtapa,
  mapaDeCadencias,
  type ResumoCadencia,
} from "@/lib/board";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { formatarMoeda, resultadoDaEtapa } from "@/lib/types";
import { estaAtrasada, proximaAtividade, temAtividadeHoje } from "@/lib/atividades";

type Foco = "todos" | "atencao" | "atrasados" | "sem_agenda";

const FOCOS: { chave: Foco; label: string }[] = [
  { chave: "todos", label: "Todos" },
  { chave: "atencao", label: "Sem atividade hoje" },
  { chave: "atrasados", label: "Atrasados" },
  { chave: "sem_agenda", label: "Sem próximo passo" },
];

export function KanbanPageClient({
  pipeline,
  etapas,
  negocios: negociosIniciais,
  totaisPorEtapa,
  porEtapa: porEtapaInicial,
  responsaveis,
  usuarioAtual,
  cadencias: cadenciasIniciais,
}: {
  /** O funil desta tela. É ele que decide o recorte, o título e as métricas. */
  pipeline: Pipeline | null;
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
  totaisPorEtapa: Record<string, number>;
  porEtapa: number;
  /** Quem pode ser dono de um card deste funil (`pipelines.role_operador`). */
  responsaveis: Usuario[];
  usuarioAtual: Usuario;
  /** Andamento da cadência por negócio. Vazio fora do board do SDR. */
  cadencias: Record<string, ResumoCadencia>;
}) {
  const pipelineId = pipeline?.id ?? null;
  // O SDR nao vende: o que ele entrega e reuniao, nao receita. Por isso o
  // cartao de valor do funil da lugar a contagem de leads no board dele.
  const ehSdr = pipeline?.chave === "sdr";

  const [negocios, setNegocios] = useEstadoDaProp(negociosIniciais);
  const [totais, setTotais] = useEstadoDaProp(totaisPorEtapa);
  const [cadencias, setCadencias] = useEstadoDaProp(cadenciasIniciais);
  // Quantos cards por coluna estão carregados. Sobe quando o usuário pede mais;
  // o board inteiro recarrega com o teto novo, numa consulta só.
  const [porEtapa, setPorEtapa] = useState(porEtapaInicial);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [etapaNovoNegocio, setEtapaNovoNegocio] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState<Foco>("todos");
  // O RLS já limita o vendedor aos seus negócios + os do pool (sem dono);
  // filtrar por responsável aqui esconderia justamente os leads do pool.
  const [responsavel, setResponsavel] = useState<string>("todos");
  const [erro, setErro] = useState<string | null>(null);
  // A entrega tira o card DESTE board. Sem uma palavra o card simplesmente
  // some da tela e parece que o arrasto deu errado.
  const [aviso, setAviso] = useState<string | null>(null);

  // A cadência entra AQUI também, e não só na carga do servidor: sem isto o
  // trilho do card congelaria no primeiro render e passaria a mentir a cada
  // tick de realtime — que é frequente, porque todo passo enviado toca
  // `negocios`.
  const recarregar = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { data: novosTotais }, inscricoes] = await Promise.all([
      buscarNegociosDoBoard(supabase, pipelineId, porEtapa),
      contarPorEtapa(supabase, pipelineId),
      ehSdr ? buscarCadenciaDoBoard(supabase) : Promise.resolve({ data: null }),
    ]);
    if (data) setNegocios(data as unknown as NegocioComRelacoes[]);
    if (novosTotais) {
      setTotais(Object.fromEntries(novosTotais.map((t) => [t.etapa_id, Number(t.total)])));
    }
    if (ehSdr) setCadencias(mapaDeCadencias(inscricoes.data));
  }, [pipelineId, porEtapa, ehSdr, setNegocios, setTotais, setCadencias]);

  // Busca com o teto novo ANTES de mexer no estado: assim o board nunca fica
  // um render com o teto alto e os cards antigos.
  const carregarMais = useCallback(async () => {
    const novo = porEtapa + CARDS_POR_ETAPA;
    setCarregandoMais(true);
    const { data, error } = await buscarNegociosDoBoard(createClient(), pipelineId, novo);
    setCarregandoMais(false);
    if (error) {
      setErro(`Não foi possível carregar mais cards: ${error.message}`);
      return;
    }
    setNegocios((data as unknown as NegocioComRelacoes[]) || []);
    setPorEtapa(novo);
  }, [porEtapa, pipelineId, setNegocios]);

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
      setAviso(null);

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
      if (etapa.funcao === "entrega") {
        setAviso(`Lead entregue: o card saiu deste board e está com o time do outro funil, sem dono.`);
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

  // Contagem por etapa do que está carregado, sem os filtros de tela — é o
  // outro lado da conta do "ver mais" no cabeçalho da coluna.
  const carregadosPorEtapa = useMemo(() => {
    const contagem: Record<string, number> = {};
    for (const n of negocios) {
      if (n.etapa_id) contagem[n.etapa_id] = (contagem[n.etapa_id] || 0) + 1;
    }
    return contagem;
  }, [negocios]);

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
            <h1 className="text-titulo font-semibold text-tinta">
              {ehSdr ? "Prospecção (SDR)" : "Pipeline de Vendas"}
            </h1>
            <p className="text-rotulo text-tinta-suave">
              {ehSdr
                ? "Cadência, qualificação e agendamento. Quando o cliente aceita a reunião, entregue o lead ao vendedor pelo card."
                : "Arraste os cards entre as etapas. Quem recebe atividade hoje fica verde e desce para o fim da coluna."}
            </p>
          </div>
          <button
            onClick={() => abrirNovoNegocio(etapas[0]?.id || "")}
            className="flex items-center gap-2 px-4 py-2 text-rotulo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl shadow-md active:scale-[0.98] transition-colors duration-150 ease-out"
          >
            <Plus className="h-4 w-4" />
            <span>{ehSdr ? "Novo Lead" : "Novo Negócio"}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {ehSdr ? (
            <ResumoCard
              icone={<Users className="h-3.5 w-3.5" />}
              rotulo="Leads em prospecção"
              valor={String(resumo.abertos)}
              detalhe={`${filtrados.length} no board`}
            />
          ) : (
            <ResumoCard
              icone={<Wallet className="h-3.5 w-3.5" />}
              rotulo={`Pipeline aberto (${resumo.abertos})`}
              valor={formatarMoeda(resumo.valor)}
              detalhe={`Ponderado: ${formatarMoeda(resumo.ponderado)}`}
            />
          )}
          <ResumoCard
            icone={<CheckCircle2 className="h-3.5 w-3.5" />}
            rotulo="Trabalhados hoje"
            valor={String(resumo.hoje)}
            cor="text-ok"
          />
          <ResumoCard
            icone={<AlertTriangle className="h-3.5 w-3.5" />}
            rotulo="Passos atrasados"
            valor={String(resumo.atrasados)}
            cor={resumo.atrasados > 0 ? "text-risco" : undefined}
          />
          <ResumoCard
            icone={<CalendarClock className="h-3.5 w-3.5" />}
            rotulo="Sem próximo passo"
            valor={String(resumo.semAgenda)}
            cor={resumo.semAgenda > 0 ? "text-alerta" : undefined}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tinta-fraca" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por empresa, nome, e-mail, telefone ou CNPJ..."
              className="w-full pl-10 pr-4 py-2 text-corpo bg-superficie border border-fio rounded-xl focus:border-acento focus:ring-1 focus:ring-acento outline-hidden"
            />
          </div>

          <div className="flex items-center bg-recuo p-1 rounded-xl gap-1">
            {FOCOS.map((f) => (
              <button
                key={f.chave}
                onClick={() => setFoco(f.chave)}
                className={`px-3 py-1.5 text-rotulo font-semibold rounded-lg transition-colors duration-150 ease-out whitespace-nowrap ${
                  foco === f.chave
                    ? "bg-superficie text-acento shadow-xs"
                    : "text-tinta-suave hover:text-tinta"
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
              className="px-3 py-2 text-rotulo font-medium bg-superficie border border-fio rounded-xl"
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
              className="flex items-center gap-1 px-3 py-2 text-rotulo font-semibold text-tinta-suave hover:text-risco rounded-xl"
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
        </div>

        {erro && (
          <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">{erro}</p>
        )}
        {aviso && (
          <p className="text-rotulo font-medium text-ok bg-ok-fraco rounded-lg px-3 py-2">{aviso}</p>
        )}
      </div>

      <KanbanBoard
        etapas={etapas}
        negocios={filtrados}
        variante={ehSdr ? "sdr" : "vendas"}
        cadencias={cadencias}
        totaisPorEtapa={totais}
        carregadosPorEtapa={carregadosPorEtapa}
        carregandoMais={carregandoMais}
        onCarregarMais={carregarMais}
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
    <div className="bg-superficie border border-fio rounded-2xl px-3.5 py-2.5">
      <p className="text-rotulo font-semibold uppercase tracking-wider text-tinta-fraca flex items-center gap-1.5">
        {icone} {rotulo}
      </p>
      <p className={`text-corpo-lg font-semibold mt-0.5 ${cor || "text-tinta"}`}>{valor}</p>
      {detalhe && <p className="text-rotulo text-tinta-fraca font-medium">{detalhe}</p>}
    </div>
  );
}
