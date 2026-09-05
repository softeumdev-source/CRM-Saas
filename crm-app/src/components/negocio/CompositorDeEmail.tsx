"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Send, ShieldAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ANEXOS_POR_MENSAGEM } from "@/lib/anexos";
import { descartarAnexo, subirAnexo, tamanhoLegivel, type Anexo } from "@/lib/anexosUpload";
import type { NegocioComRelacoes } from "@/lib/types";
import { Alerta, AreaTexto, Botao, Selo } from "@/components/ui";
import { BotaoSugerirHorarios } from "@/components/agenda/BotaoSugerirHorarios";

/**
 * Responder o cliente sem sair do card.
 *
 * A forma é a mesma do resto da aba, e isso é o ponto: **bloco de largura
 * total**, com "Para:" em cima do texto, e não a barrinha de chat do WhatsApp.
 * Se o compositor virasse uma barra, as duas abas voltariam a se confundir no
 * teste do borrão — que é exatamente o defeito que a Fase 4 foi consertar.
 *
 * O arquivo sobe DIRETO para o Storage antes de a rota ser chamada (ver
 * `lib/anexosUpload.ts`); daqui para a rota vão só os ids.
 */

type PropostaAnexavel = {
  id: string;
  numero: string | null;
  temComercial: boolean;
  temTecnica: boolean;
};

type ParteDaProposta = "comercial" | "tecnica";

