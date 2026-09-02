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
import { Alerta, Badge, Button, Input, TOM_PROPOSTA } from "@/components/ui";

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

// O mapa de cor proprio saiu: a escala vive uma vez so, em TOM_PROPOSTA.

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

      <div className={`rounded-xl bg-cartao shadow-cartao p-5 space-y-4 ${!temCnpj ? "opacity-50 pointer-events-none" : ""}`}>
        <h3 className="text-titulo text-tinta">Gerar nova proposta</h3>

        <div>
          <label htmlFor="prop-plano" className="text-rotulo uppercase text-tinta-fraca mb-1 block">Plano</label>
          <select id="prop-plano" value={planoId} onChange={(e) => {
            setPlanoId(e.target.value);
            const p = planos.find((x) => x.id === e.target.value);
            const newSetup = (p?.valor_setup_plataforma || 0) + (p?.valor_setup_erp || 0) + (p?.valor_setup_catalogo || 0);
            setValorSetupTexto(exibirMoeda(Math.max(newSetup, minSetup)));
            const newMensal = (p?.valor_plataforma_base || 0) + (p?.valor_uso_base || 0);
            setValorMensalTexto(exibirMoeda(newMensal));
          }} className="w-full rounded-lg border border-fio bg-cartao px-3 py-2 text-corpo-lg text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
            {planos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} — até {p.franquia_pedidos.toLocaleString("pt-BR")} pedidos/mês</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-recuo p-4">
          <label htmlFor="prop-mensal" className="text-rotulo uppercase text-tinta-fraca mb-1 block">Mensalidade do plano</label>
          <div className="flex items-center gap-2">
            <span className="text-corpo-lg text-tinta-suave">R$</span>
            <input
              id="prop-mensal"
              type="text"
              inputMode="decimal"
              value={valorMensalTexto}
              onChange={(e) => setValorMensalTexto(e.target.value)}
              onBlur={() => setValorMensalTexto(exibirMoeda(parseMoeda(valorMensalTexto)))}
              className="w-full rounded-lg border border-fio bg-cartao px-3 py-2 font-serif text-xl tabular-nums text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
            <span className="text-corpo-lg text-tinta-suave">/mês</span>
          </div>
          {!isAdmin && (
            <p className="text-corpo text-tinta-suave mt-1">
              {descontoAprovado
                ? `Desconto aprovado: pode cobrar a partir de ${formatarMoeda(minMensal)}.`
                : `Valor mínimo do plano: ${formatarMoeda(valorMensalBase)}.`}{" "}
              Excedente de {formatarMoeda(plano?.valor_excedente_pedido)} por pedido acima da franquia.
            </p>
          )}
          {isAdmin && (
            <p className="text-corpo text-tinta-suave mt-1">
              Valor base do plano: {formatarMoeda(valorMensalBase)}. Admin pode definir qualquer valor. Excedente de {formatarMoeda(plano?.valor_excedente_pedido)}/pedido.
            </p>
          )}
        </div>

        <div className="rounded-xl bg-recuo p-4">
          <label htmlFor="prop-setup" className="text-rotulo uppercase text-tinta-fraca mb-1 block">Setup (cobrança única)</label>
          <div className="flex items-center gap-2">
            <span className="text-corpo-lg text-tinta-suave">R$</span>
            <input
              id="prop-setup"
              type="text"
              inputMode="decimal"
              value={valorSetupTexto}
              onChange={(e) => setValorSetupTexto(e.target.value)}
              onBlur={() => setValorSetupTexto(exibirMoeda(parseMoeda(valorSetupTexto)))}
              className="min-w-0 flex-1 rounded-lg border border-fio bg-cartao px-3 py-2 font-serif text-xl tabular-nums text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
          </div>
          <p className="text-corpo text-tinta-suave mt-1">
            Valor padrão do plano: {formatarMoeda(setupPlano)}.{" "}
            {isAdmin ? "Admin pode definir qualquer valor, inclusive R$ 0." : "Mínimo para vendedor: R$ 500,00."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="prop-prazo" className="text-rotulo uppercase text-tinta-fraca mb-1 block">Prazo contrato (meses)</label>
            <input id="prop-prazo" type="number" min={1} value={prazoContratoMeses} onChange={(e) => setPrazoContratoMeses(parseInt(e.target.value) || 12)} className="w-full rounded-lg border border-fio bg-cartao px-3 py-2 text-corpo-lg text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" />
          </div>
          <div>
            <label htmlFor="prop-aviso" className="text-rotulo uppercase text-tinta-fraca mb-1 block">Aviso prévio de rescisão</label>
            <select id="prop-aviso" value={avisoPrevioDias} onChange={(e) => setAvisoPrevioDias(parseInt(e.target.value))} className="w-full rounded-lg border border-fio bg-cartao px-3 py-2 text-corpo-lg text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
              {AVISOS_PREVIOS_DIAS.map((d) => (
                <option key={d} value={d}>{d} dias {d === 180 ? "(padrão)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Aprovação de desconto */}
        {isAdmin && solicPendente && (
          <div className="rounded-xl bg-amber-50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-amber-600" />
              <p className="text-corpo-lg font-medium text-amber-800">Pedido de desconto aguardando sua aprovação</p>
            </div>
            <p className="text-corpo text-amber-800">
              Mensalidade pedida: <strong>{formatarMoeda(Number(solicitacao.valor_mensal_solicitado))}</strong> (base do plano {formatarMoeda(Number(solicitacao.valor_mensal_base))})
              {Number(solicitacao.valor_setup_solicitado) > 0 && <> · Setup: <strong>{formatarMoeda(Number(solicitacao.valor_setup_solicitado))}</strong></>}
            </p>
            {solicitacao.motivo && <p className="text-corpo text-amber-800">Motivo: {solicitacao.motivo}</p>}
            <input
              value={respostaAdmin}
              onChange={(e) => setRespostaAdmin(e.target.value)}
              placeholder="Resposta ao vendedor (opcional)"
              className="w-full rounded-lg border border-fio bg-cartao px-3 py-2 text-corpo-lg text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => decidirDesconto(true)}
                disabled={decidindo}
                className="text-corpo-lg inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 font-medium text-white transition-[background-color] duration-150 ease-out hover:bg-emerald-800 disabled:opacity-60"
              >
                {decidindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />} Aprovar
              </button>
              <button
                onClick={() => decidirDesconto(false)}
                disabled={decidindo}
                className="text-corpo-lg inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 font-medium text-white transition-[background-color] duration-150 ease-out hover:bg-rose-800 disabled:opacity-60"
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Recusar
              </button>
            </div>
          </div>
        )}

        {!isAdmin && solicPendente && (
          <div className="rounded-xl bg-amber-50 p-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-corpo text-amber-800">
              Desconto de <strong>{formatarMoeda(Number(solicitacao.valor_mensal_solicitado))}</strong> aguardando aprovação do admin. Você será notificado da decisão.
            </p>
          </div>
        )}

        {!isAdmin && solicitacao?.status === "recusado" && (
          <div className="rounded-xl bg-rose-50 p-3">
            <p className="text-corpo text-rose-800">
              Último pedido de desconto foi recusado{solicitacao.resposta_admin ? ` — ${solicitacao.resposta_admin}` : ""}. Ajuste o valor ou solicite novamente.
            </p>
          </div>
        )}

        {!isAdmin && descontoAprovado && (
          <div className="rounded-xl bg-emerald-50 p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-corpo text-emerald-800">
              Desconto aprovado: mensalidade a partir de <strong>{formatarMoeda(minMensal)}</strong>
              {Number(descontoAprovado.valor_setup_solicitado) < 500 && <> e setup a partir de <strong>{formatarMoeda(minSetup)}</strong></>}.
            </p>
          </div>
        )}

        {abaixoDoMinimo && !solicPendente && (
          <div className="rounded-xl bg-indigo-50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-indigo-600" />
              <p className="text-corpo-lg font-medium text-indigo-800">Valor abaixo do mínimo do plano</p>
            </div>
            <p className="text-corpo text-indigo-800">
              Para cobrar {formatarMoeda(valorMensal)}/mês{valorSetup < 500 ? ` e setup de ${formatarMoeda(valorSetup)}` : ""} você precisa de aprovação do admin.
            </p>
            <textarea
              value={motivoDesconto}
              onChange={(e) => setMotivoDesconto(e.target.value)}
              placeholder="Justifique o desconto para o admin (ex.: concorrência, volume, relacionamento)"
              rows={2}
              className="w-full rounded-lg border border-fio bg-cartao px-3 py-2 text-corpo-lg text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
            <button
              onClick={solicitarDesconto}
              disabled={enviandoSolic}
              className="text-corpo-lg inline-flex items-center gap-1.5 rounded-lg bg-tinta px-4 py-2 font-medium text-superficie transition-[filter] duration-150 ease-out hover:brightness-125 disabled:opacity-60"
            >
              {enviandoSolic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgePercent className="h-3.5 w-3.5" />}
              Solicitar aprovação de desconto
            </button>
          </div>
        )}

        {erro && !editandoEnvioId && <p className="rounded-lg bg-rose-50 px-3 py-2 text-corpo-lg font-medium text-rose-700">{erro}</p>}

        <button
          onClick={handleGerar}
          disabled={gerando || !temCnpj || abaixoDoMinimo}
          title={abaixoDoMinimo ? "Valor abaixo do mínimo — solicite aprovação de desconto." : undefined}
          className="text-corpo-lg flex w-full items-center justify-center gap-2 rounded-lg bg-tinta py-2.5 font-medium text-superficie transition-[filter] duration-150 ease-out hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Gerar proposta (Comercial + Técnica)
        </button>
      </div>

      <div className="rounded-xl bg-cartao shadow-cartao overflow-hidden">
        <div className="p-5 border-b border-fio">
          <h3 className="text-titulo text-tinta">Propostas geradas ({propostas.length})</h3>
          <p className="text-corpo text-tinta-suave mt-0.5">
            Cada proposta gera dois arquivos do mesmo documento: a Comercial e a Técnica.
          </p>
        </div>
        {propostas.length === 0 ? (
          <p className="p-5 text-corpo text-tinta-fraca">Nenhuma proposta gerada ainda.</p>
        ) : (
          <div className="divide-y divide-fio">
            {propostas.map((p) => {
              const envelope = p.envelopes?.[0];
              return (
                <div key={p.id} className="p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-titulo text-tinta">
                        Proposta {p.numero} v{p.versao} — {p.plano?.nome}
                      </p>
                      <p className="text-corpo text-tinta-suave">
                        {formatarMoeda((p.valor_plataforma || 0) + (p.valor_uso || 0))}/mês
                        {(p.valor_setup_plataforma || 0) + (p.valor_setup_erp || 0) + (p.valor_setup_catalogo || 0) > 0 && ` + ${formatarMoeda((p.valor_setup_plataforma || 0) + (p.valor_setup_erp || 0) + (p.valor_setup_catalogo || 0))} setup`}
                        {" "}· aviso prévio {p.aviso_previo_dias} dias
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {propostaVencida(p) && (
                        <Badge
                          tom="perigo"
                          title={`Emitida há ${diasDesde(p.criado_em)} dias — validade de ${VALIDADE_PROPOSTA_DIAS} dias expirada.`}
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden /> Vencida · gere nova
                        </Badge>
                      )}
                      <Badge tom={TOM_PROPOSTA[p.status] ?? "neutro"} className="capitalize">
                        {p.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-rotulo uppercase text-tinta-fraca">Arquivos:</span>
                    {p.pdf_comercial_path && (
                      <button onClick={() => baixarPdf(p.pdf_comercial_path)} className="text-corpo flex items-center gap-1 font-medium text-tinta-suave transition-colors duration-150 ease-out hover:text-acento">
                        <Eye className="h-3 w-3" /> Comercial
                      </button>
                    )}
                    {p.pdf_tecnica_path && (
                      <button onClick={() => baixarPdf(p.pdf_tecnica_path)} className="text-corpo flex items-center gap-1 font-medium text-tinta-suave transition-colors duration-150 ease-out hover:text-acento">
                        <Eye className="h-3 w-3" /> Técnica
                      </button>
                    )}
                    {p.pdf_assinado_comercial_path && (
                      <button onClick={() => baixarPdf(p.pdf_assinado_comercial_path)} className="text-corpo flex items-center gap-1 font-medium text-emerald-700 transition-colors duration-150 ease-out hover:text-emerald-900">
                        <Download className="h-3 w-3" /> Assinado (comercial)
                      </button>
                    )}
                    {p.pdf_assinado_tecnica_path && (
                      <button onClick={() => baixarPdf(p.pdf_assinado_tecnica_path)} className="text-corpo flex items-center gap-1 font-medium text-emerald-700 transition-colors duration-150 ease-out hover:text-emerald-900">
                        <Download className="h-3 w-3" /> Assinado (técnica)
                      </button>
                    )}
                    {p.status === "rascunho" && editandoEnvioId !== p.id && (
                      <>
                        <button
                          onClick={() => abrirEnvio(p.id)}
                          className="text-corpo-lg inline-flex items-center gap-1.5 rounded-lg bg-tinta px-3 py-1.5 font-medium text-superficie transition-[filter] duration-150 ease-out hover:brightness-125"
                        >
                          <Send className="h-3.5 w-3.5" /> Enviar para assinatura
                        </button>
                        <button
                          onClick={() => handleExcluir(p.id)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-tinta-fraca transition-colors duration-150 ease-out hover:bg-recuo hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {editandoEnvioId === p.id && etapaEnvio === "signatarios" && (
                    <div className="rounded-xl bg-recuo p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-tinta text-[10px] font-semibold text-superficie">1</span>
                        <p className="text-corpo-lg font-medium text-tinta">Quem vai assinar?</p>
                      </div>
                      {signatarios.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={s.nome}
                            onChange={(e) => setSignatarios((prev) => prev.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                            placeholder="Nome completo"
                            className="min-w-0 flex-1 rounded-lg border border-fio bg-cartao px-3 py-2 text-corpo-lg text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                          />
                          <input
                            value={s.email}
                            onChange={(e) => setSignatarios((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                            placeholder="email@empresa.com"
                            className="min-w-0 flex-1 rounded-lg border border-fio bg-cartao px-3 py-2 text-corpo-lg text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                          />
                          {signatarios.length > 1 && (
                            <button onClick={() => setSignatarios((prev) => prev.filter((_, j) => j !== i))} className="rounded-md p-1 text-tinta-fraca transition-colors duration-150 ease-out hover:text-rose-700">
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setSignatarios((prev) => [...prev, { nome: "", email: "" }])}
                        className="text-corpo flex items-center gap-1 font-medium text-acento transition-colors duration-150 ease-out hover:text-indigo-900"
                      >
                        <Plus className="h-3 w-3" /> Adicionar signatário
                      </button>

                      <div className="border-t border-fio pt-2">
                        <p className="text-corpo-lg font-medium text-tinta mb-2">Enviar cópia para (opcional)</p>
                        {copias.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 mb-2">
                            <input
                              value={c}
                              onChange={(e) => setCopias((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                              placeholder="email@empresa.com"
                              className="min-w-0 flex-1 rounded-lg border border-fio bg-cartao px-3 py-2 text-corpo-lg text-tinta placeholder:text-tinta-fraca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                            />
                            <button onClick={() => setCopias((prev) => prev.filter((_, j) => j !== i))} className="rounded-md p-1 text-tinta-fraca transition-colors duration-150 ease-out hover:text-rose-700">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setCopias((prev) => [...prev, ""])}
                          className="text-corpo flex items-center gap-1 font-medium text-acento transition-colors duration-150 ease-out hover:text-indigo-900"
                        >
                          <Plus className="h-3 w-3" /> Adicionar cópia
                        </button>
                      </div>

                      {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-corpo-lg font-medium text-rose-700">{erro}</p>}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={avancarParaEditor}
                          className="text-corpo-lg inline-flex items-center gap-1.5 rounded-lg bg-tinta px-4 py-2 font-medium text-superficie transition-[filter] duration-150 ease-out hover:brightness-125"
                        >
                          <FileSignature className="h-3.5 w-3.5" /> Preparar documento
                        </button>
                        <button onClick={() => { setEditandoEnvioId(null); setEtapaEnvio(null); }} className="rounded-lg px-3 py-2 text-corpo-lg font-medium text-tinta-suave transition-colors duration-150 ease-out hover:bg-recuo hover:text-tinta">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {editandoEnvioId === p.id && etapaEnvio === "editor" && pdfComercialUrl && (
                    <div className="rounded-xl bg-recuo p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-tinta text-[10px] font-semibold text-superficie">2</span>
                        <p className="text-corpo-lg font-medium text-tinta">Posicione os campos de assinatura no documento</p>
                        <button
                          onClick={() => setEtapaEnvio("signatarios")}
                          className="text-corpo ml-auto font-medium text-tinta-suave transition-colors duration-150 ease-out hover:text-acento"
                        >
                          Voltar
                        </button>
                      </div>

                      {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-corpo-lg font-medium text-rose-700">{erro}</p>}

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
                    <div className="rounded-xl bg-recuo p-3 space-y-1.5">
                      <p className="text-rotulo flex items-center gap-1.5 uppercase text-tinta-fraca">
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
                            <span className="font-medium text-tinta">{s.nome} <span className="text-tinta-fraca">({s.papel})</span></span>
                            {s.status === "assinado" ? (
                              <span className="flex items-center gap-1 font-medium text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Assinado em {new Date(s.assinado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            ) : s.status === "visualizado" ? (
                              <span className="flex items-center gap-1 font-medium text-sky-700">
                                <Eye className="h-3.5 w-3.5" />
                                Visualizou{s.visualizado_em ? ` em ${new Date(s.visualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""} · aguardando assinatura
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 font-medium text-amber-700">
                                <Clock className="h-3.5 w-3.5" />
                                Enviado · ainda não visualizou
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}

                  {ultimoResultado && ultimoResultado.propostaId === p.id && (
                    <div className={`rounded-xl p-3 text-xs ${ultimoResultado.emailEnviado ? "bg-indigo-50" : "bg-amber-50"}`}>
                      <p className={`font-medium ${ultimoResultado.emailEnviado ? "text-indigo-800" : "text-amber-800"}`}>
                        {ultimoResultado.emailEnviado
                          ? ultimoResultado.remetenteTest
                            ? "E-mail enviado (remetente de teste — só chega no e-mail da conta Resend)."
                            : "E-mail de assinatura enviado aos envolvidos."
                          : ultimoResultado.emailErro
                            ? `Falha ao enviar e-mail: ${ultimoResultado.emailErro}`
                            : "RESEND_API_KEY não configurada — copie e envie o link manualmente:"}
                      </p>
                      {!ultimoResultado.emailEnviado && (
                        <p className="text-amber-800 mt-1">
                          Configure RESEND_API_KEY e RESEND_FROM_EMAIL (domínio verificado) no Vercel.
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <code className="flex-1 truncate rounded-lg border border-fio bg-cartao px-2 py-1">
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
