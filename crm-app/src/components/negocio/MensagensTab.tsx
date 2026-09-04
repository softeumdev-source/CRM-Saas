"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Clock,
  Loader2,
  Mail,
  Pause,
  Play,
  Send,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { formatarDataHora } from "@/lib/atividades";
import { comPrazo } from "@/lib/prazo";
import type { NegocioComRelacoes, Usuario } from "@/lib/types";
import {
  ROTULO_STATUS_INSCRICAO,
  aprovarMensagem,
  cancelarMensagem,
  inscrever,
  mudarStatusDaInscricao,
  planoDaCadencia,
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

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useSincronizacao(carregar, {
    canal: `mensagens-${negocio.id}`,
    tabelas: [
      { tabela: "mensagens", filtro: `negocio_id=eq.${negocio.id}` },
      { tabela: "cadencia_inscricoes", filtro: `negocio_id=eq.${negocio.id}` },
    ],
  });

  const ativa = inscricoes.find((i) => i.status === "ativa" || i.status === "pausada");
  const cadenciaEscolhida = cadencias.find((c) => c.id === escolhida) || cadencias[0];
  const plano = cadenciaEscolhida ? planoDaCadencia(cadenciaEscolhida.passos || []) : [];
  const aguardando = mensagens.filter((m) => m.status === "aguardando_aprovacao");

  /**
   * O toque de WhatsApp que o motor vai PULAR por falta de template aprovado
   * na Meta.
   *
   * Sem isto o "O que vai acontecer" prometeria dez mensagens e entregaria
   * cinco — e a lista existe justamente para que ninguém clique em "inscrever"
   * sem saber o que assinou.
   */
  const naoVaiSair = (passo: { canal: string; template_id: string | null }) =>
    passo.canal === "whatsapp" && !(passo.template_id && aprovadosNaMeta.has(passo.template_id));
  const vaoSair = plano.filter(({ passo }) => !naoVaiSair(passo)).length;

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
      <div className="bg-superficie rounded-2xl border border-fio shadow-xs p-8 flex items-center justify-center gap-2 text-corpo text-tinta-suave">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando cadência…
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div className="bg-superficie rounded-2xl border border-risco/40 shadow-xs p-8 text-center space-y-3">
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
      <div className="bg-superficie rounded-2xl border border-fio shadow-xs p-5 space-y-4">
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
              <div className="min-w-[240px]">
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
                    const pulado = naoVaiSair(passo);
                    return (
                      <li
                        key={passo.id}
                        className="text-rotulo text-tinta-suave flex items-center gap-2 flex-wrap"
                      >
                        <span className="h-5 w-5 shrink-0 rounded-full bg-superficie border border-fio flex items-center justify-center text-rotulo font-medium">
                          {passo.ordem}
                        </span>
                        <Clock className="h-3 w-3 text-tinta-fraca shrink-0" />
                        <span className={pulado ? "line-through" : undefined}>
                          {formatarDataHora(quando.toISOString())} · {passo.canal}
                        </span>
                        {pulado ? (
                          <span className="text-alerta">— não sai: falta aprovação da Meta</span>
                        ) : (
                          passo.parar_se_respondeu && (
                            <span className="text-tinta-fraca">
                              — não sai se o lead já tiver respondido
                            </span>
                          )
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-rotulo text-tinta-suave mt-2">
                  {vaoSair < plano.length && (
                    <>
                      Dos {plano.length} toques, {vaoSair} vão sair hoje: o WhatsApp só entrega por
                      template aprovado pela Meta, e os que faltam são pulados sem parar o resto.{" "}
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
        titulo="Revisar antes de aprovar"
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
                await executar(alvo.id, () => salvarTextoDaMensagem(alvo.id, assuntoEdit, corpoEdit));
              }}
            >
              Salvar texto
            </Botao>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">Assunto</label>
            <Entrada value={assuntoEdit} onChange={(e) => setAssuntoEdit(e.target.value)} />
          </div>
          <div>
            <label className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">
              Corpo (HTML)
            </label>
            <AreaTexto rows={12} value={corpoEdit} onChange={(e) => setCorpoEdit(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
