"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Plus, Search, X, AlertTriangle, CheckCircle2, CalendarClock, MessageCircle, Maximize2, Minimize2 } from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Vazio } from "@/components/ui/Cartao";
import { Segmentado } from "@/components/ui";
import { NewLeadModal } from "@/components/NewLeadModal";
import { moverEtapa } from "@/lib/negocios";
import { recorteDeFunil, type Pipeline } from "@/lib/pipelines";
import {
  CARDS_POR_ETAPA,
  buscarAprovacoesDoBoard,
  buscarCadenciaDoBoard,
  buscarNegociosDoBoard,
  contarPorEtapa,
  mapaDeAprovacoes,
  mapaDeCadencias,
  temPendencia,
  type ResumoCadencia,
  type ResumoDeAprovacao,
} from "@/lib/board";
import type { EtapaPipeline, NegocioComRelacoes, Usuario } from "@/lib/types";
import { formatarMoeda, resultadoDaEtapa } from "@/lib/types";
import { estaAtrasada, proximaAtividade, temAtividadeHoje } from "@/lib/atividades";

type Foco = "todos" | "respondeu" | "aprovacao" | "atencao" | "atrasados" | "sem_agenda";

/**
 * A ordem é por urgência, e os dois primeiros filtros são os que têm alguém do
 * outro lado: "Responderam" é o cliente esperando NOSSA resposta, "Precisa
 * aprovação" é a mensagem já escrita esperando UM CLIQUE. Os três seguintes
 * falam do que nós deixamos de fazer, que é menos urgente e menos concreto.
 *
 * "Precisa aprovação" vale nos DOIS boards, e não só no do SDR: um lead
 * entregue ao vendedor pode chegar com toque ainda na fila, o card já mostra a
 * borda âmbar lá, e esconder o chip deixaria o vendedor vendo o aviso sem meio
 * de filtrar por ele.
 */
/** Preferência de tela cheia, uma para os dois boards. */
const CHAVE_MAXIMIZADO = "crm:kanban-maximizado";

/**
 * A preferência de tela cheia vive FORA do React, e é lida por
 * `useSyncExternalStore`. Isso não é preciosismo — é o conserto de um defeito
 * que eu escrevi e o lint pegou.
 *
 * A primeira versão nascia `false` e um `useEffect` chamava `setMaximizado`
 * depois de ler o `localStorage`. Funciona, e é errado por dois motivos: rende
 * um render inteiro com o board pequeno antes de crescer (o "pulo" ao abrir a
 * página), e é `setState` síncrono dentro de efeito, que encadeia renders. O
 * projeto já documenta essa doutrina em `AgendarReuniao.tsx`, no comentário do
 * `convite`, e eu a violei.
 *
 * Ler direto no `useState` também não serve: o servidor renderiza `false` e o
 * cliente renderizaria `true`, e o React descarta a árvore com erro de
 * hidratação — o mesmo bug de outra cor.
 *
 * `useSyncExternalStore` é a única forma que o React oferece de ter as duas
 * coisas: um retrato para o SERVIDOR (`false`) e outro para o CLIENTE (o que
 * está guardado), sem mismatch e sem efeito.
 *
 * O valor fica em cache no módulo porque `getSnapshot` é chamado a cada render:
 * sem ele, seria uma leitura de `localStorage` — I/O síncrona — por render.
 */
let maximizadoEmCache: boolean | null = null;
const ouvintesDoMaximizado = new Set<() => void>();

function lerMaximizado(): boolean {
  if (maximizadoEmCache === null) {
    try {
      maximizadoEmCache = localStorage.getItem(CHAVE_MAXIMIZADO) === "1";
    } catch {
      // Janela anônima ou site data bloqueado: a preferência não é essencial.
      maximizadoEmCache = false;
    }
  }
  return maximizadoEmCache;
}

function definirMaximizado(valor: boolean): void {
  maximizadoEmCache = valor;
  try {
    localStorage.setItem(CHAVE_MAXIMIZADO, valor ? "1" : "0");
  } catch {
    /* idem: a tela obedece mesmo sem conseguir guardar */
  }
  for (const avisar of ouvintesDoMaximizado) avisar();
}

function assinarMaximizado(avisar: () => void): () => void {
  ouvintesDoMaximizado.add(avisar);
  return () => {
    ouvintesDoMaximizado.delete(avisar);
  };
}

