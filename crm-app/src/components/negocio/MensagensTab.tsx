"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  Pause,
  Play,
  Send,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { formatarDataHora } from "@/lib/atividades";
import { comPrazo } from "@/lib/prazo";
import { linkDoWhatsapp } from "@/lib/contato";
import type { NegocioComRelacoes, Usuario } from "@/lib/types";
import {
  ROTULO_STATUS_INSCRICAO,
  aprovarMensagem,
  cancelarMensagem,
  inscrever,
  mudarStatusDaInscricao,
  planoDaCadencia,
  registrarTarefaEnviada,
  salvarTextoDaMensagem,
  type CadenciaComPassos,
  type Inscricao,
  type Mensagem,
} from "@/lib/cadencia";
import {
  AreaTexto,
  Botao,
  Entrada,
  Modal,
  Selecao,
} from "@/components/ui";

export function MensagensTab({
  negocio,
  usuarioAtual,
}: {
  negocio: NegocioComRelacoes;
  usuarioAtual: Usuario;
}) {
  const [cadencias, setCadencias] = useState<CadenciaComPassos[]>([]);
  const [inscricoes, setInscricoes] = useState<(Inscricao & { cadencia: { nome: string } | null })[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  /** Modelos que já têm id aprovado na Meta — os únicos que o WhatsApp entrega. */
  const [aprovadosNaMeta, setAprovadosNaMeta] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [escolhida, setEscolhida] = useState("");
  const [inscrevendo, setInscrevendo] = useState(false);
  const [agindo, setAgindo] = useState<string | null>(null);

  /**
   * Quais tarefas já tiveram a conversa aberta nesta sessão.
   *
   * Abrir o WhatsApp NÃO é prova de que a mensagem saiu — a pessoa pode fechar
   * a aba, mudar de ideia, ou o número pode estar errado. Este conjunto só
   * decide quando PERGUNTAR "você mandou?"; quem responde é ela.
   */
  const [abriu, setAbriu] = useState<Set<string>>(new Set());

  const [reescrevendo, setReescrevendo] = useState<string | null>(null);
  const [editando, setEditando] = useState<Mensagem | null>(null);
  const [assuntoEdit, setAssuntoEdit] = useState("");
  const [corpoEdit, setCorpoEdit] = useState("");

  const carregar = useCallback(async () => {
    const supabase = createClient();
    try {
      // Com prazo: rede pendurada não rejeita, e sem isto a aba ficaria em
      // "carregando…" para sempre, sem erro e sem saída.
      const [cad, insc, msg, tpl] = await comPrazo(Promise.all([
      supabase
        .from("cadencias")
        .select("*, passos:cadencia_passos(*)")
        .eq("ativa", true)
        .eq("pipeline_id", negocio.pipeline_id ?? ""),
      supabase
        .from("cadencia_inscricoes")
        .select("*, cadencia:cadencias(nome)")
        .eq("negocio_id", negocio.id)
        .order("criado_em", { ascending: false }),
      supabase
        .from("mensagens")
        .select("*")
        .eq("negocio_id", negocio.id)
        .order("criado_em", { ascending: false })
        .limit(100),
      // Só o id da Meta interessa aqui, e é o que decide se um toque de
      // WhatsApp vai mesmo sair. Consulta separada, e não `embed` dentro dos
      // passos, porque embed em tabela com mais de um caminho de FK é a
      // armadilha que já derrubou o Kanban duas vezes neste projeto — não
      // vale o risco por uma coluna.
      supabase.from("templates_mensagem").select("id, template_externo_id"),
      ]));

      // O supabase-js NÃO lança em falha de rede: devolve { data: null, error }.
      // Sem olhar o erro, uma conexão caída chegava aqui como três listas
      // vazias e a aba dizia "nenhuma cadência configurada" — que é uma
      // afirmação sobre o banco, não sobre a rede. Medido no navegador: era
      // exatamente isso que aparecia.
      const falha = cad.error || insc.error || msg.error;
      if (falha) {
        setErroCarga(`Não foi possível carregar as mensagens: ${falha.message}`);
        return;
      }

      // Só limpa o erro DEPOIS de um carregamento bom. Limpar no início fazia
      // a mensagem de falha sumir a cada recarga periódica (a sincronização
      // tenta de novo a cada poucos segundos), e no lugar dela aparecia o
      // estado vazio — "nenhuma cadência configurada" — enquanto a rede
      // continuava fora. Medido no navegador: era o que dava para ver.
      setErroCarga(null);
      setCadencias((cad.data || []) as unknown as CadenciaComPassos[]);
      setInscricoes((insc.data || []) as never);
      setMensagens(msg.data || []);
      // `tpl.error` fica DE FORA do `falha` acima de propósito: o plano é um
      // detalhe da tela de inscrição, e não pode transformar a aba inteira em
      // erro. Sem os modelos, nenhum toque é marcado como aprovado — que é o
      // estado real de hoje, e o lado seguro do engano.
      setAprovadosNaMeta(
        new Set((tpl.data || []).filter((t) => t.template_externo_id).map((t) => t.id)),
      );

    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Não foi possível carregar as mensagens.");
    } finally {
      setCarregando(false);
    }
  }, [negocio.id, negocio.pipeline_id]);


  // `carregarAoMontar` em vez de um `useEffect` separado: o mesmo gancho que
  // ja escuta o Realtime tambem faz a primeira carga, adiada para fora do
  // corpo do efeito. Uma peca a menos, e sem o render em cascata.
  useSincronizacao(carregar, {
    carregarAoMontar: true,
    canal: `mensagens-${negocio.id}`,
    tabelas: [
      { tabela: "mensagens", filtro: `negocio_id=eq.${negocio.id}` },
      { tabela: "cadencia_inscricoes", filtro: `negocio_id=eq.${negocio.id}` },
    ],
  });

  const ativa = inscricoes.find((i) => i.status === "ativa" || i.status === "pausada");
  /**
   * A cadência já vem escolhida — e a escolhida é a de PRIMEIRO CONTATO.
   *
   * Antes era `cadencias[0]`, a primeira que o banco devolvesse. Com três
   * cadências ativas no funil (primeiro contato, reaquecimento e no-show), isso
   * é sorteio: dá para clicar "Inscrever" achando que começou a prospecção e
   * ter começado a sequência de remarcação de uma reunião que nunca existiu.
   */
  const cadenciaEscolhida =
    cadencias.find((c) => c.id === escolhida) ||
    cadencias.find((c) => c.proposito === "primeiro_contato") ||
    cadencias[0];
  const plano = cadenciaEscolhida ? planoDaCadencia(cadenciaEscolhida.passos || []) : [];
  const pendentes = mensagens.filter((m) => m.status === "aguardando_aprovacao");
  // Duas filas, porque são dois verbos. "Aprovar" delega ao sistema; a tarefa
  // manual é trabalho que só a pessoa faz — e oferecer "Aprovar e enviar" numa
  // delas mandaria a mensagem pela API da Meta, cobrada, que é exatamente a
  // decisão que este caminho existe para evitar.
  const tarefas = pendentes.filter((m) => m.envio_manual);
  const aguardando = pendentes.filter((m) => !m.envio_manual);

  /**
   * O toque que vira TAREFA em vez de sair sozinho: WhatsApp sem template
   * aprovado na Meta.
   *
   * Antes esse toque era PULADO, e a lista dizia "não sai". Hoje ele sai — pela
   * sua mão, no WhatsApp Web, de graça. A lista continua existindo pelo mesmo
   * motivo: ninguém deveria clicar em "inscrever" sem saber o que assinou, e
   * catorze toques dos quais sete são trabalho seu é um compromisso diferente
   * de catorze automáticos.
   */
  const ehTarefaManual = (passo: { canal: string; template_id: string | null }) =>
    passo.canal === "whatsapp" && !(passo.template_id && aprovadosNaMeta.has(passo.template_id));
  const quantasManuais = plano.filter(({ passo }) => ehTarefaManual(passo)).length;

  /**
   * Pede à IA um texto melhor para uma mensagem que ainda espera aprovação.
   * A rota não envia nada e recusa o texto se ele falar de preço, desconto ou
   * garantia — o aviso aqui é o dessa recusa, e é informação útil, não ruído.
   */
  const reescreverComIa = async (mensagemId: string) => {
    setReescrevendo(mensagemId);
    try {
      const resp = await comPrazo(
        fetch("/api/ia/mensagem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensagemId }),
        }),
        20_000,
      );
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.error || "Não foi possível reescrever.");
        return;
      }
      setErro(null);
      void carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível reescrever.");
    } finally {
      setReescrevendo(null);
    }
  };

  const executar = async (chave: string, acao: () => Promise<{ ok: boolean; erro?: string }>) => {
    setAgindo(chave);
    const r = await acao();
    setAgindo(null);
    if (!r.ok) {
      setErro(r.erro || "Não foi possível concluir.");
      return;
    }
    setErro(null);
    void carregar();
  };

  if (carregando) {
    return (
      <div className="bg-superficie rounded-2xl border border-fio shadow-cartao p-8 flex items-center justify-center gap-2 text-corpo text-tinta-suave">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando cadência…
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div className="bg-superficie rounded-2xl border border-risco/40 shadow-cartao p-8 text-center space-y-3">
        <AlertTriangle className="h-6 w-6 text-risco mx-auto" />
        <p className="text-corpo text-tinta-suave">{erroCarga}</p>
        <Botao
          variante="secundario"
          onClick={() => {
            setCarregando(true);
            void carregar();
          }}
        >
          Tentar de novo
        </Botao>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {erro && (
        <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Tarefas de WhatsApp — o que VOCÊ manda, pelo Web, de graça        */}
      {/* ---------------------------------------------------------------- */}
      {/* Vem ANTES da fila de aprovação de propósito: aprovar é delegar (o
          sistema manda em seguida), e isto aqui é trabalho que só existe se
          alguém fizer. Trabalho que ninguém mais vai fazer fica em cima. */}
      {tarefas.length > 0 && (
        <div className="bg-acento-fraco rounded-2xl border border-acento/40 p-5 space-y-3">
          <h3 className="font-medium text-corpo text-acento flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            {tarefas.length === 1
              ? "1 mensagem de WhatsApp para você mandar"
              : `${tarefas.length} mensagens de WhatsApp para você mandar`}
          </h3>
          <p className="text-rotulo text-acento">
            O texto já está pronto, com o nome e a empresa preenchidos. Abrir leva você à conversa
            com a mensagem escrita — falta apertar enviar lá. Depois marque aqui, senão o histórico
            do lead fica sem ela e a cadência continua como se você não tivesse falado com ele.
          </p>

          {tarefas.map((m) => {
            const link = linkDoWhatsapp(m.destino, m.corpo);
            return (
              <div
                key={m.id}
                className="bg-superficie rounded-2xl border border-acento/40 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-corpo font-medium text-tinta">Toque de WhatsApp</p>
                    <p className="text-rotulo text-tinta-suave flex items-center gap-1.5 mt-0.5">
                      <MessageCircle className="h-3 w-3" /> {m.destino || "sem número"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Botao
                      tamanho="sm"
                      variante="sutil"
                      onClick={() => {
                        setEditando(m);
                        setAssuntoEdit(m.assunto || "");
                        setCorpoEdit(m.corpo);
                      }}
                    >
                      Editar
                    </Botao>
                    <Botao
                      tamanho="sm"
                      variante="perigo"
                      disabled={agindo === m.id}
                      onClick={() => void executar(m.id, () => cancelarMensagem(m.id))}
                    >
                      <X className="h-3.5 w-3.5" /> Descartar
                    </Botao>
                    {/* Âncora de verdade, e não um botão com `window.open`: o
                        WhatsApp Web abre em aba nova, e um popup programático
                        é o que o navegador bloqueia. */}
                    <a
                      href={link || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!link}
                      title={
                        link
                          ? "Abre a conversa no WhatsApp com este texto já escrito"
                          : "Sem número válido no cadastro do contato — não dá para abrir a conversa"
                      }
                      onClick={(e) => {
                        if (!link) {
                          e.preventDefault();
                          return;
                        }
                        setAbriu((v) => new Set(v).add(m.id));
                      }}
                      className={[
                        "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-rotulo font-semibold",
                        "transition-colors duration-150 ease-out",
                        "foco",
                        link
                          ? "bg-acento-solido text-acento-tinta hover:bg-acento-solido-hover"
                          : "bg-recuo text-tinta-fraca pointer-events-none",
                      ].join(" ")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir no WhatsApp
                    </a>
                  </div>
                </div>

                {/* Texto puro, e não `dangerouslySetInnerHTML` como o e-mail
                    ao lado: o que vai para o WhatsApp é exatamente isto, e uma
                    tag renderizada aqui esconderia um `<b>` que o cliente
                    receberia cru. */}
                <p className="text-rotulo text-tinta-suave bg-recuo rounded-xl p-3 max-h-52 overflow-y-auto whitespace-pre-wrap">
                  {m.corpo}
                </p>

                {!link && (
                  <p className="text-rotulo font-medium text-alerta flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    O contato não tem um número de WhatsApp que dê para usar. Corrija o cadastro na
                    aba Geral e a conversa abre daqui.
                  </p>
                )}

                {/* PERGUNTA, não marca sozinho. Abrir o WhatsApp não prova que
                    a mensagem saiu — e um registro automático encheria o
                    histórico de mensagens que nunca existiram, com a cadência
                    confiando nele para decidir o toque seguinte. */}
                {abriu.has(m.id) && (
                  <div className="rounded-xl border border-acento/40 bg-acento-fraco p-3 flex flex-wrap items-center gap-2">
                    <p className="text-rotulo text-tinta flex-1 min-w-0">
                      Abri o WhatsApp com este texto. Você enviou?
                    </p>
                    <Botao
                      variante="primario"
                      tamanho="sm"
                      icone={Check}
                      carregando={agindo === m.id}
                      onClick={() =>
                        void executar(m.id, () => registrarTarefaEnviada(m.id, usuarioAtual.id))
                      }
                    >
                      Registrar como enviada
                    </Botao>
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      onClick={() =>
                        setAbriu((v) => {
                          const n = new Set(v);
                          n.delete(m.id);
                          return n;
                        })
                      }
                    >
                      Não enviei
                    </Botao>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Fila de aprovação — o que está esperando alguém dizer "pode ir"   */}
      {/* ---------------------------------------------------------------- */}
      {aguardando.length > 0 && (
        <div className="bg-alerta-fraco rounded-2xl border border-alerta/40 p-5 space-y-3">
          <h3 className="font-medium text-corpo text-alerta flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {aguardando.length === 1
              ? "1 mensagem esperando sua aprovação"
              : `${aguardando.length} mensagens esperando sua aprovação`}
          </h3>
          <p className="text-rotulo text-alerta">
            Nada sai daqui sozinho. Leia, ajuste se precisar, e só então aprove.
          </p>

          {aguardando.map((m) => (
            <div
              key={m.id}
              className="bg-superficie rounded-2xl border border-alerta/40 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-corpo font-medium text-tinta">{m.assunto}</p>
                  <p className="text-rotulo text-tinta-suave flex items-center gap-1.5 mt-0.5">
                    <Mail className="h-3 w-3" /> {m.destino}
                    {m.gerado_por === "ia" && (
                      <span className="inline-flex items-center gap-1 text-acento font-medium">
                        <Bot className="h-3 w-3" /> escrita por IA
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Botao
                    tamanho="sm"
                    variante="sutil"
                    disabled={reescrevendo === m.id}
                    onClick={() => void reescreverComIa(m.id)}
                  >
                    {reescrevendo === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                    Reescrever com IA
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="sutil"
                    onClick={() => {
                      setEditando(m);
                      setAssuntoEdit(m.assunto || "");
                      setCorpoEdit(m.corpo);
                    }}
                  >
                    Editar
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="perigo"
                    disabled={agindo === m.id}
                    onClick={() => void executar(m.id, () => cancelarMensagem(m.id))}
                  >
                    <X className="h-3.5 w-3.5" /> Descartar
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="primario"
                    disabled={agindo === m.id}
                    onClick={() => void executar(m.id, () => aprovarMensagem(m.id, usuarioAtual.id))}
                  >
                    {agindo === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Aprovar e enviar
                  </Botao>
                </div>
              </div>
              <div
                className="text-rotulo text-tinta-suave bg-recuo rounded-xl p-3 max-h-52 overflow-y-auto [&_p]:mb-2"
                dangerouslySetInnerHTML={{ __html: m.corpo }}
              />
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Cadência: estado atual ou inscrição, com o plano à vista          */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-superficie rounded-2xl border border-fio shadow-cartao p-5 space-y-4">
        <h3 className="font-medium text-corpo text-tinta flex items-center gap-2">
          <Send className="h-4 w-4 text-acento" /> Cadência
        </h3>

        {ativa ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-corpo font-medium text-tinta">
                  {ativa.cadencia?.nome || "Cadência"}
                </p>
                <p className="text-rotulo text-tinta-suave mt-0.5">
                  {ROTULO_STATUS_INSCRICAO[ativa.status]} · passo {ativa.passo_atual}
                  {ativa.proximo_envio_em
                    ? ` · próximo toque em ${formatarDataHora(ativa.proximo_envio_em)}`
                    : " · sem próximo toque agendado"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {ativa.status === "ativa" ? (
                  <Botao
                    tamanho="sm"
                    variante="secundario"
                    disabled={agindo === ativa.id}
                    onClick={() => void executar(ativa.id, () => mudarStatusDaInscricao(ativa.id, "pausada"))}
                  >
                    <Pause className="h-3.5 w-3.5" /> Pausar
                  </Botao>
                ) : (
                  <Botao
                    tamanho="sm"
                    variante="secundario"
                    disabled={agindo === ativa.id}
                    onClick={() => void executar(ativa.id, () => mudarStatusDaInscricao(ativa.id, "ativa"))}
                  >
                    <Play className="h-3.5 w-3.5" /> Retomar
                  </Botao>
                )}
                <Botao
                  tamanho="sm"
                  variante="perigo"
                  disabled={agindo === ativa.id}
                  onClick={() => void executar(ativa.id, () => mudarStatusDaInscricao(ativa.id, "cancelada"))}
                >
                  Encerrar
                </Botao>
              </div>
            </div>
          </div>
        ) : cadencias.length === 0 ? (
          <p className="text-rotulo text-tinta-suave">
            Nenhuma cadência configurada para este funil. O administrador cria as cadências no painel.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="min-w-60">
                <label className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">
                  Inscrever este lead em
                </label>
                <Selecao value={cadenciaEscolhida?.id || ""} onChange={(e) => setEscolhida(e.target.value)}>
                  {cadencias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({(c.passos || []).length} toques)
                    </option>
                  ))}
                </Selecao>
              </div>
              <Botao
                variante="primario"
                disabled={inscrevendo || !cadenciaEscolhida}
                onClick={async () => {
                  if (!cadenciaEscolhida) return;
                  setInscrevendo(true);
                  const r = await inscrever(
                    negocio.id,
                    cadenciaEscolhida,
                    usuarioAtual.id,
                    negocio.tenant_id,
                  );
                  setInscrevendo(false);
                  if (!r.ok) {
                    setErro(r.erro);
                    return;
                  }
                  setErro(null);
                  void carregar();
                }}
              >
                {inscrevendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Inscrever
              </Botao>
            </div>

            {/* O plano de ação: a sequência inteira, com data, ANTES de
                inscrever. Um botão "inscrever" sem esta lista pede um
                compromisso que ninguém consegue avaliar na hora de clicar. */}
            {plano.length > 0 && (
              <div className="bg-recuo rounded-2xl p-4">
                <p className="text-rotulo font-medium uppercase text-tinta-fraca mb-2">
                  O que vai acontecer
                </p>
                <ol className="space-y-1.5">
                  {plano.map(({ passo, quando }) => {
                    const manual = ehTarefaManual(passo);
                    return (
                      <li
                        key={passo.id}
                        className="text-rotulo text-tinta-suave flex items-center gap-2 flex-wrap"
                      >
                        <span className="h-5 w-5 shrink-0 rounded-full bg-superficie border border-fio flex items-center justify-center text-rotulo font-medium">
                          {passo.ordem}
                        </span>
                        <Clock className="h-3 w-3 text-tinta-fraca shrink-0" />
                        {/* O canal cru vinha do banco em minusculo. Sao so
                            dois valores possiveis — o check da coluna
                            `cadencia_passos.canal` aceita 'email' e
                            'whatsapp', nada mais. */}
                        <span>
                          {formatarDataHora(quando.toISOString())} ·{" "}
                          {passo.canal === "whatsapp" ? "WhatsApp" : "E-mail"}
                        </span>
                        {manual && (
                          <span className="text-acento font-medium">
                            — vira tarefa: você manda pelo WhatsApp Web
                          </span>
                        )}
                        {passo.parar_se_respondeu && (
                          <span className="text-tinta-fraca">
                            — não sai se o lead já tiver respondido
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-rotulo text-tinta-suave mt-2">
                  {quantasManuais > 0 && (
                    <>
                      Dos {plano.length} toques, {plano.length - quantasManuais} saem sozinhos e{" "}
                      {quantasManuais} viram tarefa sua. O WhatsApp só sai sozinho por template
                      aprovado pela Meta, que é cobrado por mensagem — aqui o sistema escreve o
                      texto na data certa e você manda pelo Web, de graça.{" "}
                    </>
                  )}
                  {cadenciaEscolhida?.autonoma
                    ? "Esta cadência está autônoma: as mensagens saem sem passar por aprovação."
                    : "Cada mensagem vai esperar sua aprovação antes de sair."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={editando?.canal === "whatsapp" ? "Ajustar antes de mandar" : "Revisar antes de aprovar"}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setEditando(null)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              onClick={async () => {
                if (!editando) return;
                const alvo = editando;
                setEditando(null);
                await executar(alvo.id, () =>
                  salvarTextoDaMensagem(
                    alvo.id,
                    alvo.canal === "whatsapp" ? null : assuntoEdit,
                    corpoEdit,
                  ),
                );
              }}
            >
              Salvar texto
            </Botao>
          </>
        }
      >
        <div className="space-y-3">
          {/* WhatsApp não tem assunto, e o corpo é texto puro. Mostrar "Corpo
              (HTML)" aqui convidaria a escrever uma tag que o cliente receberia
              literal, com os sinais de maior e menor à vista. */}
          {editando?.canal !== "whatsapp" && (
            <div>
              <label className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">Assunto</label>
              <Entrada value={assuntoEdit} onChange={(e) => setAssuntoEdit(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">
              {editando?.canal === "whatsapp" ? "Mensagem" : "Corpo (HTML)"}
            </label>
            <AreaTexto rows={12} value={corpoEdit} onChange={(e) => setCorpoEdit(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
