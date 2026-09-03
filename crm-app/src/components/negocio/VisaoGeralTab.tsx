"use client";

import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { NegocioComRelacoes } from "@/lib/types";
import { Alerta, Apoio, Botao, Campo, Cartao, Entrada, Recuo, Rotulo, Selecao, Selo } from "@/components/ui";

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
    <div className="grid gap-4 md:grid-cols-2">
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

        <div className="grid grid-cols-2 gap-3">
          <Recuo>
            <p className="text-rotulo text-tinta-suave">Probabilidade</p>
            <p className="text-titulo font-medium text-tinta tabular">{negocio.probabilidade ?? 0}%</p>
          </Recuo>
          <Recuo>
            <p className="text-rotulo text-tinta-suave">Etapa</p>
            <p className="text-corpo font-medium text-tinta">{negocio.etapa?.nome ?? "—"}</p>
          </Recuo>
        </div>

        <div>
          <p className="text-rotulo text-tinta-suave">Origem</p>
          <p className="text-corpo capitalize text-tinta">{negocio.contato?.origem || "manual"}</p>
        </div>

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
