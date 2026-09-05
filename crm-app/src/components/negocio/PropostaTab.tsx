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
import type { NegocioComRelacoes, Plano, PropostaComRelacoes, SolicitacaoDesconto, Usuario } from "@/lib/types";
import { AVISOS_PREVIOS_DIAS, formatarMoeda } from "@/lib/types";
import { PdfFieldEditor, type CampoAssinatura } from "@/components/PdfFieldEditor";
import { abrirPdf } from "@/lib/storage";
import { Confirmar } from "@/components/ui";

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
  rascunho: "bg-recuo text-tinta-suave",
  enviada: "bg-alerta-fraco text-alerta",
  assinada: "bg-ok-fraco text-ok",
  cancelada: "bg-risco-fraco text-risco",
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

/**
 * Um signatario NO FORMULARIO. A `chave` e so da tela: ela e o `key` do React e
 * o identificador das edicoes, e e removida antes de a lista virar payload.
 *
 * Existe porque as duas listas usavam `key={i}` com botao de remover. Com o
 * indice como chave, o React casa as linhas por posicao: ao apagar a linha do
 * meio, ele reaproveita o DOM da linha seguinte em vez de descartar a certa.
 * Com input controlado o TEXTO exibido continua certo — o que se perde e o
 * foco, a posicao do cursor e a selecao, que ficam na linha errada. Num
 * formulario que dispara contrato para cliente, "quase certo" nao serve.
 */
interface Signatario {
  chave: string;
  nome: string;
  email: string;
}

/** Idem para a copia, que era um `string` cru e por isso nem chave tinha. */
interface Copia {
  chave: string;
  valor: string;
}

/** `crypto.randomUUID` e o que o resto do projeto ja usa; roda so em handler. */
const novoSignatario = (nome = "", email = ""): Signatario => ({
  chave: crypto.randomUUID(),
  nome,
  email,
});

const novaCopia = (valor = ""): Copia => ({ chave: crypto.randomUUID(), valor });

type EtapaEnvio = "signatarios" | "editor" | null;

