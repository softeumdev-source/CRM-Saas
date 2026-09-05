"use client";

import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { NegocioComRelacoes } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { Alerta, Apoio, Botao, Campo, Cartao, Entrada, Recuo, Rotulo, Selecao, Selo } from "@/components/ui";

/**
 * `AAAA-MM-DD` (ou um ISO completo) como `04/09/2026`, sem passar por `Date`.
 *
 * Fatiar a string é DE PROPÓSITO. `new Date("2026-09-06")` é meia-noite em UTC:
 * formatado no fuso de quem olha, vira dia 5 à noite no Brasil — a previsão de
 * fechamento apareceria um dia antes da que está gravada. Data sem hora não tem
 * fuso, e tratá-la como instante é inventar um.
 */
function dataCurta(iso: string | null | undefined): string | null {
  const [ano, mes, dia] = (iso || "").slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : null;
}

/** Uma linha de metadado do resumo: rótulo à esquerda, valor à direita. */
function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-rotulo text-tinta-suave shrink-0">{rotulo}</dt>
      <dd className="text-corpo text-tinta text-right min-w-0 truncate">{children}</dd>
    </div>
  );
}

type CamposDoContato = {
  nome: string;
  empresa: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  cnpj: string | null;
  cargo: string | null;
  estado: string | null;
};

