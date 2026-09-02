"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { KanbanBoard } from "@/components/KanbanBoard";
import { NewLeadModal } from "@/components/NewLeadModal";
import { moverEtapa } from "@/lib/negocios";
import { Alerta, Button, Input, Segmentado, Select } from "@/components/ui";
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
  etapas,
  negocios: negociosIniciais,
  vendedores,
  usuarioAtual,
}: {
  etapas: EtapaPipeline[];
  negocios: NegocioComRelacoes[];
  vendedores: Usuario[];
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
      .order("criado_em", { ascending: false });
    if (data) setNegocios(data as unknown as NegocioComRelacoes[]);
  }, []);

  useSincronizacao(recarregar, {
    canal: "pipeline",
    tabelas: [{ tabela: "negocios" }, { tabela: "contatos" }, { tabela: "atividades" }],
  });

  const moverNegocio = useCallback(
    async (negocioId: string, etapaId: string) => {
      const atual = negocios.find((n) => n.id === negocioId);
      if (!atual || atual.etapa_id === etapaId) return;
      const etapa = etapas.find((et) => et.id === etapaId);
      if (!etapa) return;
      const anterior = negocios;
      const agora = new Date().toISOString();
      // Arrastar para "Fechado (Ganho)"/"Perdido" fecha o negócio; arrastar de
      // volta para o funil o reabre. Sem isso as métricas ficavam sem fechado_em.
      const ganho = resultadoDaEtapa(etapa);

      // Otimista: a coluna, a probabilidade e a situação mudam na hora.
      // `ultima_atividade_em` é do gatilho do banco — aqui só antecipamos.
      setNegocios((prev) =>
        prev.map((n) =>
          n.id === negocioId
            ? {
                ...n,
                etapa_id: etapaId,
                etapa,
                probabilidade: etapa.probabilidade ?? n.probabilidade,
                ganho,
                ultima_atividade_em: agora,
              }
            : n,
        ),
      );
      setErro(null);

      const r = await moverEtapa({
        negocioId,
        etapa,
        nomeEtapaAnterior: atual.etapa?.nome,
        probabilidadeAtual: atual.probabilidade,
        usuarioId: usuarioAtual.id,
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

  // Separado em dois passos de proposito: as contagens dos filtros saem daqui,
  // de ANTES do foco ser aplicado. Se saissem da lista ja filtrada, escolher
  // "Atrasados" faria "Todos" passar a mostrar o numero de atrasados.
  const semFoco = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");

    return negocios.filter((n) => {
      if (responsavel !== "todos" && n.responsavel_id !== responsavel) return false;

      if (!termo) return true;
      const c = n.contato;
      if (termoDigitos.length >= 3) {
        const docs = [c?.cnpj, c?.telefone, c?.telefone_comercial, c?.whatsapp].map((v) => (v || "").replace(/\D/g, ""));
        if (docs.some((d) => d && d.includes(termoDigitos))) return true;
      }
      const campos = [c?.empresa, c?.nome, c?.email, c?.cnpj, c?.telefone, c?.telefone_comercial, c?.whatsapp, n.titulo];
      return campos.some((v) => v && String(v).toLowerCase().includes(termo));
    });
  }, [negocios, busca, responsavel]);

  const filtrados = useMemo(() => {
    if (foco === "todos") return semFoco;
    return semFoco.filter((n) => {
      const proxima = proximaAtividade(n.atividades_pendentes);
      if (foco === "atencao") return !temAtividadeHoje(n);
      if (foco === "atrasados") return estaAtrasada(proxima?.data_agendada);
      return !proxima; // sem_agenda
    });
  }, [semFoco, foco]);

  // Os numeros que ficavam na fileira de quatro cards de resumo: eram os mesmos
  // destes filtros, so que sem poder clicar. Agora moram dentro deles.
  const contagens = useMemo(
    () => ({
      todos: semFoco.length,
      atencao: semFoco.filter((n) => !temAtividadeHoje(n)).length,
      atrasados: semFoco.filter((n) => estaAtrasada(proximaAtividade(n.atividades_pendentes)?.data_agendada))
        .length,
      sem_agenda: semFoco.filter((n) => !proximaAtividade(n.atividades_pendentes)).length,
    }),
    [semFoco],
  );

  const resumo = useMemo(() => {
    const abertos = filtrados.filter((n) => n.ganho === null || n.ganho === undefined);
    return {
      abertos: abertos.length,
      valor: abertos.reduce((acc, n) => acc + (n.valor || 0), 0),
      ponderado: abertos.reduce((acc, n) => acc + (n.valor || 0) * ((n.probabilidade ?? 0) / 100), 0),
      hoje: filtrados.filter((n) => temAtividadeHoje(n)).length,
    };
  }, [filtrados]);

  const abrirNovoNegocio = (etapaId: string) => {
    setEtapaNovoNegocio(etapaId);
    setModalAberto(true);
  };

  const filtroAtivo = foco !== "todos" || busca.trim() !== "" || (usuarioAtual.role === "admin" && responsavel !== "todos");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 pb-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-serif text-display text-tinta">Pipeline</h1>
            <p className="text-corpo-lg tabular-nums text-tinta-suave">
              {resumo.abertos} {resumo.abertos === 1 ? "negócio aberto" : "negócios abertos"}
              {" · "}
              {formatarMoeda(resumo.valor)} em jogo
              {" · "}
              {formatarMoeda(resumo.ponderado)} ponderado
              {" · "}
              {resumo.hoje} trabalhados hoje
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-56 sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta-fraca"
                aria-hidden
              />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar negócio"
                placeholder="Buscar empresa, e-mail, CNPJ…"
                className="pl-9"
              />
            </div>
            <Button variante="primario" icone={Plus} onClick={() => abrirNovoNegocio(etapas[0]?.id || "")}>
              Novo negócio
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmentado
            rotulo="Filtrar por situação"
            valor={foco}
            aoTrocar={setFoco}
            opcoes={FOCOS.map((f) => ({ ...f, contagem: contagens[f.chave] }))}
          />

          {usuarioAtual.role === "admin" && (
            // O Select nasce w-full para servir dentro do Field; aqui, solto numa
            // barra de filtros, quem manda na largura e o invólucro.
            <div className="w-52">
              <Select
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                aria-label="Filtrar por responsável"
              >
                <option value="todos">Todos os vendedores</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {filtroAtivo && (
            <Button
              variante="sutil"
              tamanho="sm"
              icone={X}
              onClick={() => {
                setBusca("");
                setFoco("todos");
                if (usuarioAtual.role === "admin") setResponsavel("todos");
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>

        {erro && <Alerta>{erro}</Alerta>}
      </div>

      <KanbanBoard
        etapas={etapas}
        negocios={filtrados}
        onNovoNegocio={abrirNovoNegocio}
        onMoverNegocio={moverNegocio}
      />

      {modalAberto && (
        <NewLeadModal
          etapas={etapas}
          etapaInicial={etapaNovoNegocio}
          vendedores={vendedores}
          usuarioAtual={usuarioAtual}
          onClose={() => setModalAberto(false)}
        />
      )}
    </div>
  );
}