const FOCOS: { chave: Foco; label: string }[] = [
  { chave: "todos", label: "Todos" },
  { chave: "respondeu", label: "Responderam" },
  { chave: "aprovacao", label: "Precisa aprovação" },
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
  aprovacoes: aprovacoesIniciais,
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
  aprovacoes: Record<string, ResumoDeAprovacao>;
}) {
  const pipelineId = pipeline?.id ?? null;
  // O SDR nao vende: o que ele entrega e reuniao, nao receita. Por isso o
  // cartao de valor do funil da lugar a contagem de leads no board dele.
  const ehSdr = pipeline?.chave === "sdr";

  const [negocios, setNegocios] = useEstadoDaProp(negociosIniciais);
  const [totais, setTotais] = useEstadoDaProp(totaisPorEtapa);
  const [cadencias, setCadencias] = useEstadoDaProp(cadenciasIniciais);
  const [aprovacoes, setAprovacoes] = useEstadoDaProp(aprovacoesIniciais);
  // Quantos cards por coluna estão carregados. Sobe quando o usuário pede mais;
  // o board inteiro recarrega com o teto novo, numa consulta só.
  const [porEtapa, setPorEtapa] = useState(porEtapaInicial);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [etapaNovoNegocio, setEtapaNovoNegocio] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState<Foco>("todos");
  /**
   * O board ocupando a janela inteira.
   *
   * A CONTA QUE ORIGINOU ISTO: entre o topo da tela e o primeiro card havia
   * ~325px de cabeçalho — Navbar (60), título e subtítulo (60), os quatro
   * cartões de resumo (110), a fileira de filtros (56) e os respiros. Numa tela
   * de 900px sobravam ~575 para o board; num notebook de 768, ~440. Com card de
   * ~150px, isso é menos de três cards por coluna antes de rolar.
   *
   * MEDIDO depois: a lista de cards vai de 471px para 643px em 1280x900 (+37%),
   * e de 339px para 511px num notebook de 1366x768 (+51%).
   *
   * O retrato do servidor é `false` de propósito — ver a loja no topo do
   * arquivo.
   */
  const maximizado = useSyncExternalStore(assinarMaximizado, lerMaximizado, () => false);
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
    const [{ data }, { data: novosTotais }, inscricoes, pendentes] = await Promise.all([
      buscarNegociosDoBoard(supabase, pipelineId, porEtapa),
      contarPorEtapa(supabase, pipelineId),
      ehSdr ? buscarCadenciaDoBoard(supabase) : Promise.resolve({ data: null }),
      // Nos dois boards — e agora o aviso do card aparece e some NA HORA,
      // porque a notícia chega por `negocios`, que este canal já assina.
      //
      // Isto NÃO era verdade até hoje, e a correção não está aqui: está no
      // gatilho `trg_mensagens_fila_mudou`, que toca `negocios.atualizado_em`
      // quando uma mensagem entra ou sai de 'aguardando_aprovacao'. Sem ele o
      // aviso só sumia na recarga de segurança de 45s, e o aviso de um toque
      // NOVO — gerado pela cadência de 5 em 5 minutos — demorava o mesmo tanto
      // para acender.
      //
      // Assinar `mensagens` aqui teria sido uma linha, e foi o primeiro caminho
      // que eu tentei. Mas `mensagens` não tem recorte de funil: o board do SDR
      // passaria a recarregar a cada tique do funil de Vendas. O gatilho reusa
      // o canal que JÁ é recortado — e é o mesmo desenho que
      // `mensagens_sinalizar_resposta` usa desde sempre para o selo azul de
      // "o cliente respondeu".
      buscarAprovacoesDoBoard(supabase),
    ]);
    if (data) setNegocios(data as unknown as NegocioComRelacoes[]);
    if (novosTotais) {
      setTotais(Object.fromEntries(novosTotais.map((t) => [t.etapa_id, Number(t.total)])));
    }
    if (ehSdr) setCadencias(mapaDeCadencias(inscricoes.data));
    setAprovacoes(mapaDeAprovacoes(pendentes.data));
  }, [pipelineId, porEtapa, ehSdr, setNegocios, setTotais, setCadencias, setAprovacoes]);

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
    [negocios, etapas, usuarioAtual.id, recarregar, setNegocios],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");

    return negocios.filter((n) => {
      if (responsavel !== "todos" && n.responsavel_id !== responsavel) return false;

      if (foco !== "todos") {
        const proxima = proximaAtividade(n.atividades_pendentes);
        if (foco === "respondeu" && (n.respostas_nao_lidas ?? 0) === 0) return false;
        if (foco === "aprovacao" && !temPendencia(aprovacoes[n.id])) return false;
        if (foco === "atencao" && temAtividadeHoje(n)) return false;
        if (foco === "atrasados" && !estaAtrasada(proxima?.data_agendada)) return false;
        if (foco === "sem_agenda" && proxima) return false;
      }

      if (!termo) return true;
      const c = n.contato;
      if (termoDigitos.length >= 3) {
        // `telefone_comercial` saiu das duas listas: a coluna existe no schema
        // base e NINGUEM escreve nela. Conferido nos tres unicos caminhos que
        // gravam contato — o modal de lead novo, o formulario da Visao Geral e
        // a importacao de planilha — e no proprio banco: dos 25 contatos, 0
        // tem valor ali. Buscar por um campo sempre nulo nao acha e nao deixa
        // de achar nada; so faz a busca parecer mais larga do que e.
        const docs = [c?.cnpj, c?.telefone, c?.whatsapp].map((v) => (v || "").replace(/\D/g, ""));
        if (docs.some((d) => d && d.includes(termoDigitos))) return true;
      }
      const campos = [c?.empresa, c?.nome, c?.email, c?.cnpj, c?.telefone, c?.whatsapp, n.titulo];
      return campos.some((v) => v && String(v).toLowerCase().includes(termo));
    });
    // `aprovacoes` PRECISA estar aqui: sem ela a lista não recalcularia quando
    // alguém aprovasse um e-mail, e o card ficaria no filtro depois de sair da
    // fila.
  }, [negocios, busca, foco, responsavel, aprovacoes]);

  const resumo = useMemo(() => {
    const abertos = filtrados.filter((n) => n.ganho === null || n.ganho === undefined);
    return {
      abertos: abertos.length,
      valor: abertos.reduce((acc, n) => acc + (n.valor || 0), 0),
      ponderado: abertos.reduce((acc, n) => acc + (n.valor || 0) * ((n.probabilidade ?? 0) / 100), 0),
      responderam: filtrados.filter((n) => (n.respostas_nao_lidas ?? 0) > 0).length,
      hoje: filtrados.filter((n) => temAtividadeHoje(n)).length,
      atrasados: filtrados.filter((n) => estaAtrasada(proximaAtividade(n.atividades_pendentes)?.data_agendada)).length,
      semAgenda: abertos.filter((n) => !proximaAtividade(n.atividades_pendentes)).length,
    };
  }, [filtrados]);

  /**
   * Quantos responderam no board INTEIRO, e não dentro do recorte atual.
   *
   * Tem que ser calculado sobre `negocios`, não sobre `filtrados`: o número vive
   * no próprio botão "Responderam", e um número tirado do recorte cairia para
   * zero assim que alguém usasse um dos outros filtros — o aviso sumiria
   * exatamente quando é mais útil.
   */
  const totalResponderam = useMemo(
    () => negocios.filter((n) => (n.respostas_nao_lidas ?? 0) > 0).length,
    [negocios],
  );

  /** Mesma regra, mesmo motivo: sobre o board inteiro, não sobre o recorte. */
  const totalPendentes = useMemo(
    () => negocios.filter((n) => temPendencia(aprovacoes[n.id])).length,
    [negocios, aprovacoes],
  );

  // Contagem por etapa do que está carregado, sem os filtros de tela — é o
  // outro lado da conta do "ver mais" no cabeçalho da coluna.
  const carregadosPorEtapa = useMemo(() => {
    const contagem: Record<string, number> = {};
    for (const n of negocios) {
      if (n.etapa_id) contagem[n.etapa_id] = (contagem[n.etapa_id] || 0) + 1;
    }
    return contagem;
  }, [negocios]);

  // Maximizado, a Navbar fica coberta. `Esc` e o botão são as DUAS saídas: ter
  // só o botão seria uma armadilha para quem está acostumado com tela cheia.
  // Este efeito só ASSINA um evento do navegador — não escreve estado no corpo,
  // que é o que o `useSyncExternalStore` acima existe para evitar.
  useEffect(() => {
    if (!maximizado) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") definirMaximizado(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [maximizado]);

  const abrirNovoNegocio = (etapaId: string) => {
    setEtapaNovoNegocio(etapaId);
    setModalAberto(true);
  };

  const filtroAtivo = foco !== "todos" || busca.trim() !== "" || (usuarioAtual.role === "admin" && responsavel !== "todos");

  const limparFiltros = () => {
    setBusca("");
    setFoco("todos");
    if (usuarioAtual.role === "admin") setResponsavel("todos");
  };

  return (
    // `z-40` nao e numero solto: a Navbar e `z-30` e o `Modal` e `z-50`. Ficar
    // no meio e o que faz o board cobrir a navegacao e, ainda assim, o modal de
    // "Novo Lead" aparecer por cima dele.
    <div
      className={
        maximizado
          ? "fixed inset-0 z-40 flex flex-col bg-fundo"
          : "flex-1 min-h-0 flex flex-col"
      }
    >
      <div
        className={`max-w-pagina mx-auto w-full px-4 sm:px-6 ${
          maximizado ? "pt-3 space-y-2.5" : "pt-5 space-y-3"
        }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-titulo font-semibold text-tinta">
              {ehSdr ? "Prospecção (SDR)" : "Pipeline de Vendas"}
            </h1>
            {/* O subtítulo explica o board para quem chega. Depois de
                maximizar, quem está ali já sabe o que é — e são 20px que viram
                card. */}
            {!maximizado && (
              <p className="text-rotulo text-tinta-suave">
                {ehSdr
                  ? "Cadência, qualificação e agendamento. Quando o cliente aceita a reunião, entregue o lead ao vendedor pelo card."
                  : "Arraste os cards entre as etapas. Quem recebe atividade hoje fica verde e desce para o fim da coluna."}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Fica VISÍVEL nos dois estados: escondido no modo normal, ninguém
                descobre que existe; escondido no maximizado, ninguém sai. */}
            <button
              onClick={() => definirMaximizado(!maximizado)}
              title={maximizado ? "Sair da tela cheia (Esc)" : "Usar a janela inteira"}
              aria-pressed={maximizado}
              className="foco flex items-center gap-2 px-3 py-2 text-rotulo font-semibold text-tinta-suave hover:text-tinta bg-superficie border border-fio hover:border-fio-forte rounded-xl transition-colors duration-150 ease-out pointer-coarse:min-h-11"
            >
              {maximizado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              <span className="hidden sm:inline">{maximizado ? "Sair" : "Maximizar"}</span>
            </button>
            <button
              onClick={() => abrirNovoNegocio(etapas[0]?.id || "")}
              className="foco flex items-center gap-2 px-4 py-2 text-rotulo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl active:scale-98 transition-colors duration-150 ease-out"
            >
              <Plus className="h-4 w-4" />
              <span>{ehSdr ? "Novo Lead" : "Novo Negócio"}</span>
            </button>
          </div>
        </div>

        {/* Eram QUATRO cartões iguais, lado a lado: mesma borda, mesmo raio,
            mesmo padding, mesmo corpo de 16px. Desfocando a tela eram quatro
            retângulos cinza idênticos — nenhum deles com permissão de ser o
            assunto, que é exatamente a monotonia que o craft R4 descreve.

            Agora UM número é grande: o dinheiro no board de vendas, os leads
            no do SDR. O resto vira uma faixa quieta de 12px, sem moldura
            nenhuma — a hierarquia passa a vir de TAMANHO e COR (craft R9), e
            não de quatro caixas competindo em pé de igualdade.

            E o bloco inteiro continua sumindo ao maximizar: é o pedaço do
            cabeçalho que ninguém CLICA. */}
        {/* SEM `justify-between` aqui, e essa é a correção do buraco.

            Medido no print de 1790px: o valor terminava em ~420px e o primeiro
            estado só começava em ~1320px. Novecentos pixels de nada no meio da
            linha — a maior região vazia da tela, e o "espaço branco" que se via
            de cara. `justify-between` num contêiner de 1700px não distribui:
            ele joga as duas pontas para longe e cava um vão no meio.

            Agora a linha corre da esquerda para a direita e termina onde o
            conteúdo termina. `items-baseline` alinha o número de 28px com os
            textos de 12px pela LINHA DE BASE, e não pelo fundo da caixa: é o
            que faz os três blocos lerem como uma frase só em vez de três
            elementos empilhados por acaso.

            O bloco inteiro continua sumindo ao maximizar: é o pedaço do
            cabeçalho que ninguém CLICA. */}
        {!maximizado && (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <p className="text-display font-semibold text-tinta tabular leading-none">
            {ehSdr ? resumo.abertos : formatarMoeda(resumo.valor)}
          </p>
          <p className="text-rotulo text-tinta-suave">
            {ehSdr ? (
              <>
                {resumo.abertos === 1 ? "lead em prospecção" : "leads em prospecção"}
                {" · "}
                {filtrados.length} no board
              </>
            ) : (
              <>
                pipeline aberto · {resumo.abertos}{" "}
                {resumo.abertos === 1 ? "negócio" : "negócios"} · ponderado{" "}
                <span className="tabular">{formatarMoeda(resumo.ponderado)}</span>
              </>
            )}
          </p>

          {/* Os estados entram na MESMA linha, logo depois — não a 900px de
              distância. O fio vertical antes deles separa "o que o funil é" de
              "o que está pegando", sem precisar de outra linha para isso.

              Um estado em zero não é notícia: fica em tinta fraca e some no
              fundo; passou de zero, ganha a cor do estado. */}
          <span aria-hidden className="hidden h-4 w-px self-center bg-fio sm:block" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Estado
              icone={<CheckCircle2 className="h-3.5 w-3.5" />}
              valor={resumo.hoje}
              rotulo="trabalhados hoje"
              cor={resumo.hoje > 0 ? "text-ok" : undefined}
            />
            <Estado
              icone={<AlertTriangle className="h-3.5 w-3.5" />}
              valor={resumo.atrasados}
              rotulo={resumo.atrasados === 1 ? "passo atrasado" : "passos atrasados"}
              cor={resumo.atrasados > 0 ? "text-risco" : undefined}
            />
            <Estado
              icone={<CalendarClock className="h-3.5 w-3.5" />}
              valor={resumo.semAgenda}
              rotulo="sem próximo passo"
              cor={resumo.semAgenda > 0 ? "text-alerta" : undefined}
            />
          </div>
        </div>
        )}

        {/* Quem respondeu não é "mais uma métrica": é a única linha do
            cabeçalho que pede AÇÃO agora. Então sai da fileira de números e
            vira uma faixa tingida, com tratamento que nenhum outro elemento da
            tela tem — que é como o craft R4 manda quebrar a monotonia: não
            deixando tudo com o mesmo peso. */}
        {!maximizado && resumo.responderam > 0 && (
          <button
            onClick={() => setFoco("respondeu")}
            className="foco flex w-full items-center gap-2.5 rounded-xl border border-info/40 bg-info-fraco px-3.5 py-2.5 text-left transition-colors duration-150 ease-out hover:border-info"
          >
            <MessageCircle className="h-4 w-4 shrink-0 text-info" aria-hidden />
            <span className="text-corpo text-tinta">
              <span className="font-medium tabular">{resumo.responderam}</span>{" "}
              {resumo.responderam === 1
                ? "cliente respondeu e está esperando você"
                : "clientes responderam e estão esperando você"}
            </span>
            <span className="ml-auto shrink-0 text-rotulo font-medium text-info">Ver</span>
          </button>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-60 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tinta-fraca" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por empresa, nome, e-mail, telefone ou CNPJ..."
              className="foco w-full pl-10 pr-4 py-2 text-corpo bg-superficie border border-fio rounded-xl"
            />
          </div>

          {/* Este bloco era o segmento escrito a mao — e o admin, dois
              cliques ao lado, desenhava a MESMA pergunta como botao indigo
              cheio. Duas implementacoes do mesmo controle divergindo. Agora as
              duas telas usam `Segmentado`, e o comportamento de rolar dentro do
              proprio trilho (que existe porque com cinco filtros a fileira
              media 575px num viewport de 390 e empurrava a PAGINA para o lado)
              mora num lugar so.

              Os contadores tem TONS DIFERENTES de proposito: azul e "o cliente
              respondeu", ambar e "fila nossa esperando um clique". A mesma cor
              nos dois faria os dois avisos se confundirem. */}
          <Segmentado
            rotulo="Filtrar o board"
            valor={foco}
            aoTrocar={setFoco}
            itens={FOCOS.map((f) => ({
              chave: f.chave,
              rotulo: f.label,
              contador:
                f.chave === "respondeu"
                  ? totalResponderam
                  : f.chave === "aprovacao"
                    ? totalPendentes
                    : undefined,
              tomDoContador: f.chave === "aprovacao" ? ("alerta" as const) : ("info" as const),
            }))}
          />

          {usuarioAtual.role === "admin" && (
            <select
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="foco px-3 py-2 text-rotulo font-medium bg-superficie border border-fio rounded-xl"
            >
              <option value="todos">Todos os responsáveis</option>
              {responsaveis.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          )}

          {filtroAtivo && (
            <button
              onClick={limparFiltros}
              className="foco flex items-center gap-1 px-3 py-2 text-rotulo font-semibold text-tinta-suave hover:text-risco rounded-xl"
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

      {/* Com filtro ligado e nenhum card, TODAS as colunas diziam "Nenhum
          negócio nesta etapa" e nada explicava que a culpa era do filtro. Pior
          no filtro novo: fila zerada é VITÓRIA, e ler seis vezes "nenhum
          negócio" parece erro.

          O `Vazio` já existe e já é usado assim no admin — a diferença aqui é
          que a frase muda com o motivo, porque "não achei nada" e "não há nada
          a fazer" são notícias opostas. */}
      {filtroAtivo && filtrados.length === 0 ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <Vazio
            icone={foco === "aprovacao" || foco === "respondeu" ? CheckCircle2 : Search}
            titulo={
              foco === "aprovacao"
                ? "Fila zerada"
                : foco === "respondeu"
                  ? "Ninguém esperando"
                  : "Nada com esses filtros"
            }
            acao={
              <button
                onClick={limparFiltros}
                className="foco flex items-center gap-1 px-3 py-2 text-rotulo font-semibold text-tinta-suave hover:text-risco rounded-xl"
              >
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </button>
            }
          >
            {foco === "aprovacao"
              ? "Nenhuma mensagem esperando aprovação neste funil. Quando a cadência gerar o próximo toque, ele aparece aqui."
              : foco === "respondeu"
                ? "Nenhuma resposta por ler neste funil."
                : "Nenhum card combina com a busca e os filtros ativos."}
          </Vazio>
        </div>
      ) : (
      <KanbanBoard
        etapas={etapas}
        negocios={filtrados}
        variante={ehSdr ? "sdr" : "vendas"}
        cadencias={cadencias}
        aprovacoes={aprovacoes}
        totaisPorEtapa={totais}
        carregadosPorEtapa={carregadosPorEtapa}
        carregandoMais={carregandoMais}
        onCarregarMais={carregarMais}
        onNovoNegocio={abrirNovoNegocio}
        onMoverNegocio={moverNegocio}
      />
      )}

      {modalAberto && (
        <NewLeadModal
          pipelineId={pipelineId}
          etapas={etapas}
          etapaInicial={etapaNovoNegocio}
          responsaveis={responsaveis}
          usuarioAtual={usuarioAtual}
          ehSdr={ehSdr}
          onClose={() => setModalAberto(false)}
        />
      )}
    </div>
  );
}

/**
 * Um estado do board na faixa de apoio: ícone, número e o que ele conta.
 *
 * Substitui o `ResumoCard`, que era `bg-superficie border border-fio
 * rounded-2xl` — moldura completa para cada número, quatro vezes seguidas. Sem
 * moldura nenhuma aqui de propósito: estes três números são APOIO do número
 * grande ao lado, e dar cartão a eles era dar o mesmo peso visual ao apoio e
 * ao assunto (craft R4).
 *
 * Em zero fica em tinta fraca — nada a fazer não é notícia e não precisa de
 * cor. É a diferença entre um painel que avisa e um que só exibe.
 */
function Estado({
  icone,
  valor,
  rotulo,
  cor,
}: {
  icone: React.ReactNode;
  valor: number;
  rotulo: string;
  cor?: string;
}) {
  return (
    <span className={`flex items-center gap-1.5 text-rotulo ${cor ?? "text-tinta-fraca"}`}>
      <span aria-hidden>{icone}</span>
      <span className="text-corpo font-medium tabular">{valor}</span>
      <span className={cor ? "text-tinta-suave" : undefined}>{rotulo}</span>
    </span>
  );
}