export function VisaoGeralTab({
  negocio,
  onAtualizarContato,
}: {
  negocio: NegocioComRelacoes;
  onAtualizarContato: (campos: Partial<NonNullable<NegocioComRelacoes["contato"]>>) => void;
}) {
  const [nome, setNome] = useState(negocio.contato?.nome || "");
  const [empresa, setEmpresa] = useState(negocio.contato?.empresa || "");
  const [email, setEmail] = useState(negocio.contato?.email || "");
  const [telefone, setTelefone] = useState(negocio.contato?.telefone || "");
  const [whatsapp, setWhatsapp] = useState(negocio.contato?.whatsapp || "");
  const [cnpj, setCnpj] = useState(negocio.contato?.cnpj || "");
  const [cargo, setCargo] = useState(negocio.contato?.cargo || "");
  // O estado antes se chamava `industria` mas gravava em `contato.estado`. Um
  // nome mentindo sobre o campo e o comeco de um bug.
  const [uf, setUf] = useState(negocio.contato?.estado || "");
  // A prioridade agora faz parte do MESMO formulario. Antes era um <select>
  // nao controlado que gravava sozinho no change, sem tratar erro — dois
  // modelos de salvamento na mesma tela, e um deles invisivel.
  const [prioridade, setPrioridade] = useState(negocio.prioridade || "media");

  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const semCnpj = !cnpj.trim();

  const salvar = async () => {
    if (!negocio.contato) return;
    setSalvando(true);
    setErro(null);
    const supabase = createClient();
    const agora = new Date().toISOString();

    const campos: CamposDoContato = {
      nome: nome.trim(),
      empresa: empresa.trim() || null,
      email: email.trim() || null,
      telefone: telefone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      cnpj: cnpj.trim() || null,
      cargo: cargo.trim() || null,
      estado: uf.trim() || null,
    };

    const [contatoR, negocioR] = await Promise.all([
      supabase.from("contatos").update({ ...campos, atualizado_em: agora }).eq("id", negocio.contato.id),
      // Prioridade vive em `negocios`, nao em `contatos` — sao duas tabelas,
      // mas um botao so, porque para quem usa e um formulario so.
      prioridade === (negocio.prioridade || "media")
        ? Promise.resolve({ error: null })
        : supabase.from("negocios").update({ prioridade, atualizado_em: agora }).eq("id", negocio.id),
    ]);

    setSalvando(false);
    const falha = contatoR.error || negocioR.error;
    if (falha) {
      setErro(
        falha.message.includes("dominio") || falha.message.includes("concorrentes")
          ? "Não é permitido cadastrar e-mails deste domínio."
          : falha.message.includes("duplicate") || (falha as { code?: string }).code === "23505"
            ? "Já existe um contato com este e-mail."
            : falha.message,
      );
      return;
    }

    setSalvo(true);
    onAtualizarContato(campos);
    setTimeout(() => setSalvo(false), 2000);
  };

  return (
    // `items-start`: sem ele o grid usa `stretch` e o cartão da direita — que
    // tem um terço do conteúdo do formulário ao lado — era esticado até a
    // altura dele, deixando ~350px de branco no rodapé.
    <div className="grid gap-4 md:grid-cols-2 md:items-start">
      <Cartao className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Rotulo>Dados do contato</Rotulo>
            <Apoio>Vale para todos os negócios deste contato.</Apoio>
          </div>
          <div aria-live="polite" className="flex h-5 items-center gap-1">
            {salvando ? (
              <span className="flex items-center gap-1 text-rotulo text-tinta-fraca">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Salvando…
              </span>
            ) : salvo ? (
              <span className="flex items-center gap-1 text-rotulo font-medium text-ok">
                <Check className="h-3.5 w-3.5" aria-hidden /> Salvo
              </span>
            ) : null}
          </div>
        </div>

        {erro ? <Alerta tom="risco" urgente>{erro}</Alerta> : null}

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome do contato" obrigatorio>
            {(p) => <Entrada {...p} value={nome} onChange={(e) => setNome(e.target.value)} />}
          </Campo>
          <Campo rotulo="Empresa">
            {(p) => <Entrada {...p} value={empresa} onChange={(e) => setEmpresa(e.target.value)} />}
          </Campo>
          <Campo rotulo="E-mail">
            {(p) => <Entrada {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Campo>
          <Campo rotulo="Telefone">
            {(p) => <Entrada {...p} value={telefone} onChange={(e) => setTelefone(e.target.value)} />}
          </Campo>
        </div>

        <Campo rotulo="WhatsApp" dica="É por aqui que a conversa do card acontece.">
          {(p) => (
            <Entrada {...p} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(00) 00000-0000" />
          )}
        </Campo>

        <Campo
          rotulo="CNPJ"
          erro={semCnpj ? "Sem CNPJ não é possível gerar a proposta." : null}
        >
          {(p) => (
            <Entrada {...p} value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          )}
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Cargo">
            {(p) => <Entrada {...p} value={cargo} onChange={(e) => setCargo(e.target.value)} />}
          </Campo>
          <Campo rotulo="Estado (UF)">
            {(p) => <Entrada {...p} value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} />}
          </Campo>
        </div>

        <Campo rotulo="Prioridade">
          {(p) => (
            <Selecao {...p} value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </Selecao>
          )}
        </Campo>

        <Botao
          variante="primario"
          tamanho="lg"
          larguraTotal
          icone={Save}
          carregando={salvando}
          disabled={!nome.trim()}
          onClick={salvar}
        >
          Salvar alterações
        </Botao>
      </Cartao>

      <Cartao className="flex flex-col gap-4">
        <div>
          <Rotulo>Resumo do negócio</Rotulo>
          <Apoio>{negocio.titulo}</Apoio>
        </div>

        {/* Saiu "Etapa": ela já é um `<select>` no cabeçalho da página, e repetir
            aqui gastava metade da linha para dizer o que está três centímetros
            acima. Entrou o VALOR, que é o número que define o negócio e só
            aparecia no topo quando maior que zero. */}
        <div className="grid grid-cols-2 gap-3">
          <Recuo>
            <p className="text-rotulo text-tinta-suave">Valor</p>
            <p className="text-titulo font-medium text-tinta tabular">
              {negocio.valor ? formatarMoeda(negocio.valor) : "—"}
            </p>
          </Recuo>
          <Recuo>
            <p className="text-rotulo text-tinta-suave">Probabilidade</p>
            <p className="text-titulo font-medium text-tinta tabular">{negocio.probabilidade ?? 0}%</p>
          </Recuo>
        </div>

        {/* Tudo aqui já vinha no `SELECT_NEGOCIO_COMPLETO` e não era mostrado em
            lugar nenhum da tela — a previsão de fechamento, inclusive. */}
        <dl className="flex flex-col gap-2.5">
          <Linha rotulo="Dono">
            {negocio.responsavel?.nome ?? <span className="text-tinta-fraca">Sem dono</span>}
          </Linha>
          <Linha rotulo="Previsão de fechamento">
            {dataCurta(negocio.data_fechamento_prevista) ?? (
              <span className="text-tinta-fraca">Sem data</span>
            )}
          </Linha>
          <Linha rotulo="Criado em">
            {dataCurta(negocio.criado_em) ?? <span className="text-tinta-fraca">—</span>}
          </Linha>
          <Linha rotulo="Origem">
            <span className="capitalize">{negocio.contato?.origem || "manual"}</span>
          </Linha>
        </dl>

        {negocio.motivo_perda ? (
          <Alerta tom="risco" titulo="Motivo da perda">
            {negocio.motivo_perda}
          </Alerta>
        ) : null}

        {negocio.contato?.tags && negocio.contato.tags.length > 0 ? (
          <div>
            <p className="mb-1.5 text-rotulo text-tinta-suave">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {negocio.contato.tags.map((tag) => (
                <Selo key={tag}>{tag}</Selo>
              ))}
            </div>
          </div>
        ) : null}
      </Cartao>
    </div>
  );
}