export function CompositorDeEmail({
  negocio,
  aoEnviado,
}: {
  negocio: NegocioComRelacoes;
  aoEnviado: () => void;
}) {
  const [rascunho, setRascunho] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [subindo, setSubindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [propostas, setPropostas] = useState<PropostaAnexavel[]>([]);
  const [escolhendoProposta, setEscolhendoProposta] = useState(false);
  const [proposta, setProposta] = useState<PropostaAnexavel | null>(null);
  const [partes, setPartes] = useState<ParteDaProposta[]>([]);

  const entrada = useRef<HTMLInputElement>(null);
  const destino = negocio.contato?.email?.trim() || "";

  // A chave de idempotência é da MENSAGEM, não do clique — mesmo desenho do
  // WhatsApp. Dois cliques no mesmo texto mandam a mesma chave e o cliente
  // recebe uma vez só; editar o texto zera a chave, porque texto diferente é
  // outra mensagem e a rota devolveria "já enviada" para o texto antigo.
  const chave = useRef<string | null>(null);

  /**
   * A sugestão de horários entra NO FIM do que já está escrito, com uma linha
   * em branco separando. Trocar o rascunho da pessoa por um texto gerado é o
   * jeito mais rápido de fazer alguém nunca mais clicar no botão.
   *
   * E zera a `chave` pelo mesmo motivo que o `onChange` do textarea: texto
   * diferente é outra mensagem. Sem isto, quem tentasse enviar, falhasse, e
   * então acrescentasse os horários, mandaria o texto NOVO com a chave do
   * texto VELHO — e a rota responderia "já enviada" sem enviar nada.
   */
  const acrescentarAoRascunho = (texto: string) => {
    setRascunho((atual) => (atual.trim() ? `${atual.trimEnd()}\n\n${texto}` : texto));
    setErro(null);
    chave.current = null;
  };

  useEffect(() => {
    let vivo = true;
    void createClient()
      .from("propostas")
      .select("id, numero, pdf_comercial_path, pdf_tecnica_path")
      .eq("negocio_id", negocio.id)
      .order("criado_em", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!vivo || !data) return;
        setPropostas(
          data
            .map((p) => ({
              id: p.id,
              numero: p.numero,
              temComercial: !!p.pdf_comercial_path,
              temTecnica: !!p.pdf_tecnica_path,
            }))
            .filter((p) => p.temComercial || p.temTecnica),
        );
      });
    return () => {
      vivo = false;
    };
  }, [negocio.id]);

  const escolherArquivos = useCallback(
    async (lista: FileList | null) => {
      if (!lista || lista.length === 0) return;
      setErro(null);
      setSubindo(true);
      const arquivos = Array.from(lista).slice(0, ANEXOS_POR_MENSAGEM - anexos.length);
      if (arquivos.length < lista.length) {
        setErro(`No máximo ${ANEXOS_POR_MENSAGEM} arquivos por e-mail.`);
      }
      for (const arquivo of arquivos) {
        const r = await subirAnexo({ tenantId: negocio.tenant_id, negocioId: negocio.id, arquivo });
        // Um arquivo que falha não cancela os outros: a pessoa selecionou
        // vários e só um estourou o teto.
        if (r.ok) setAnexos((atual) => [...atual, r.anexo]);
        else setErro(r.erro);
      }
      setSubindo(false);
    },
    [anexos.length, negocio.id, negocio.tenant_id],
  );

  const remover = useCallback(async (anexo: Anexo) => {
    setAnexos((atual) => atual.filter((a) => a.id !== anexo.id));
    // O arquivo sai do bucket junto. Tirar só o chip deixaria lixo pago no
    // Storage que nenhuma tela mostra.
    await descartarAnexo(anexo);
  }, []);

  const enviar = useCallback(async () => {
    setEnviando(true);
    setErro(null);
    chave.current ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/email/responder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          negocioId: negocio.id,
          texto: rascunho,
          chave: chave.current,
          anexoIds: anexos.map((a) => a.id),
          ...(proposta && partes.length > 0
            ? { propostaId: proposta.id, propostaPartes: partes }
            : {}),
        }),
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) {
        // O rascunho NÃO é apagado. Quase todo erro aqui é recuperável — caixa
        // não conectada, anexo pela metade — e apagar o texto seria punir a
        // pessoa por algo que não foi ela que fez.
        setErro(dados?.error || "Não foi possível enviar.");
        return;
      }
      setRascunho("");
      setAnexos([]);
      setProposta(null);
      setPartes([]);
      chave.current = null;
      aoEnviado();
    } catch {
      setErro("Sem conexão. O texto continua aqui.");
    } finally {
      setEnviando(false);
    }
  }, [negocio.id, rascunho, anexos, proposta, partes, aoEnviado]);

  if (!destino) {
    return (
      <div className="border-t border-fio px-5 py-4">
        <Alerta tom="alerta" icone={ShieldAlert} titulo="Este contato não tem e-mail">
          Sem endereço não há para onde responder. Preencha o e-mail na aba Geral.
        </Alerta>
      </div>
    );
  }

  const nada = !rascunho.trim() || enviando || subindo;

  return (
    <div className="border-t border-fio bg-superficie px-5 py-4">
      <p className="mb-2 text-rotulo text-tinta-suave">
        Para <span className="text-tinta">{negocio.contato?.nome || destino}</span>
        <span className="text-tinta-fraca"> · {destino}</span>
      </p>

      <AreaTexto
        rows={4}
        value={rascunho}
        onChange={(e) => {
          setRascunho(e.target.value);
          if (erro) setErro(null);
          chave.current = null;
        }}
        placeholder="Escreva a resposta…"
        aria-label="Resposta por e-mail"
        disabled={enviando}
      />

      {(anexos.length > 0 || partes.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {anexos.map((a) => (
            <li key={a.id}>
              <Chip
                nome={a.nome}
                detalhe={tamanhoLegivel(a.tamanho)}
                aoRemover={() => void remover(a)}
              />
            </li>
          ))}
          {partes.map((p) => (
            <li key={p}>
              <Chip
                nome={`proposta-${proposta?.numero ?? ""}-${p}.pdf`}
                detalhe="da proposta"
                aoRemover={() => setPartes((atual) => atual.filter((x) => x !== p))}
              />
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <Alerta tom="risco" icone={ShieldAlert} titulo="O e-mail não foi enviado" className="mt-3">
          {erro}
        </Alerta>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={entrada}
            type="file"
            multiple
            className="foco hidden"
            onChange={(e) => {
              void escolherArquivos(e.target.files);
              // Zerado para que escolher o MESMO arquivo de novo dispare o
              // change — sem isto, remover e reanexar não faz nada.
              e.target.value = "";
            }}
          />
          <Botao
            variante="secundario"
            tamanho="sm"
            icone={Paperclip}
            carregando={subindo}
            onClick={() => entrada.current?.click()}
            disabled={anexos.length >= ANEXOS_POR_MENSAGEM || enviando}
          >
            Anexar arquivo
          </Botao>

          {propostas.length > 0 && (
            <Botao
              variante="secundario"
              tamanho="sm"
              icone={FileText}
              onClick={() => setEscolhendoProposta((v) => !v)}
              aria-expanded={escolhendoProposta}
              disabled={enviando}
            >
              Anexar proposta
            </Botao>
          )}

          <BotaoSugerirHorarios desabilitado={enviando} aoSugerir={acrescentarAoRascunho} />
        </div>

        <Botao variante="primario" icone={Send} disabled={nada} carregando={enviando} onClick={enviar}>
          {enviando ? "Enviando…" : "Enviar"}
        </Botao>
      </div>

      {escolhendoProposta && (
        <ul className="mt-2 flex flex-col gap-1 rounded-xl border border-fio bg-recuo p-2">
          {propostas.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  setProposta(p);
                  setPartes(
                    [p.temComercial && "comercial", p.temTecnica && "tecnica"].filter(
                      (x): x is ParteDaProposta => !!x,
                    ),
                  );
                  setEscolhendoProposta(false);
                }}
                className="foco flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-rotulo text-tinta hover:bg-superficie"
              >
                <span>Proposta {p.numero}</span>
                <Selo tom="neutro">
                  {[p.temComercial && "comercial", p.temTecnica && "técnica"]
                    .filter(Boolean)
                    .join(" + ")}
                </Selo>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({
  nome,
  detalhe,
  aoRemover,
}: {
  nome: string;
  detalhe?: string;
  aoRemover: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-fio bg-recuo px-2.5 py-1.5 text-rotulo text-tinta">
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-tinta-suave" aria-hidden />
      <span className="truncate">{nome}</span>
      {detalhe && <span className="shrink-0 text-tinta-fraca tabular">{detalhe}</span>}
      {/* O `x` media 18px, e num chip que fica colado no texto isso e alvo
          pequeno demais — medido a 390px. O `p-1` sobe a caixa visivel para
          22px e o `::after` do `pointer-coarse` estende o ALVO para 44x44 sem
          mexer no tamanho do chip. E a mesma decisao que o `Botao` ja tomou:
          alvo por PONTEIRO, nao por largura de tela. */}
      <button
        onClick={aoRemover}
        aria-label={`Remover ${nome}`}
        className="foco relative -mr-1 shrink-0 rounded-lg p-1 text-tinta-fraca transition-colors duration-150 ease-out hover:text-risco pointer-coarse:after:absolute pointer-coarse:after:left-1/2 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:w-11 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2 pointer-coarse:after:content-['']"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}
