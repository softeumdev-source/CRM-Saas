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
  Apoio,
  AreaTexto,
  Botao,
  Cartao,
  Entrada,
  Modal,
  Rotulo,
  Selecao,
  useIdDeAbas,
} from "@/components/ui";
import { Conversa } from "@/components/negocio/Conversa";

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

  /** Estado real do canal. `null` enquanto carrega — o compositor não chuta. */
  const [whatsapp, setWhatsapp] = useState<{
    configurado: boolean;
    pausado: boolean;
    motivo: string | null;
  } | null>(null);
  const idDasAbas = useIdDeAbas("conversa");

  const carregar = useCallback(async () => {
    const supabase = createClient();
    try {
      // Com prazo: rede pendurada não rejeita, e sem isto a aba ficaria em
      // "carregando…" para sempre, sem erro e sem saída.
      const [cad, insc, msg] = await comPrazo(Promise.all([
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

      // Estado do canal, para o compositor dizer a verdade em vez de oferecer
      // uma caixa de texto que nao manda nada. Fora do Promise.all porque a
      // falha aqui nao pode derrubar a conversa: sem esta linha o compositor
      // fica em `null` e mostra o estado neutro, que ja e o certo.
      const { data: cfg } = await supabase
        .from("whatsapp_config")
        .select("pausado, pausado_motivo, numero_id")
        .maybeSingle();
      setWhatsapp({
        configurado: !!cfg?.numero_id,
        pausado: !!cfg?.pausado,
        motivo: cfg?.pausado_motivo ?? null,
      });
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Não foi possível carregar as mensagens.");
    } finally {
      setCarregando(false);
    }
  }, [negocio.id, negocio.pipeline_id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Abrir a conversa marca as respostas como lidas — e apaga o sinal do card
   * no board, em todas as abas abertas, porque o UPDATE em `negocios` viaja
   * pelo realtime que o board ja assina.
   *
   * Vai direto do cliente, sem RPC: `negocios_update` tem o USING IDENTICO ao
   * `negocios_select` e, sem WITH CHECK proprio, o Postgres reaproveita o
   * USING. Ou seja, quem enxerga o card pode atualiza-lo — a mesma permissao
   * que `moverEtapa` ja usa.
   *
   * Depende so do id: nao deve disparar de novo a cada resposta que chega
   * enquanto a aba esta aberta, senao o contador zeraria antes de ser visto.
   */
  useEffect(() => {
    if (!negocio.respostas_nao_lidas) return;
    void createClient()
      .from("negocios")
      .update({ respostas_nao_lidas: 0, respostas_lidas_em: new Date().toISOString() })
      .eq("id", negocio.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocio.id]);

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
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando cadência…
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-rose-200 dark:border-rose-900 shadow-xs p-8 text-center space-y-3">
        <AlertTriangle className="h-6 w-6 text-rose-500 mx-auto" />
        <p className="text-sm text-slate-700 dark:text-slate-200">{erroCarga}</p>
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
        <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Fila de aprovação — o que está esperando alguém dizer "pode ir"   */}
      {/* ---------------------------------------------------------------- */}
      {aguardando.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-3xl border border-amber-200 dark:border-amber-900 p-5 space-y-3">
          <h3 className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {aguardando.length === 1
              ? "1 mensagem esperando sua aprovação"
              : `${aguardando.length} mensagens esperando sua aprovação`}
          </h3>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Nada sai daqui sozinho. Leia, ajuste se precisar, e só então aprove.
          </p>

          {aguardando.map((m) => (
            <div
              key={m.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-900 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{m.assunto}</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <Mail className="h-3 w-3" /> {m.destino}
                    {m.gerado_por === "ia" && (
                      <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold">
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
                className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 max-h-52 overflow-y-auto [&_p]:mb-2"
                dangerouslySetInnerHTML={{ __html: m.corpo }}
              />
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Cadência: estado atual ou inscrição, com o plano à vista          */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4">
        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Send className="h-4 w-4 text-indigo-600" /> Cadência
        </h3>

        {ativa ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {ativa.cadencia?.nome || "Cadência"}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
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
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nenhuma cadência configurada para este funil. O administrador cria as cadências no painel.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="min-w-[240px]">
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
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
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase text-slate-400 mb-2">
                  O que vai acontecer
                </p>
                <ol className="space-y-1.5">
                  {plano.map(({ passo, quando }) => (
                    <li key={passo.id} className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <span className="h-5 w-5 shrink-0 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold">
                        {passo.ordem}
                      </span>
                      <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                      {formatarDataHora(quando.toISOString())} · {passo.canal}
                      {passo.parar_se_respondeu && (
                        <span className="text-slate-400">— não sai se o lead já tiver respondido</span>
                      )}
                    </li>
                  ))}
                </ol>
                <p className="text-[11px] text-slate-500 mt-2">
                  {cadenciaEscolhida?.autonoma
                    ? "Esta cadência está autônoma: as mensagens saem sem passar por aprovação."
                    : "Cada mensagem vai esperar sua aprovação antes de sair."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* A conversa com o cliente: WhatsApp e e-mail, no mesmo card        */}
      {/* ---------------------------------------------------------------- */}
      <Cartao>
        <div className="mb-3">
          <Rotulo>Conversa</Rotulo>
          <Apoio>
            O histórico segue o negócio: passar do SDR para o vendedor não perde nada, porque a
            transferência não mexe no dono das mensagens.
          </Apoio>
        </div>
        <Conversa
          negocio={negocio}
          mensagens={mensagens}
          whatsapp={whatsapp}
          idBase={idDasAbas}
        />
      </Cartao>

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
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Assunto</label>
            <Entrada value={assuntoEdit} onChange={(e) => setAssuntoEdit(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
              Corpo (HTML)
            </label>
            <AreaTexto rows={12} value={corpoEdit} onChange={(e) => setCorpoEdit(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
