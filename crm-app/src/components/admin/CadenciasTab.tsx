"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, Check, FileText, Loader2, MessageCircle, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { comPrazo } from "@/lib/prazo";
import { AreaTexto, Botao, Cartao, Entrada, Modal, Rotulo, Selo } from "@/components/ui";
import type { CadenciaComPassos } from "@/lib/cadencia";
import type { Tables } from "@/lib/supabase/types";
import { formatarDataHora } from "@/lib/atividades";

type Template = Tables<"templates_mensagem">;
type ConfigWhats = Tables<"whatsapp_config">;

export function CadenciasTab() {
  const [cadencias, setCadencias] = useState<CadenciaComPassos[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [whats, setWhats] = useState<ConfigWhats | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const [editando, setEditando] = useState<Template | null>(null);
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [externoId, setExternoId] = useState("");

  const carregar = useCallback(async () => {
    const supabase = createClient();
    try {
      const [cad, tpl, wa] = await comPrazo(
        Promise.all([
          supabase.from("cadencias").select("*, passos:cadencia_passos(*)").order("criado_em"),
          supabase.from("templates_mensagem").select("*").order("canal").order("nome"),
          supabase.from("whatsapp_config").select("*").maybeSingle(),
        ]),
      );
      const falha = cad.error || tpl.error || wa.error;
      if (falha) {
        setErro(`Não foi possível carregar: ${falha.message}`);
        return;
      }
      setErro(null);
      setCadencias((cad.data || []) as unknown as CadenciaComPassos[]);
      setTemplates(tpl.data || []);
      setWhats(wa.data ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alternar = async (id: string, campo: "autonoma" | "ativa", valor: boolean) => {
    setSalvando(id + campo);
    // Chave computada vira índice genérico e o tipo gerado recusa; os dois
    // campos são booleanos e explícitos, então explicitar é mais barato que
    // afrouxar o tipo.
    const patch = campo === "autonoma" ? { autonoma: valor } : { ativa: valor };
    const { error } = await createClient().from("cadencias").update(patch).eq("id", id);
    setSalvando(null);
    if (error) {
      setErro(error.message);
      return;
    }
    setErro(null);
    void carregar();
  };

  /**
   * Ligar o canal LIMPA a marca de pausa automática. Sem isso, quem religasse
   * depois de o monitor cortar continuaria vendo "pausado pelo monitor" com o
   * canal no ar — a tela mentiria sobre o próprio estado.
   */
  const alternarWhats = async (pausar: boolean) => {
    if (!whats) return;
    setSalvando("whats");
    const { error } = await createClient()
      .from("whatsapp_config")
      .update({
        pausado: pausar,
        pausado_automaticamente: false,
        pausado_em: pausar ? new Date().toISOString() : null,
        pausado_motivo: pausar ? "Desligado manualmente." : null,
      })
      .eq("id", whats.id);
    setSalvando(null);
    if (error) {
      setErro(error.message);
      return;
    }
    setErro(null);
    void carregar();
  };

  const salvarTemplate = async () => {
    if (!editando) return;
    const alvo = editando;
    setEditando(null);
    setSalvando(alvo.id);
    const { error } = await createClient()
      .from("templates_mensagem")
      .update({
        assunto: assunto || null,
        corpo,
        // Só o WhatsApp tem id na Meta. Gravar isso num modelo de e-mail seria
        // guardar lixo num campo que ninguém lê.
        ...(alvo.canal === "whatsapp"
          ? { template_externo_id: externoId.trim() || null }
          : {}),
      })
      .eq("id", alvo.id);
    setSalvando(null);
    if (error) {
      setErro(error.message);
      return;
    }
    void carregar();
  };

  if (carregando) {
    return (
      <Cartao className="p-8 flex items-center justify-center gap-2 text-corpo text-tinta-suave">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando cadências…
      </Cartao>
    );
  }

  return (
    <div className="space-y-5">
      {erro && (
        <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      <Cartao className="space-y-4">
        <div>
          <Rotulo className="flex items-center gap-2">
            <Send className="h-4 w-4 text-acento" /> Cadências ({cadencias.length})
          </Rotulo>
          <p className="text-rotulo text-tinta-suave mt-1">
            O interruptor que importa é o de autonomia. Com ele desligado, cada mensagem espera
            alguém aprovar antes de sair. Ligue só quando confiar no que está sendo escrito — o
            e-mail enviado não volta.
          </p>
        </div>

        {cadencias.length === 0 ? (
          <p className="text-rotulo text-tinta-suave">Nenhuma cadência cadastrada.</p>
        ) : (
          <div className="space-y-3">
            {cadencias.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-fio p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-corpo text-tinta">{c.nome}</p>
                      {/* O selo importa porque a automação ESCOLHE por aqui: o
                          lead que volta da nutrição entra na de reaquecimento,
                          e a de primeiro contato fica para lead novo. Sem o
                          selo, duas linhas com nomes parecidos e ninguém sabe
                          qual o robô vai usar. */}
                      {c.proposito === "reaquecimento" && (
                        <Selo tom="info" icone={RotateCcw}>
                          Reaquecimento
                        </Selo>
                      )}
                    </div>
                    <p className="text-rotulo text-tinta-suave mt-0.5">
                      {c.tipo} · {(c.passos || []).length} toques
                      {c.proposito === "reaquecimento"
                        ? " · usada quando um lead volta da nutrição"
                        : " · usada em lead novo"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      disabled={salvando === c.id + "ativa"}
                      onClick={() => void alternar(c.id, "ativa", !c.ativa)}
                    >
                      {c.ativa ? "Ativa" : "Pausada"}
                    </Botao>
                    <Botao
                      tamanho="sm"
                      variante={c.autonoma ? "perigo" : "secundario"}
                      disabled={salvando === c.id + "autonoma"}
                      onClick={() => void alternar(c.id, "autonoma", !c.autonoma)}
                    >
                      {c.autonoma ? <Bot className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      {c.autonoma ? "Autônoma" : "Com aprovação"}
                    </Botao>
                  </div>
                </div>

                {c.autonoma && (
                  <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    As mensagens desta cadência saem sem ninguém ler. Todo lead inscrito nela vai
                    receber os {(c.passos || []).length} toques automaticamente.
                  </p>
                )}

                <ol className="space-y-1">
                  {[...(c.passos || [])]
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((p) => (
                      <li key={p.id} className="text-rotulo text-tinta-suave flex items-center gap-2">
                        <span className="h-5 w-5 shrink-0 rounded-full bg-recuo flex items-center justify-center text-rotulo font-medium">
                          {p.ordem}
                        </span>
                        {p.atraso_horas === 0 ? "na hora" : `+${p.atraso_horas}h`} · {p.canal}
                        {" · "}
                        {templates.find((t) => t.id === p.template_id)?.nome || "sem modelo"}
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Cartao>

      {whats && (
        <Cartao className="space-y-4">
          <div>
            <Rotulo className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-ok" /> WhatsApp
            </Rotulo>
            <p className="text-rotulo text-tinta-suave mt-1">
              Mensagem iniciada pela empresa só sai por template aprovado pela Meta. Use um número
              separado do comercial: se ele for bloqueado a ponto de ser banido, você perde o
              descartável, não o número da empresa.
            </p>
          </div>

          {whats.pausado ? (
            <div
              className={`rounded-2xl border p-4 ${
                whats.pausado_automaticamente
                  ? "border-risco/40 bg-risco-fraco"
                  : "border-fio bg-recuo"
              }`}
            >
              <p
                className={`text-corpo font-medium flex items-center gap-2 ${
                  whats.pausado_automaticamente
                    ? "text-risco"
                    : "text-tinta"
                }`}
              >
                {whats.pausado_automaticamente ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {whats.pausado_automaticamente ? "Pausado pelo monitor" : "Canal desligado"}
              </p>
              <p className="text-rotulo mt-1 text-tinta-suave">
                {whats.pausado_motivo ||
                  "O canal nasce desligado. Ligue só com o número separado no ar e os templates já aprovados."}
                {whats.pausado_em && ` (${formatarDataHora(whats.pausado_em)})`}
              </p>
              <div className="mt-3">
                <Botao
                  tamanho="sm"
                  variante="secundario"
                  disabled={salvando === "whats"}
                  onClick={() => void alternarWhats(false)}
                >
                  Ligar o canal
                </Botao>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-ok/40 bg-ok-fraco p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-corpo font-medium text-ok">Canal ligado</p>
                <p className="text-rotulo text-ok mt-0.5">
                  Até {whats.limite_por_hora}/hora e {whats.limite_por_dia}/dia, com no mínimo{" "}
                  {whats.horas_entre_mensagens_por_lead}h entre mensagens para o mesmo lead. O monitor
                  pausa sozinho se mais de {Math.round(Number(whats.limite_taxa_falha) * 100)}% das
                  últimas {whats.janela_monitor} falharem.
                </p>
              </div>
              <Botao
                tamanho="sm"
                variante="perigo"
                disabled={salvando === "whats"}
                onClick={() => void alternarWhats(true)}
              >
                Desligar
              </Botao>
            </div>
          )}
        </Cartao>
      )}

      <Cartao className="space-y-4">
        <div>
          <Rotulo className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-acento" /> Modelos de mensagem ({templates.length})
          </Rotulo>
          <p className="text-rotulo text-tinta-suave mt-1">
            O texto aceita <code className="font-mono">{"{{primeiro_nome}}"}</code>,{" "}
            <code className="font-mono">{"{{contato}}"}</code>,{" "}
            <code className="font-mono">{"{{empresa}}"}</code> e{" "}
            <code className="font-mono">{"{{vendedor}}"}</code>, trocados no momento do envio.
          </p>
        </div>

        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-fio p-3"
            >
              <div className="min-w-0">
                <p className="text-corpo font-medium text-tinta truncate">
                  {t.nome}
                </p>
                <p className="text-rotulo text-tinta-suave truncate">
                  {t.canal} · {t.categoria} ·{" "}
                  {t.canal === "whatsapp"
                    ? t.template_externo_id || "sem modelo aprovado na Meta"
                    : t.assunto || "sem assunto"}
                </p>
              </div>
              <Botao
                tamanho="sm"
                variante="secundario"
                onClick={() => {
                  setEditando(t);
                  setAssunto(t.assunto || "");
                  setCorpo(t.corpo);
                  setExternoId(t.template_externo_id || "");
                }}
              >
                Editar
              </Botao>
            </div>
          ))}
        </div>
      </Cartao>

      <Modal
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={editando ? `Modelo: ${editando.nome}` : "Modelo"}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setEditando(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={() => void salvarTemplate()}>
              <Check className="h-4 w-4" /> Salvar
            </Botao>
          </>
        }
      >
        <div className="space-y-3">
          {editando?.canal === "email" && (
            <div>
              <label className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">Assunto</label>
              <Entrada value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">
              {editando?.canal === "email" ? "Corpo (HTML)" : "Mensagem"}
            </label>
            <AreaTexto rows={14} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
          </div>

          {/* Sem este campo NENHUM template de WhatsApp podia ser enviado: a
              cadência exige o nome aprovado na Meta e recusa o passo para
              sempre quando ele está em branco — sem erro visível, só um lead
              que nunca recebe nada. */}
          {editando?.canal === "whatsapp" && (
            <div>
              <label
                className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1"
                htmlFor="template-externo-id"
              >
                Nome do template na Meta
              </label>
              <Entrada
                id="template-externo-id"
                value={externoId}
                onChange={(e) => setExternoId(e.target.value)}
                placeholder="ex.: primeiro_contato_pt_br"
              />
              <p className="text-rotulo text-tinta-suave mt-1">
                O nome exato do modelo <strong>já aprovado</strong> no Gerenciador da Meta
                (Ferramentas &rsaquo; Modelos de mensagem). Em branco, este passo da cadência não
                sai — e o texto acima é só a prévia que fica na fila de aprovação, não o que a Meta
                envia.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
