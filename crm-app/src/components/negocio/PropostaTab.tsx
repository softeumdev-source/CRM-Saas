"use client";

import { useState, useCallback } from "react";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Send,
  CheckCircle2,
  Clock,
  Download,
  Copy,
  Check,
  Plus,
  X,
  Eye,
  FileSignature,
  Trash2,
  BadgePercent,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import type { NegocioComRelacoes, Plano, Usuario } from "@/lib/types";
import { AVISOS_PREVIOS_DIAS, formatarMoeda } from "@/lib/types";
import { PdfFieldEditor, type CampoAssinatura } from "@/components/PdfFieldEditor";
import { Alerta, Button, Input } from "@/components/ui";

/**
 * Remove propostas repetidas mantendo a primeira ocorrência (a mais recente).
 * O Realtime pode entregar a proposta recém-criada antes do `fetch` de geração
 * responder — sem isso, a mesma proposta aparecia duas vezes na lista.
 */
function semDuplicadas<T extends { id: string }>(lista: T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)));
}

function parseMoeda(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(limpo) || 0;
}

function exibirMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COR: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  enviada: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  assinada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  cancelada: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

// A proposta vale 30 dias para aceite (a partir da emissão). Passado esse prazo,
// e ainda não assinada, sinaliza que é preciso gerar uma nova.
const VALIDADE_PROPOSTA_DIAS = 30;
function diasDesde(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
function propostaVencida(p: { status?: string; criado_em?: string | null }): boolean {
  if (!p || !["rascunho", "enviada"].includes(p.status || "")) return false;
  const dias = diasDesde(p.criado_em);
  return dias != null && dias > VALIDADE_PROPOSTA_DIAS;
}

interface Signatario {
  nome: string;
  email: string;
}

type EtapaEnvio = "signatarios" | "editor" | null;

export function PropostaTab({
  negocio,
  planos,
  propostasIniciais,
  usuarioAtual,
  onAtualizarContato,
}: {
  negocio: NegocioComRelacoes;
  planos: Plano[];
  propostasIniciais: any[];
  usuarioAtual: Usuario;
  /** Para o CNPJ preenchido aqui refletir no cabecalho sem recarregar. */
  onAtualizarContato: (campos: Partial<NonNullable<NegocioComRelacoes["contato"]>>) => void;
}) {
  const isAdmin = usuarioAtual.role === "admin";
  const [propostas, setPropostas] = useEstadoDaProp(propostasIniciais, semDuplicadas);
  const [planoId, setPlanoId] = useState(planos[0]?.id || "");

  // O pai assina o Realtime de propostas/envelopes/signatários e repassa a
  // lista viva por props — o status de assinatura abaixo atualiza sozinho.
  const plano = planos.find((p) => p.id === planoId);

  const [avisoPrevioDias, setAvisoPrevioDias] = useState(180);
  const [prazoContratoMeses, setPrazoContratoMeses] = useState(12);

  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<{
    propostaId: string;
    linkAssinatura: string;
    emailEnviado: boolean;
    emailErro: string | null;
    remetenteTest: boolean;
  } | null>(null);

  const [editandoEnvioId, setEditandoEnvioId] = useState<string | null>(null);
  const [etapaEnvio, setEtapaEnvio] = useState<EtapaEnvio>(null);
  const [signatarios, setSignatarios] = useState<Signatario[]>([]);
  const [copias, setCopias] = useState<string[]>([]);
  const [pdfComercialUrl, setPdfComercialUrl] = useState<string | null>(null);
  const [camposAssinatura, setCamposAssinatura] = useState<CampoAssinatura[]>([]);
  const [documentoEditor, setDocumentoEditor] = useState<"comercial" | "tecnica">("comercial");

  const setupPlano = (plano?.valor_setup_plataforma || 0) + (plano?.valor_setup_erp || 0) + (plano?.valor_setup_catalogo || 0);

  const temCnpj = !!negocio.contato?.cnpj?.trim();
  const valorMensalBase = (plano?.valor_plataforma_base || 0) + (plano?.valor_uso_base || 0);

  // Solicitação de desconto (vendedor pede abaixo do plano; admin aprova)
  const [solicitacao, setSolicitacao] = useState<any>(null);
  const [motivoDesconto, setMotivoDesconto] = useState("");
  const [enviandoSolic, setEnviandoSolic] = useState(false);
  const [decidindo, setDecidindo] = useState(false);
  const [respostaAdmin, setRespostaAdmin] = useState("");

  // Vendedor vê a decisão do admin (aprovado/recusado) na hora, sem recarregar.
  const carregarSolicitacao = useCallback(async () => {
    const { data } = await createClient()
      .from("solicitacoes_desconto")
      .select("*")
      .eq("negocio_id", negocio.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSolicitacao(data);
  }, [negocio.id]);

  useSincronizacao(carregarSolicitacao, {
    canal: `descontos-negocio-${negocio.id}`,
    tabelas: [{ tabela: "solicitacoes_desconto", filtro: `negocio_id=eq.${negocio.id}` }],
    carregarAoMontar: true,
  });

  const descontoAprovado = solicitacao?.status === "aprovado" ? solicitacao : null;
  // Piso do vendedor: base do plano, rebaixado pelo desconto aprovado (se houver).
  const minMensal = isAdmin
    ? 0
    : descontoAprovado
      ? Math.min(valorMensalBase, Number(descontoAprovado.valor_mensal_solicitado))
      : valorMensalBase;
  const minSetup = isAdmin
    ? 0
    : descontoAprovado
      ? Math.min(500, Number(descontoAprovado.valor_setup_solicitado))
      : 500;

  const [valorSetupTexto, setValorSetupTexto] = useState(exibirMoeda(Math.max(setupPlano, isAdmin ? 0 : 500)));
  const [valorMensalTexto, setValorMensalTexto] = useState(exibirMoeda(valorMensalBase));

  const valorMensal = parseMoeda(valorMensalTexto);
  const valorSetup = parseMoeda(valorSetupTexto);

  // Vendedor abaixo do piso permitido → precisa de aprovação antes de gerar
  const abaixoDoMinimo = !isAdmin && (valorMensal < minMensal - 0.001 || valorSetup < minSetup - 0.001);
  const solicPendente = solicitacao?.status === "pendente";

  const solicitarDesconto = async () => {
    setEnviandoSolic(true);
    setErro(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("solicitar_desconto", {
      p_negocio_id: negocio.id,
      p_plano_id: planoId,
      p_valor_mensal: valorMensal,
      p_valor_setup: valorSetup,
      p_motivo: motivoDesconto.trim() || null,
    } as any);
    setEnviandoSolic(false);
    if (error) {
      setErro("Falha ao solicitar desconto: " + error.message);
      return;
    }
    setSolicitacao(data);
    setMotivoDesconto("");
  };

  const decidirDesconto = async (aprovar: boolean) => {
    if (!solicitacao) return;
    setDecidindo(true);
    setErro(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("decidir_desconto", {
      p_solicitacao_id: solicitacao.id,
      p_aprovar: aprovar,
      p_resposta: respostaAdmin.trim() || null,
    } as any);
    setDecidindo(false);
    if (error) {
      setErro("Falha ao decidir: " + error.message);
      return;
    }
    setSolicitacao(data);
    setRespostaAdmin("");
  };

  const handleGerar = async () => {
    setErro(null);
    setGerando(true);
    const resp = await fetch("/api/propostas/gerar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        negocioId: negocio.id,
        planoId,
        avisoPrevioDias,
        valorPlataforma: valorMensal,
        valorUso: 0,
        qtdCaixasEmail: 0,
        qtdNumerosWhatsapp: 0,
        prazoContratoMeses,
        valorSetup,
      }),
    });
    const data = await resp.json();
    setGerando(false);
    if (!resp.ok) {
      setErro(data.error || "Erro ao gerar proposta.");
      return;
    }
    setPropostas((prev) => semDuplicadas([{ ...data.proposta, plano, envelopes: [] }, ...prev]));
    const supabaseClient = createClient();
    await supabaseClient.from("negocios").update({ valor: valorMensal }).eq("id", negocio.id);
    if (data.urlComercial) window.open(data.urlComercial, "_blank");
  };

  const handleExcluir = async (propostaId: string) => {
    if (!confirm("Excluir esta proposta? Esta ação não pode ser desfeita.")) return;
    const supabase = createClient();
    const proposta = propostas.find((p) => p.id === propostaId);
    const paths = [proposta?.pdf_comercial_path, proposta?.pdf_tecnica_path].filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("documentos").remove(paths);
    }
    const { error } = await supabase.from("propostas").delete().eq("id", propostaId);
    if (error) {
      setErro("Falha ao excluir proposta: " + error.message);
      return;
    }
    setPropostas((prev) => prev.filter((p) => p.id !== propostaId));
  };

  const abrirEnvio = (propostaId: string) => {
    setEditandoEnvioId(propostaId);
    setEtapaEnvio("signatarios");
    setSignatarios([{ nome: negocio.contato?.nome || "", email: negocio.contato?.email || "" }]);
    setCopias([]);
    setCamposAssinatura([]);
    setErro(null);
  };

  const avancarParaEditor = async () => {
    const signatariosValidos = signatarios.filter((s) => s.nome.trim() && s.email.trim());
    if (signatariosValidos.length === 0) {
      setErro("Adicione pelo menos um signatário com nome e e-mail.");
      return;
    }
    setErro(null);

    const proposta = propostas.find((p) => p.id === editandoEnvioId);
    if (!proposta?.pdf_comercial_path) {
      setErro("PDF não encontrado.");
      return;
    }

    const supabase = createClient();
    const { data } = await supabase.storage.from("documentos").createSignedUrl(proposta.pdf_comercial_path, 60 * 30);
    if (!data?.signedUrl) {
      setErro("Falha ao carregar PDF.");
      return;
    }
    setPdfComercialUrl(data.signedUrl);
    setDocumentoEditor("comercial");
    setEtapaEnvio("editor");
  };

  const handleEnviarComCampos = async (campos: CampoAssinatura[]) => {
    if (!editandoEnvioId) return;
    const signatariosValidos = signatarios.filter((s) => s.nome.trim() && s.email.trim());

    setEnviandoId(editandoEnvioId);
    setErro(null);
    const resp = await fetch(`/api/propostas/${editandoEnvioId}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signatarios: signatariosValidos,
        copias: copias.filter((c) => c.trim()),
        campos_assinatura: campos,
      }),
    });
    const data = await resp.json();
    setEnviandoId(null);
    if (!resp.ok) {
      setErro(data.error || "Erro ao enviar proposta.");
      return;
    }
    setEditandoEnvioId(null);
    setEtapaEnvio(null);
    setUltimoResultado({
      propostaId: editandoEnvioId,
      linkAssinatura: data.linkAssinatura,
      emailEnviado: data.emailEnviado,
      emailErro: data.emailErro || null,
      remetenteTest: data.remetenteTest || false,
    });
    const supabase = createClient();
    const { data: propostaAtualizada } = await supabase
      .from("propostas")
      .select("*, plano:planos(*), envelopes(*, signatarios(*))")
      .eq("id", editandoEnvioId)
      .single();
    if (propostaAtualizada) {
      setPropostas((prev) => prev.map((p) => (p.id === editandoEnvioId ? propostaAtualizada : p)));
    }
  };

  const baixarPdf = async (path: string) => {
    if (path.startsWith("http")) {
      window.open(path, "_blank");
      return;
    }
    const supabase = createClient();
    const { data } = await supabase.storage.from("documentos").createSignedUrl(path, 60 * 5);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const copiarLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setLinkCopiado(link);
    setTimeout(() => setLinkCopiado(null), 2000);
  };

  return (
    <div className="space-y-5">
      {!temCnpj && <CnpjPendente negocio={negocio} onSalvou={onAtualizarContato} />}

      <div className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4 ${!temCnpj ? "opacity-50 pointer-events-none" : ""}`}>
        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Gerar nova proposta</h3>

        <div>
          <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Plano</label>
          <select value={planoId} onChange={(e) => {
            setPlanoId(e.target.value);
            const p = planos.find((x) => x.id === e.target.value);
            const newSetup = (p?.valor_setup_plataforma || 0) + (p?.valor_setup_erp || 0) + (p?.valor_setup_catalogo || 0);
            setValorSetupTexto(exibirMoeda(Math.max(newSetup, minSetup)));
            const newMensal = (p?.valor_plataforma_base || 0) + (p?.valor_uso_base || 0);
            setValorMensalTexto(exibirMoeda(newMensal));
          }} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold">
            {planos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} — até {p.franquia_pedidos.toLocaleString("pt-BR")} pedidos/mês</option>
            ))}
          </select>
        </div>

        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
          <label className="text-[11px] font-bold uppercase text-indigo-500 dark:text-indigo-400 block mb-1">Mensalidade do plano</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-indigo-500">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={valorMensalTexto}
              onChange={(e) => setValorMensalTexto(e.target.value)}
              onBlur={() => setValorMensalTexto(exibirMoeda(parseMoeda(valorMensalTexto)))}
              className="flex-1 px-3 py-2 text-lg font-extrabold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded-xl"
            />
            <span className="text-sm font-semibold text-slate-500">/mês</span>
          </div>
          {!isAdmin && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {descontoAprovado
                ? `Desconto aprovado: pode cobrar a partir de ${formatarMoeda(minMensal)}.`
                : `Valor mínimo do plano: ${formatarMoeda(valorMensalBase)}.`}{" "}
              Excedente de {formatarMoeda(plano?.valor_excedente_pedido)} por pedido acima da franquia.
            </p>
          )}
          {isAdmin && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Valor base do plano: {formatarMoeda(valorMensalBase)}. Admin pode definir qualquer valor. Excedente de {formatarMoeda(plano?.valor_excedente_pedido)}/pedido.
            </p>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <label className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 block mb-1">Setup (cobrança única)</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={valorSetupTexto}
              onChange={(e) => setValorSetupTexto(e.target.value)}
              onBlur={() => setValorSetupTexto(exibirMoeda(parseMoeda(valorSetupTexto)))}
              className="flex-1 px-3 py-2 text-lg font-extrabold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Valor padrão do plano: {formatarMoeda(setupPlano)}.{" "}
            {isAdmin ? "Admin pode definir qualquer valor, inclusive R$ 0." : "Mínimo para vendedor: R$ 500,00."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Prazo contrato (meses)</label>
            <input type="number" min={1} value={prazoContratoMeses} onChange={(e) => setPrazoContratoMeses(parseInt(e.target.value) || 12)} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Aviso prévio de rescisão</label>
            <select value={avisoPrevioDias} onChange={(e) => setAvisoPrevioDias(parseInt(e.target.value))} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold">
              {AVISOS_PREVIOS_DIAS.map((d) => (
                <option key={d} value={d}>{d} dias {d === 180 ? "(padrão)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Aprovação de desconto */}
        {isAdmin && solicPendente && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-amber-600" />
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Pedido de desconto aguardando sua aprovação</p>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Mensalidade pedida: <strong>{formatarMoeda(Number(solicitacao.valor_mensal_solicitado))}</strong> (base do plano {formatarMoeda(Number(solicitacao.valor_mensal_base))})
              {Number(solicitacao.valor_setup_solicitado) > 0 && <> · Setup: <strong>{formatarMoeda(Number(solicitacao.valor_setup_solicitado))}</strong></>}
            </p>
            {solicitacao.motivo && <p className="text-[11px] text-amber-700 dark:text-amber-400">Motivo: {solicitacao.motivo}</p>}
            <input
              value={respostaAdmin}
              onChange={(e) => setRespostaAdmin(e.target.value)}
              placeholder="Resposta ao vendedor (opcional)"
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => decidirDesconto(true)}
                disabled={decidindo}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-60"
              >
                {decidindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />} Aprovar
              </button>
              <button
                onClick={() => decidirDesconto(false)}
                disabled={decidindo}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-60"
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Recusar
              </button>
            </div>
          </div>
        )}

        {!isAdmin && solicPendente && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl p-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Desconto de <strong>{formatarMoeda(Number(solicitacao.valor_mensal_solicitado))}</strong> aguardando aprovação do admin. Você será notificado da decisão.
            </p>
          </div>
        )}

        {!isAdmin && solicitacao?.status === "recusado" && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 rounded-xl p-3">
            <p className="text-[11px] text-rose-700 dark:text-rose-400">
              Último pedido de desconto foi recusado{solicitacao.resposta_admin ? ` — ${solicitacao.resposta_admin}` : ""}. Ajuste o valor ou solicite novamente.
            </p>
          </div>
        )}

        {!isAdmin && descontoAprovado && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-xl p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
              Desconto aprovado: mensalidade a partir de <strong>{formatarMoeda(minMensal)}</strong>
              {Number(descontoAprovado.valor_setup_solicitado) < 500 && <> e setup a partir de <strong>{formatarMoeda(minSetup)}</strong></>}.
            </p>
          </div>
        )}

        {abaixoDoMinimo && !solicPendente && (
          <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-indigo-600" />
              <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300">Valor abaixo do mínimo do plano</p>
            </div>
            <p className="text-[11px] text-indigo-700 dark:text-indigo-400">
              Para cobrar {formatarMoeda(valorMensal)}/mês{valorSetup < 500 ? ` e setup de ${formatarMoeda(valorSetup)}` : ""} você precisa de aprovação do admin.
            </p>
            <textarea
              value={motivoDesconto}
              onChange={(e) => setMotivoDesconto(e.target.value)}
              placeholder="Justifique o desconto para o admin (ex.: concorrência, volume, relacionamento)"
              rows={2}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg"
            />
            <button
              onClick={solicitarDesconto}
              disabled={enviandoSolic}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-60"
            >
              {enviandoSolic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgePercent className="h-3.5 w-3.5" />}
              Solicitar aprovação de desconto
            </button>
          </div>
        )}

        {erro && !editandoEnvioId && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

        <button
          onClick={handleGerar}
          disabled={gerando || !temCnpj || abaixoDoMinimo}
          title={abaixoDoMinimo ? "Valor abaixo do mínimo — solicite aprovação de desconto." : undefined}
          className="w-full py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Gerar proposta (Comercial + Técnica)
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Propostas geradas ({propostas.length})</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Cada proposta gera dois arquivos do mesmo documento: a Comercial e a Técnica.
          </p>
        </div>
        {propostas.length === 0 ? (
          <p className="p-5 text-xs text-slate-400">Nenhuma proposta gerada ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {propostas.map((p) => {
              const envelope = p.envelopes?.[0];
              return (
                <div key={p.id} className="p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        Proposta {p.numero} v{p.versao} — {p.plano?.nome}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatarMoeda((p.valor_plataforma || 0) + (p.valor_uso || 0))}/mês
                        {(p.valor_setup_plataforma || 0) + (p.valor_setup_erp || 0) + (p.valor_setup_catalogo || 0) > 0 && ` + ${formatarMoeda((p.valor_setup_plataforma || 0) + (p.valor_setup_erp || 0) + (p.valor_setup_catalogo || 0))} setup`}
                        {" "}· aviso prévio {p.aviso_previo_dias} dias
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {propostaVencida(p) && (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-1" title={`Emitida há ${diasDesde(p.criado_em)} dias — validade de ${VALIDADE_PROPOSTA_DIAS} dias expirada.`}>
                          <AlertTriangle className="h-3 w-3" /> Vencida · gere nova
                        </span>
                      )}
                      <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full capitalize ${STATUS_COR[p.status]}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Arquivos:</span>
                    {p.pdf_comercial_path && (
                      <button onClick={() => baixarPdf(p.pdf_comercial_path)} className="text-[11px] flex items-center gap-1 text-slate-500 hover:text-indigo-600 font-semibold">
                        <Eye className="h-3 w-3" /> Comercial
                      </button>
                    )}
                    {p.pdf_tecnica_path && (
                      <button onClick={() => baixarPdf(p.pdf_tecnica_path)} className="text-[11px] flex items-center gap-1 text-slate-500 hover:text-indigo-600 font-semibold">
                        <Eye className="h-3 w-3" /> Técnica
                      </button>
                    )}
                    {p.pdf_assinado_comercial_path && (
                      <button onClick={() => baixarPdf(p.pdf_assinado_comercial_path)} className="text-[11px] flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-bold">
                        <Download className="h-3 w-3" /> Assinado (comercial)
                      </button>
                    )}
                    {p.pdf_assinado_tecnica_path && (
                      <button onClick={() => baixarPdf(p.pdf_assinado_tecnica_path)} className="text-[11px] flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-bold">
                        <Download className="h-3 w-3" /> Assinado (técnica)
                      </button>
                    )}
                    {p.status === "rascunho" && editandoEnvioId !== p.id && (
                      <>
                        <button
                          onClick={() => abrirEnvio(p.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                        >
                          <Send className="h-3.5 w-3.5" /> Enviar para assinatura
                        </button>
                        <button
                          onClick={() => handleExcluir(p.id)}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {editandoEnvioId === p.id && etapaEnvio === "signatarios" && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Quem vai assinar?</p>
                      </div>
                      {signatarios.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={s.nome}
                            onChange={(e) => setSignatarios((prev) => prev.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                            placeholder="Nome completo"
                            className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                          <input
                            value={s.email}
                            onChange={(e) => setSignatarios((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                            placeholder="email@empresa.com"
                            className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                          {signatarios.length > 1 && (
                            <button onClick={() => setSignatarios((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600">
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setSignatarios((prev) => [...prev, { nome: "", email: "" }])}
                        className="text-[11px] font-bold text-indigo-600 flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Adicionar signatário
                      </button>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">Enviar cópia para (opcional)</p>
                        {copias.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 mb-2">
                            <input
                              value={c}
                              onChange={(e) => setCopias((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                              placeholder="email@empresa.com"
                              className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                            />
                            <button onClick={() => setCopias((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setCopias((prev) => [...prev, ""])}
                          className="text-[11px] font-bold text-indigo-600 flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" /> Adicionar cópia
                        </button>
                      </div>

                      {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={avancarParaEditor}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                        >
                          <FileSignature className="h-3.5 w-3.5" /> Preparar documento
                        </button>
                        <button onClick={() => { setEditandoEnvioId(null); setEtapaEnvio(null); }} className="px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {editandoEnvioId === p.id && etapaEnvio === "editor" && pdfComercialUrl && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Posicione os campos de assinatura no documento</p>
                        <button
                          onClick={() => setEtapaEnvio("signatarios")}
                          className="ml-auto text-[11px] text-slate-500 hover:text-indigo-600 font-semibold"
                        >
                          Voltar
                        </button>
                      </div>

                      {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

                      <PdfFieldEditor
                        pdfUrl={pdfComercialUrl}
                        documento={documentoEditor}
                        signatarios={signatarios
                          .filter((s) => s.nome.trim() && s.email.trim())
                          .map((s, i) => ({ nome: s.nome, email: s.email, ordem: i + 2 }))}
                        camposIniciais={camposAssinatura}
                        onSalvar={(campos) => {
                          setCamposAssinatura(campos);
                          handleEnviarComCampos(campos);
                        }}
                        onCancelar={() => setEtapaEnvio("signatarios")}
                        enviando={!!enviandoId}
                      />
                    </div>
                  )}

                  {envelope && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        Status da assinatura (tempo real)
                      </p>
                      {[...(envelope.signatarios || [])]
                        .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
                        .map((s: any) => (
                          <div key={s.id} className="flex items-center justify-between text-xs gap-2 flex-wrap">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{s.nome} <span className="text-slate-400">({s.papel})</span></span>
                            {s.status === "assinado" ? (
                              <span className="flex items-center gap-1 font-bold text-emerald-600">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Assinado em {new Date(s.assinado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            ) : s.status === "visualizado" ? (
                              <span className="flex items-center gap-1 font-bold text-sky-600">
                                <Eye className="h-3.5 w-3.5" />
                                Visualizou{s.visualizado_em ? ` em ${new Date(s.visualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""} · aguardando assinatura
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 font-bold text-amber-600">
                                <Clock className="h-3.5 w-3.5" />
                                Enviado · ainda não visualizou
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}

                  {ultimoResultado && ultimoResultado.propostaId === p.id && (
                    <div className={`rounded-xl p-3 text-xs ${ultimoResultado.emailEnviado ? "bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800" : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"}`}>
                      <p className={`font-bold ${ultimoResultado.emailEnviado ? "text-indigo-800 dark:text-indigo-300" : "text-amber-800 dark:text-amber-300"}`}>
                        {ultimoResultado.emailEnviado
                          ? ultimoResultado.remetenteTest
                            ? "E-mail enviado (remetente de teste — só chega no e-mail da conta Resend)."
                            : "E-mail de assinatura enviado aos envolvidos."
                          : ultimoResultado.emailErro
                            ? `Falha ao enviar e-mail: ${ultimoResultado.emailErro}`
                            : "RESEND_API_KEY não configurada — copie e envie o link manualmente:"}
                      </p>
                      {!ultimoResultado.emailEnviado && (
                        <p className="text-amber-700 dark:text-amber-400 mt-1">
                          Configure RESEND_API_KEY e RESEND_FROM_EMAIL (domínio verificado) no Vercel.
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <code className="flex-1 truncate bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                          {ultimoResultado.linkAssinatura}
                        </code>
                        <button onClick={() => copiarLink(ultimoResultado!.linkAssinatura)} className="text-indigo-600 hover:text-indigo-800">
                          {linkCopiado === ultimoResultado.linkAssinatura ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * O CNPJ faltando desabilitava a aba inteira e mandava a pessoa "preencher na
 * aba Visão Geral" — sem link, e a aba nem se chama mais assim. Agora o campo
 * que destrava a proposta fica aqui, no lugar onde a falta aparece.
 */
function CnpjPendente({
  negocio,
  onSalvou,
}: {
  negocio: NegocioComRelacoes;
  onSalvou: (campos: Partial<NonNullable<NegocioComRelacoes["contato"]>>) => void;
}) {
  const [cnpj, setCnpj] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    const valor = cnpj.trim();
    if (!valor || !negocio.contato) return;
    setSalvando(true);
    setErro(null);
    const { error } = await createClient()
      .from("contatos")
      .update({ cnpj: valor, atualizado_em: new Date().toISOString() })
      .eq("id", negocio.contato.id);
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    onSalvou({ cnpj: valor });
  };

  return (
    <Alerta tom="aviso" className="flex flex-col gap-3">
      <span>Sem CNPJ a proposta não pode ser gerada. Dá para preencher aqui mesmo.</span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Input
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            aria-label="CNPJ do contato"
            placeholder="00.000.000/0000-00"
            onKeyDown={(e) => e.key === "Enter" && void salvar()}
          />
        </div>
        <Button variante="primario" carregando={salvando} disabled={!cnpj.trim()} onClick={salvar}>
          Salvar CNPJ
        </Button>
      </div>
      {erro && <span className="font-normal">{erro}</span>}
    </Alerta>
  );
}
