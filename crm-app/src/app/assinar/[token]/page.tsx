"use client";

import { use, useEffect, useState } from "react";
import { createAnonClient } from "@/lib/supabase/anon";
import { SignaturePad } from "@/components/SignaturePad";
import { PdfSignViewer } from "@/components/PdfSignViewer";
import type { CampoAssinatura } from "@/components/PdfFieldEditor";
import type { DocumentosAssinados, EnvelopePublico } from "@/lib/types";
import { mensagemDoErro } from "@/lib/erros";
import { Modal, Segmentado } from "@/components/ui";
import {
  FileSignature,
  CheckCircle2,
  Loader2,
  FileText,
  ShieldCheck,
  Building2,
  Mail,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/**
 * O CNPJ e gravado como o vendedor digitou e sai cru nesta tela. Aqui e o
 * unico lugar do produto que uma pessoa de fora le, e o que ela faz com esse
 * numero e CONFERIR se e a empresa dela antes de assinar — sem os pontos e a
 * barra, conferir 14 digitos vira soletracao.
 *
 * So formata com 14 digitos exatos. Cadastro incompleto ou fora do padrao sai
 * inteiro, do jeito que foi digitado: numa tela de assinatura, esconder o valor
 * real e pior do que mostra-lo torto.
 */
function formatarCnpj(cnpj: string): string {
  const digitos = (cnpj || "").replace(/\D/g, "");
  if (digitos.length !== 14) return cnpj;
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export default function AssinarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [dados, setDados] = useState<EnvelopePublico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modoAssinatura, setModoAssinatura] = useState<"desenhada" | "digitada">("digitada");
  const [nomeDigitado, setNomeDigitado] = useState("");
  const [assinaturaDesenhada, setAssinaturaDesenhada] = useState<string | null>(null);
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [modalAssinatura, setModalAssinatura] = useState(false);
  const [emailFaturamento, setEmailFaturamento] = useState("");
  const [tecnicaAberta, setTecnicaAberta] = useState(false);
  const [docsAssinados, setDocsAssinados] = useState<DocumentosAssinados | null>(null);

  useEffect(() => {
    const supabase = createAnonClient();
    supabase
      .rpc("obter_envelope_publico", { p_token: token })
      .then(({ data, error }) => {
        setCarregando(false);
        if (error || !data) {
          setErro(mensagemDoErro(error, "Link inválido ou expirado."));
          return;
        }
        // A RPC devolve `json`, então o tipo gerado é `Json` e o cast é
        // inevitável. Feito UMA vez, num tipo com nome: tudo abaixo é lido com
        // conferência, em vez de cada leitura ser um `any` solto.
        const envelope = data as unknown as EnvelopePublico;
        setDados(envelope);
        setNomeDigitado(envelope.signatario.nome);
        setEmailFaturamento("");
        if (envelope.signatario.status === "assinado") setConcluido(true);
        if (envelope.documentos_assinados) setDocsAssinados(envelope.documentos_assinados);
      });
  }, [token]);

  const handleAssinar = async () => {
    if (!aceite) return;
    const assinaturaDados = modoAssinatura === "digitada" ? nomeDigitado.trim() : assinaturaDesenhada;
    if (!assinaturaDados) return;

    setErro(null);
    setEnviando(true);
    try {
      const resp = await fetch(`/api/assinar/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: modoAssinatura,
          dados: assinaturaDados,
          email_faturamento: emailFaturamento.trim() || undefined,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro de conexão." }));
        setErro(err.error || "Falha ao registrar assinatura.");
        setEnviando(false);
        return;
      }
      const resultado = await resp.json().catch(() => null);
      if (resultado?.documentos_assinados) setDocsAssinados(resultado.documentos_assinados);
      setModalAssinatura(false);
      setConcluido(true);
    } catch {
      setErro("Erro de conexão. Verifique sua internet e tente novamente.");
    }
    setEnviando(false);
  };

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-recuo">
        <Loader2 className="h-6 w-6 animate-spin text-acento" />
      </div>
    );
  }

  if (erro && !dados) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-recuo p-4">
        <div className="bg-superficie rounded-2xl border border-fio p-8 max-w-md text-center shadow-cartao">
          <ShieldCheck className="h-10 w-10 text-risco mx-auto mb-3" />
          <p className="text-corpo font-semibold text-tinta">{erro}</p>
        </div>
      </div>
    );
  }

  if (!dados) return null;

  const comercialUrl = `/api/pdf-publico/${token}/comercial.pdf`;
  const tecnicaUrl = `/api/pdf-publico/${token}/tecnica.pdf`;
  const campos: CampoAssinatura[] = dados.envelope.campos_assinatura || [];
  const temCamposPosicionados = campos.length > 0;
  const signatarioOrdem = dados.signatario.ordem ?? 2;

  const painelAssinatura = (
    <>
      {/* A QUARTA COPIA A MAO DO CONTROLE DE SEGMENTO, e a unica numa tela que
          o CLIENTE ve. Diferia do `Segmentado` em coisas pequenas e visiveis:
          sem `aria-pressed`, sem alvo de 44px no toque, sem transicao de cor, e
          sem `whitespace-nowrap` — "Desenhar assinatura" quebrava em duas linhas
          no celular e desalinhava as duas opcoes do trilho. */}
      <Segmentado
        rotulo="Como assinar"
        valor={modoAssinatura}
        aoTrocar={setModoAssinatura}
        className="w-fit"
        itens={[
          { chave: "digitada", rotulo: "Digitar nome" },
          { chave: "desenhada", rotulo: "Desenhar assinatura" },
        ]}
      />

      {modoAssinatura === "digitada" ? (
        // Era o UNICO campo do painel sem nome acessivel: sem id, sem label,
        // sem aria-label e sem placeholder. Os dois campos logo abaixo
        // (`assinar-email-faturamento` e `assinar-aceite`) ja seguem este
        // padrao — label com `htmlFor`, input com o `id` correspondente — e
        // este passa a seguir tambem, em vez de inventar outro jeito.
        <div>
          <label htmlFor="assinar-nome-digitado" className="flex items-center gap-2 text-rotulo font-medium text-tinta-suave mb-1">
            <FileSignature className="h-3.5 w-3.5 text-acento" />
            Nome completo para a assinatura
          </label>
          <input id="assinar-nome-digitado"
            value={nomeDigitado}
            onChange={(e) => setNomeDigitado(e.target.value)}
            placeholder="Seu nome completo"
            className="foco w-full px-4 py-3 text-display border-b-2 border-fio-forte"
            style={{ fontFamily: "cursive" }}
          />
        </div>
      ) : (
        <SignaturePad onChange={setAssinaturaDesenhada} />
      )}

      <div>
        <label htmlFor="assinar-email-faturamento" className="flex items-center gap-2 text-rotulo font-medium text-tinta-suave mb-1">
          <Mail className="h-3.5 w-3.5 text-acento" />
          E-mail de faturamento
        </label>
        <input id="assinar-email-faturamento"
          type="email"
          value={emailFaturamento}
          onChange={(e) => setEmailFaturamento(e.target.value)}
          placeholder="email@empresa.com.br"
          className="foco w-full px-3 py-2 text-corpo border border-fio-forte rounded-xl"
        />
      </div>

      <label htmlFor="assinar-aceite" className="flex items-start gap-2 text-rotulo text-tinta-suave">
        <input id="assinar-aceite" type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="foco mt-0.5" />
        <span>
          Declaro que li e concordo com os termos das propostas Comercial e Técnica acima, e que esta
          assinatura eletrônica tem validade jurídica nos termos do art. 10, §2º da Medida Provisória
          nº 2.200-2/2001.
        </span>
      </label>

      {erro && <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">{erro}</p>}

      <button
        onClick={handleAssinar}
        disabled={!aceite || enviando}
        className="foco w-full py-3 text-corpo font-semibold text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        Assinar documento
      </button>
    </>
  );

  return (
    <div className="min-h-screen bg-recuo">
      {/* Era `bg-superficie text-white`: no tema claro a superficie E branca,
          entao "SOFTEUM · Assinatura Eletronica" ficava branco no branco —
          invisivel na PRIMEIRA tela que o cliente ve para assinar. */}
      <header className="bg-superficie border-b border-fio px-6 py-4 flex items-center gap-3">
        <FileSignature className="h-5 w-5 text-acento" />
        <div>
          <p className="font-semibold text-corpo text-tinta">SOFTEUM · Assinatura Eletrônica</p>
          <p className="text-rotulo text-tinta-fraca">Proposta {dados.proposta.numero} · v{dados.proposta.versao}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {concluido ? (
          <div className="bg-superficie rounded-2xl border border-ok/40 shadow-cartao p-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-ok mx-auto mb-4" />
            <h1 className="text-titulo font-semibold text-tinta">Assinatura registrada com sucesso!</h1>
            <p className="text-corpo text-tinta-suave mt-2">
              Obrigado, {dados.signatario.nome}. A Softeum e o vendedor responsável foram notificados.
            </p>
            {docsAssinados ? (
              <div className="mt-6 pt-6 border-t border-fio">
                <p className="text-rotulo font-medium uppercase text-tinta-fraca mb-3">Baixe seus documentos assinados (com certificado de conclusão)</p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <a
                    href={docsAssinados.comercial}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-corpo font-semibold text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl"
                  >
                    <FileText className="h-4 w-4" /> Proposta Comercial
                  </a>
                  <a
                    href={docsAssinados.tecnica}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-corpo font-semibold text-tinta bg-superficie hover:bg-recuo rounded-xl border border-fio"
                  >
                    <FileText className="h-4 w-4" /> Proposta Técnica
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-rotulo text-tinta-fraca mt-4">
                Assim que todos os signatários concluírem, você receberá por e-mail os documentos assinados com o certificado de conclusão.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="bg-superficie rounded-2xl border border-fio shadow-cartao p-6">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-acento" />
                <h1 className="font-semibold text-tinta">{dados.contato.empresa || dados.contato.nome}</h1>
              </div>
              {/* O CNPJ e o unico dado desta linha que o cliente confere
                  digito a digito antes de assinar. Cru, ele saia como
                  "12345678000199". */}
              <p className="text-rotulo text-tinta-suave">
                {dados.negocio.titulo} · CNPJ {formatarCnpj(dados.contato.cnpj)} · Aviso prévio de{" "}
                {dados.proposta.aviso_previo_dias} dias
              </p>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-rotulo font-medium uppercase text-acento">Proposta Comercial — documento para assinatura</p>
                  <a
                    href={comercialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-rotulo font-medium text-acento hover:text-acento"
                  >
                    <FileText className="h-3 w-3" /> Abrir em nova aba
                  </a>
                </div>
                {temCamposPosicionados ? (
                  <PdfSignViewer
                    pdfUrl={comercialUrl}
                    documento="comercial"
                    campos={campos}
                    signatarioOrdem={signatarioOrdem}
                    assinado={concluido}
                    onCampoClick={() => setModalAssinatura(true)}
                  />
                ) : (
                  <div className="rounded-xl overflow-hidden border border-fio">
                    <iframe src={comercialUrl} className="w-full h-125" title="Proposta Comercial" />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-superficie rounded-2xl border border-fio shadow-cartao p-6 space-y-4">
              <h2 className="font-semibold text-corpo text-tinta flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-acento" />
                Assinar Proposta Comercial como {dados.signatario.nome}
              </h2>
              {painelAssinatura}
            </div>

            <div className="bg-superficie rounded-2xl border border-fio shadow-cartao overflow-hidden">
              <button
                onClick={() => setTecnicaAberta(!tecnicaAberta)}
                className="foco w-full flex items-center justify-between px-6 py-4 text-left hover:bg-recuo transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-tinta-fraca" />
                  <p className="text-rotulo font-medium text-tinta-suave">Proposta Técnica (referência)</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={tecnicaUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-rotulo font-medium text-acento hover:text-acento"
                  >
                    <FileText className="h-3 w-3" /> Abrir em nova aba
                  </a>
                  {tecnicaAberta ? <ChevronUp className="h-4 w-4 text-tinta-fraca" /> : <ChevronDown className="h-4 w-4 text-tinta-fraca" />}
                </div>
              </button>
              {tecnicaAberta && (
                <div className="px-6 pb-6">
                  {temCamposPosicionados && campos.some((c) => c.documento === "tecnica") ? (
                    <PdfSignViewer
                      pdfUrl={tecnicaUrl}
                      documento="tecnica"
                      campos={campos}
                      signatarioOrdem={signatarioOrdem}
                      assinado={concluido}
                      onCampoClick={() => setModalAssinatura(true)}
                    />
                  ) : (
                    <div className="rounded-xl overflow-hidden border border-fio">
                      <iframe src={tecnicaUrl} className="w-full h-125" title="Proposta Técnica" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Era um modal escrito a mao: `bg-black/50` cru no lugar do veu, sem
          Escape, sem foco preso e sem `aria-modal`. Quem assina aqui e o
          CLIENTE, e essa e a tela em que ele decide — o `Modal` do sistema traz
          as tres coisas de graca. */}
      <Modal
        aberto={modalAssinatura}
        aoFechar={() => setModalAssinatura(false)}
        titulo={`Assinar como ${dados.signatario.nome}`}
      >
        {painelAssinatura}
      </Modal>
    </div>
  );
}