export function PropostaTab({
  negocio,
  planos,
  propostasIniciais,
  usuarioAtual,
}: {
  negocio: NegocioComRelacoes;
  planos: Plano[];
  propostasIniciais: PropostaComRelacoes[];
  usuarioAtual: Usuario;
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
  } | null>(null);

  const [editandoEnvioId, setEditandoEnvioId] = useState<string | null>(null);
  const [etapaEnvio, setEtapaEnvio] = useState<EtapaEnvio>(null);
  const [signatarios, setSignatarios] = useState<Signatario[]>([]);
  const [copias, setCopias] = useState<Copia[]>([]);
  const [pdfComercialUrl, setPdfComercialUrl] = useState<string | null>(null);
  const [camposAssinatura, setCamposAssinatura] = useState<CampoAssinatura[]>([]);
  const [documentoEditor, setDocumentoEditor] = useState<"comercial" | "tecnica">("comercial");

  const setupPlano = (plano?.valor_setup_plataforma || 0) + (plano?.valor_setup_erp || 0) + (plano?.valor_setup_catalogo || 0);

  const temCnpj = !!negocio.contato?.cnpj?.trim();
  const valorMensalBase = (plano?.valor_plataforma_base || 0) + (plano?.valor_uso_base || 0);

  // Solicitação de desconto (vendedor pede abaixo do plano; admin aprova)
  const [solicitacao, setSolicitacao] = useState<SolicitacaoDesconto | null>(null);
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
      // O gerador de tipos declara todo parametro `text` como `string`, mesmo
      // quando a funcao aceita NULL — e esta aceita: `p_motivo` NAO tem DEFAULT,
      // entao a chave precisa ir, e vai nula quando ninguem escreveu motivo.
      // O cast e so nesta expressao: nos outros quatro parametros a conferencia
      // de nome e tipo continua de pe, que era o que o `as any` no objeto
      // inteiro desligava.
      p_motivo: (motivoDesconto.trim() || null) as unknown as string,
    });
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
      // `undefined` e nao `null`: o `supabase-js` omite a chave e
      // `decidir_desconto(..., p_resposta text DEFAULT NULL)` cai no proprio
      // default — mesmo resultado no banco, sem cast nenhum.
      p_resposta: respostaAdmin.trim() || undefined,
    });
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [excluindoProposta, setExcluindoProposta] = useState<any>(null);

  const handleExcluir = async (): Promise<string | void> => {
    if (!excluindoProposta) return;
    const propostaId = excluindoProposta.id;
    const supabase = createClient();
    const proposta = propostas.find((p) => p.id === propostaId);
    const paths = [proposta?.pdf_comercial_path, proposta?.pdf_tecnica_path].filter((c): c is string => !!c);
    if (paths.length > 0) {
      await supabase.storage.from("documentos").remove(paths);
    }
    const { error } = await supabase.from("propostas").delete().eq("id", propostaId);
    if (error) return `Falha ao excluir: ${error.message}`;
    setPropostas((prev) => prev.filter((p) => p.id !== propostaId));
  };

  const abrirEnvio = (propostaId: string) => {
    setEditandoEnvioId(propostaId);
    setEtapaEnvio("signatarios");
    setSignatarios([novoSignatario(negocio.contato?.nome || "", negocio.contato?.email || "")]);
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
        // `chave` e estado de tela e nao pode atravessar a fronteira. A rota
        // hoje le so `nome` e `email`, entao mandar a mais seria inerte — mas
        // depender disso e apostar que ninguem vai escrever um `...s` ali
        // depois. Aqui a forma do que sai fica explicita.
        signatarios: signatariosValidos.map(({ nome, email }) => ({ nome, email })),
        copias: copias.map((c) => c.valor).filter((v) => v.trim()),
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

  // A logica de assinar a URL vive em lib/storage: a tela de Assinaturas
  // precisa da mesma coisa, e la ela estava faltando (os links davam 404).
  // Aceita nulo porque as colunas de caminho SAO anulaveis (proposta sem PDF
  // assinado ainda nao tem os dois ultimos). `abrirPdf` ja devolve `false` sem
  // fazer nada nesse caso — quem estreitava era este embrulho.
  const baixarPdf = (path: string | null | undefined) => void abrirPdf(path);

  const copiarLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setLinkCopiado(link);
    setTimeout(() => setLinkCopiado(null), 2000);
  };

  return (
    <div className="space-y-5">
      {!temCnpj && (
        <div className="p-4 bg-alerta-fraco border border-alerta/40 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-alerta shrink-0 mt-0.5" />
          <div>
            <p className="text-corpo font-medium text-alerta">CNPJ obrigatório</p>
            <p className="text-rotulo text-alerta">
              Este contato ainda não tem CNPJ cadastrado. Preencha o CNPJ na aba &quot;Visão Geral&quot; antes de gerar a proposta.
            </p>
          </div>
        </div>
      )}

      <div className={`bg-superficie rounded-2xl border border-fio shadow-xs p-5 space-y-4 ${!temCnpj ? "opacity-50 pointer-events-none" : ""}`}>
        <h3 className="font-medium text-corpo text-tinta">Gerar nova proposta</h3>

        <div>
          <label htmlFor="propostata-1" className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">Plano</label>
          <select id="propostata-1" value={planoId} onChange={(e) => {
            setPlanoId(e.target.value);
            const p = planos.find((x) => x.id === e.target.value);
            const newSetup = (p?.valor_setup_plataforma || 0) + (p?.valor_setup_erp || 0) + (p?.valor_setup_catalogo || 0);
            setValorSetupTexto(exibirMoeda(Math.max(newSetup, minSetup)));
            const newMensal = (p?.valor_plataforma_base || 0) + (p?.valor_uso_base || 0);
            setValorMensalTexto(exibirMoeda(newMensal));
          }} className="w-full px-3 py-2 text-corpo bg-recuo border border-fio rounded-xl font-medium">
            {planos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} — até {p.franquia_pedidos.toLocaleString("pt-BR")} pedidos/mês</option>
            ))}
          </select>
        </div>

        <div className="bg-acento-fraco border border-fio rounded-xl p-4">
          <label htmlFor="propostata-2" className="text-rotulo font-medium uppercase text-acento block mb-1">Mensalidade do plano</label>
          <div className="flex items-center gap-2">
            <span className="text-corpo text-acento">R$</span>
            <input id="propostata-2"
              type="text"
              inputMode="decimal"
              value={valorMensalTexto}
              onChange={(e) => setValorMensalTexto(e.target.value)}
              onBlur={() => setValorMensalTexto(exibirMoeda(parseMoeda(valorMensalTexto)))}
              className="flex-1 px-3 py-2 text-titulo font-medium text-acento bg-superficie border border-fio rounded-xl"
            />
            <span className="text-corpo font-medium text-tinta-suave">/mês</span>
          </div>
          {!isAdmin && (
            <p className="text-rotulo text-tinta-suave mt-1">
              {descontoAprovado
                ? `Desconto aprovado: pode cobrar a partir de ${formatarMoeda(minMensal)}.`
                : `Valor mínimo do plano: ${formatarMoeda(valorMensalBase)}.`}{" "}
              Excedente de {formatarMoeda(plano?.valor_excedente_pedido)} por pedido acima da franquia.
            </p>
          )}
          {isAdmin && (
            <p className="text-rotulo text-tinta-suave mt-1">
              Valor base do plano: {formatarMoeda(valorMensalBase)}. Admin pode definir qualquer valor. Excedente de {formatarMoeda(plano?.valor_excedente_pedido)}/pedido.
            </p>
          )}
        </div>

        <div className="bg-recuo border border-fio rounded-xl p-4">
          <label htmlFor="propostata-3" className="text-rotulo font-medium uppercase text-tinta-suave block mb-1">Setup (cobrança única)</label>
          <div className="flex items-center gap-2">
            <span className="text-corpo text-tinta-suave">R$</span>
            <input id="propostata-3"
              type="text"
              inputMode="decimal"
              value={valorSetupTexto}
              onChange={(e) => setValorSetupTexto(e.target.value)}
              onBlur={() => setValorSetupTexto(exibirMoeda(parseMoeda(valorSetupTexto)))}
              className="flex-1 px-3 py-2 text-titulo font-medium bg-superficie border border-fio rounded-xl"
            />
          </div>
          <p className="text-rotulo text-tinta-suave mt-1">
            Valor padrão do plano: {formatarMoeda(setupPlano)}.{" "}
            {isAdmin ? "Admin pode definir qualquer valor, inclusive R$ 0." : "Mínimo para vendedor: R$ 500,00."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="propostata-4" className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">Prazo contrato (meses)</label>
            <input id="propostata-4" type="number" min={1} value={prazoContratoMeses} onChange={(e) => setPrazoContratoMeses(parseInt(e.target.value) || 12)} className="w-full px-3 py-2 text-corpo bg-recuo border border-fio rounded-xl" />
          </div>
          <div>
            <label htmlFor="propostata-5" className="text-rotulo font-medium uppercase text-tinta-fraca block mb-1">Aviso prévio de rescisão</label>
            <select id="propostata-5" value={avisoPrevioDias} onChange={(e) => setAvisoPrevioDias(parseInt(e.target.value))} className="w-full px-3 py-2 text-corpo bg-recuo border border-fio rounded-xl font-medium">
              {AVISOS_PREVIOS_DIAS.map((d) => (
                <option key={d} value={d}>{d} dias {d === 180 ? "(padrão)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Aprovação de desconto */}
        {isAdmin && solicPendente && (
          <div className="bg-alerta-fraco border border-alerta/40 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-alerta" />
              <p className="text-rotulo font-medium text-alerta">Pedido de desconto aguardando sua aprovação</p>
            </div>
            <p className="text-rotulo text-alerta">
              Mensalidade pedida: <strong>{formatarMoeda(Number(solicitacao.valor_mensal_solicitado))}</strong> (base do plano {formatarMoeda(Number(solicitacao.valor_mensal_base))})
              {Number(solicitacao.valor_setup_solicitado) > 0 && <> · Setup: <strong>{formatarMoeda(Number(solicitacao.valor_setup_solicitado))}</strong></>}
            </p>
            {solicitacao.motivo && <p className="text-rotulo text-alerta">Motivo: {solicitacao.motivo}</p>}
            <input
              value={respostaAdmin}
              onChange={(e) => setRespostaAdmin(e.target.value)}
              placeholder="Resposta ao vendedor (opcional)"
              className="w-full px-3 py-2 text-rotulo bg-superficie border border-alerta/40 rounded-lg"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => decidirDesconto(true)}
                disabled={decidindo}
                className="foco flex items-center gap-1.5 px-3 py-1.5 text-rotulo font-medium text-ok-tinta bg-ok-solido hover:bg-ok-solido-hover rounded-lg disabled:opacity-60"
              >
                {decidindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />} Aprovar
              </button>
              <button
                onClick={() => decidirDesconto(false)}
                disabled={decidindo}
                className="foco flex items-center gap-1.5 px-3 py-1.5 text-rotulo font-medium text-risco-tinta bg-risco-solido hover:bg-risco-solido-hover rounded-lg disabled:opacity-60"
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Recusar
              </button>
            </div>
          </div>
        )}

        {!isAdmin && solicPendente && (
          <div className="bg-alerta-fraco border border-alerta/40 rounded-xl p-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-alerta shrink-0" />
            <p className="text-rotulo text-alerta">
              Desconto de <strong>{formatarMoeda(Number(solicitacao.valor_mensal_solicitado))}</strong> aguardando aprovação do admin. Você será notificado da decisão.
            </p>
          </div>
        )}

        {!isAdmin && solicitacao?.status === "recusado" && (
          <div className="bg-risco-fraco border border-risco/40 rounded-xl p-3">
            <p className="text-rotulo text-risco">
              Último pedido de desconto foi recusado{solicitacao.resposta_admin ? ` — ${solicitacao.resposta_admin}` : ""}. Ajuste o valor ou solicite novamente.
            </p>
          </div>
        )}

        {!isAdmin && descontoAprovado && (
          <div className="bg-ok-fraco border border-ok/40 rounded-xl p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-ok shrink-0" />
            <p className="text-rotulo text-ok">
              Desconto aprovado: mensalidade a partir de <strong>{formatarMoeda(minMensal)}</strong>
              {Number(descontoAprovado.valor_setup_solicitado) < 500 && <> e setup a partir de <strong>{formatarMoeda(minSetup)}</strong></>}.
            </p>
          </div>
        )}

        {abaixoDoMinimo && !solicPendente && (
          <div className="bg-acento-fraco border border-fio-forte rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-acento" />
              <p className="text-rotulo font-medium text-acento">Valor abaixo do mínimo do plano</p>
            </div>
            <p className="text-rotulo text-acento">
              Para cobrar {formatarMoeda(valorMensal)}/mês{valorSetup < 500 ? ` e setup de ${formatarMoeda(valorSetup)}` : ""} você precisa de aprovação do admin.
            </p>
            <textarea
              value={motivoDesconto}
              onChange={(e) => setMotivoDesconto(e.target.value)}
              placeholder="Justifique o desconto para o admin (ex.: concorrência, volume, relacionamento)"
              rows={2}
              className="w-full px-3 py-2 text-rotulo bg-superficie border border-fio rounded-lg"
            />
            <button
              onClick={solicitarDesconto}
              disabled={enviandoSolic}
              className="foco flex items-center gap-1.5 px-4 py-2 text-rotulo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-lg disabled:opacity-60"
            >
              {enviandoSolic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgePercent className="h-3.5 w-3.5" />}
              Solicitar aprovação de desconto
            </button>
          </div>
        )}

        {erro && !editandoEnvioId && <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">{erro}</p>}

        <button
          onClick={handleGerar}
          disabled={gerando || !temCnpj || abaixoDoMinimo}
          title={abaixoDoMinimo ? "Valor abaixo do mínimo — solicite aprovação de desconto." : undefined}
          className="foco w-full py-2.5 text-corpo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Gerar proposta (Comercial + Técnica)
        </button>
      </div>

      <div className="bg-superficie rounded-2xl border border-fio shadow-xs overflow-hidden">
        <div className="p-5 border-b border-fio">
          <h3 className="font-medium text-corpo text-tinta">Propostas geradas ({propostas.length})</h3>
          <p className="text-rotulo text-tinta-suave mt-0.5">
            Cada proposta gera dois arquivos do mesmo documento: a Comercial e a Técnica.
          </p>
        </div>
        {propostas.length === 0 ? (
          <p className="p-5 text-rotulo text-tinta-fraca">Nenhuma proposta gerada ainda.</p>
        ) : (
          <div className="divide-y divide-fio">
            {propostas.map((p) => {
              const envelope = p.envelopes?.[0];
              return (
                <div key={p.id} className="p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-medium text-corpo text-tinta">
                        Proposta {p.numero} v{p.versao} — {p.plano?.nome}
                      </p>
                      <p className="text-rotulo text-tinta-suave">
                        {formatarMoeda((p.valor_plataforma || 0) + (p.valor_uso || 0))}/mês
                        {(p.valor_setup_plataforma || 0) + (p.valor_setup_erp || 0) + (p.valor_setup_catalogo || 0) > 0 && ` + ${formatarMoeda((p.valor_setup_plataforma || 0) + (p.valor_setup_erp || 0) + (p.valor_setup_catalogo || 0))} setup`}
                        {" "}· aviso prévio {p.aviso_previo_dias} dias
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {propostaVencida(p) && (
                        <span className="px-2.5 py-1 text-rotulo font-medium rounded-full bg-risco-fraco text-risco flex items-center gap-1" title={`Emitida há ${diasDesde(p.criado_em)} dias — validade de ${VALIDADE_PROPOSTA_DIAS} dias expirada.`}>
                          <AlertTriangle className="h-3 w-3" /> Vencida · gere nova
                        </span>
                      )}
                      <span className={`px-2.5 py-1 text-rotulo font-medium rounded-full capitalize ${STATUS_COR[p.status]}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-rotulo font-medium uppercase tracking-wider text-tinta-fraca">Arquivos:</span>
                    {p.pdf_comercial_path && (
                      <button onClick={() => baixarPdf(p.pdf_comercial_path)} className="foco text-rotulo flex items-center gap-1 text-tinta-suave hover:text-acento font-medium">
                        <Eye className="h-3 w-3" /> Comercial
                      </button>
                    )}
                    {p.pdf_tecnica_path && (
                      <button onClick={() => baixarPdf(p.pdf_tecnica_path)} className="foco text-rotulo flex items-center gap-1 text-tinta-suave hover:text-acento font-medium">
                        <Eye className="h-3 w-3" /> Técnica
                      </button>
                    )}
                    {p.pdf_assinado_comercial_path && (
                      <button onClick={() => baixarPdf(p.pdf_assinado_comercial_path)} className="foco text-rotulo flex items-center gap-1 text-ok hover:text-ok font-medium">
                        <Download className="h-3 w-3" /> Assinado (comercial)
                      </button>
                    )}
                    {p.pdf_assinado_tecnica_path && (
                      <button onClick={() => baixarPdf(p.pdf_assinado_tecnica_path)} className="foco text-rotulo flex items-center gap-1 text-ok hover:text-ok font-medium">
                        <Download className="h-3 w-3" /> Assinado (técnica)
                      </button>
                    )}
                    {p.status === "rascunho" && editandoEnvioId !== p.id && (
                      <>
                        <button
                          onClick={() => abrirEnvio(p.id)}
                          className="foco flex items-center gap-1.5 px-3 py-1.5 text-rotulo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-lg"
                        >
                          <Send className="h-3.5 w-3.5" /> Enviar para assinatura
                        </button>
                        <button
                          onClick={() => setExcluindoProposta(p)}
                          className="foco flex items-center gap-1 px-2 py-1.5 text-rotulo font-medium text-tinta-fraca hover:text-risco"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {editandoEnvioId === p.id && etapaEnvio === "signatarios" && (
                    <div className="bg-recuo rounded-xl p-4 space-y-3 border border-fio">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-acento-solido text-acento-tinta text-rotulo font-medium flex items-center justify-center">1</span>
                        <p className="text-rotulo font-medium text-tinta-suave">Quem vai assinar?</p>
                      </div>
                      {/* Editado e removido POR CHAVE, nao por indice: com o
                          indice, remover uma linha faz as de baixo mudarem de
                          numero, e um handler que ainda carregue o indice
                          antigo passa a escrever na linha errada. */}
                      {signatarios.map((s) => (
                        <div key={s.chave} className="flex items-center gap-2">
                          <input
                            value={s.nome}
                            onChange={(e) =>
                              setSignatarios((prev) =>
                                prev.map((x) => (x.chave === s.chave ? { ...x, nome: e.target.value } : x)),
                              )
                            }
                            placeholder="Nome completo"
                            aria-label="Nome do signatário"
                            className="flex-1 px-3 py-2 text-rotulo bg-superficie border border-fio rounded-lg"
                          />
                          <input
                            value={s.email}
                            onChange={(e) =>
                              setSignatarios((prev) =>
                                prev.map((x) => (x.chave === s.chave ? { ...x, email: e.target.value } : x)),
                              )
                            }
                            placeholder="email@empresa.com"
                            aria-label="E-mail do signatário"
                            className="flex-1 px-3 py-2 text-rotulo bg-superficie border border-fio rounded-lg"
                          />
                          {signatarios.length > 1 && (
                            <button
                              onClick={() => setSignatarios((prev) => prev.filter((x) => x.chave !== s.chave))}
                              aria-label={`Remover signatário ${s.nome || "sem nome"}`}
                              className="foco text-tinta-fraca hover:text-risco"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setSignatarios((prev) => [...prev, novoSignatario()])}
                        className="foco text-rotulo font-medium text-acento flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Adicionar signatário
                      </button>

                      <div className="pt-2 border-t border-fio">
                        <p className="text-rotulo font-medium text-tinta-suave mb-2">Enviar cópia para (opcional)</p>
                        {copias.map((c) => (
                          <div key={c.chave} className="flex items-center gap-2 mb-2">
                            <input
                              value={c.valor}
                              onChange={(e) =>
                                setCopias((prev) =>
                                  prev.map((x) => (x.chave === c.chave ? { ...x, valor: e.target.value } : x)),
                                )
                              }
                              placeholder="email@empresa.com"
                              aria-label="E-mail para cópia"
                              className="flex-1 px-3 py-2 text-rotulo bg-superficie border border-fio rounded-lg"
                            />
                            <button
                              onClick={() => setCopias((prev) => prev.filter((x) => x.chave !== c.chave))}
                              aria-label={`Remover cópia ${c.valor || "sem e-mail"}`}
                              className="foco text-tinta-fraca hover:text-risco"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setCopias((prev) => [...prev, novaCopia()])}
                          className="foco text-rotulo font-medium text-acento flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" /> Adicionar cópia
                        </button>
                      </div>

                      {erro && <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">{erro}</p>}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={avancarParaEditor}
                          className="foco flex items-center gap-1.5 px-4 py-2 text-rotulo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-lg"
                        >
                          <FileSignature className="h-3.5 w-3.5" /> Preparar documento
                        </button>
                        <button onClick={() => { setEditandoEnvioId(null); setEtapaEnvio(null); }} className="foco px-3 py-2 text-rotulo font-medium text-tinta-suave hover:bg-recuo rounded-lg">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {editandoEnvioId === p.id && etapaEnvio === "editor" && pdfComercialUrl && (
                    <div className="bg-recuo rounded-xl p-4 border border-fio space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 rounded-full bg-acento-solido text-acento-tinta text-rotulo font-medium flex items-center justify-center">2</span>
                        <p className="text-rotulo font-medium text-tinta-suave">Posicione os campos de assinatura no documento</p>
                        <button
                          onClick={() => setEtapaEnvio("signatarios")}
                          className="foco ml-auto text-rotulo text-tinta-suave hover:text-acento font-medium"
                        >
                          Voltar
                        </button>
                      </div>

                      {erro && <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">{erro}</p>}

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
                    <div className="bg-recuo rounded-xl p-3 space-y-1.5">
                      <p className="text-rotulo font-medium uppercase text-tinta-fraca flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-ok" />
                        </span>
                        Status da assinatura (tempo real)
                      </p>
                      {[...(envelope.signatarios || [])]
                        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
                        .map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-rotulo gap-2 flex-wrap">
                            <span className="font-medium text-tinta-suave">{s.nome} <span className="text-tinta-fraca">({s.papel})</span></span>
                            {s.status === "assinado" ? (
                              <span className="flex items-center gap-1 font-medium text-ok">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Assinado em {s.assinado_em ? new Date(s.assinado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </span>
                            ) : s.status === "visualizado" ? (
                              <span className="flex items-center gap-1 font-medium text-info">
                                <Eye className="h-3.5 w-3.5" />
                                Visualizou{s.visualizado_em ? ` em ${new Date(s.visualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""} · aguardando assinatura
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 font-medium text-alerta">
                                <Clock className="h-3.5 w-3.5" />
                                Enviado · ainda não visualizou
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}

                  {ultimoResultado && ultimoResultado.propostaId === p.id && (
                    <div className={`rounded-xl p-3 text-rotulo ${ultimoResultado.emailEnviado ? "bg-acento-fraco border border-fio" : "bg-alerta-fraco border border-alerta/40"}`}>
                      <p className={`font-medium ${ultimoResultado.emailEnviado ? "text-acento" : "text-alerta"}`}>
                        {ultimoResultado.emailEnviado
                          ? "E-mail de assinatura enviado aos envolvidos, pela caixa comercial."
                          : ultimoResultado.emailErro
                            ? `Falha ao enviar e-mail: ${ultimoResultado.emailErro}`
                            : "E-mail não enviado — copie e envie o link manualmente:"}
                      </p>
                      {/* O envio agora sai da caixa comercial pelo Gmail, não do
                          Resend. Mandar a pessoa configurar RESEND_FROM_EMAIL
                          aqui seria mandá-la mexer no lugar errado. */}
                      {!ultimoResultado.emailEnviado && (
                        <p className="text-alerta mt-1">
                          Conecte a conta comercial em Admin → Integrações e escolha-a como caixa de envio.
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <code className="flex-1 truncate bg-superficie px-2 py-1 rounded-lg border border-fio">
                          {ultimoResultado.linkAssinatura}
                        </code>
                        <button onClick={() => copiarLink(ultimoResultado!.linkAssinatura)} className="foco text-acento hover:text-acento">
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

      <Confirmar
        aberto={!!excluindoProposta}
        titulo="Excluir proposta"
        rotuloConfirmar="Excluir proposta"
        aoFechar={() => setExcluindoProposta(null)}
        aoConfirmar={handleExcluir}
        descricao={
          <>
            A proposta{" "}
            <strong className="font-medium text-tinta">
              {excluindoProposta?.numero}
            </strong>{" "}
            e os PDFs dela no Storage são apagados. Não dá para desfazer.
          </>
        }
      />
    </div>
  );
}
