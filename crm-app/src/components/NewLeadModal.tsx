"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EtapaPipeline, Usuario } from "@/lib/types";
import { operaNegocios } from "@/lib/types";
import { Botao, Campo, Entrada, Modal, Selecao } from "@/components/ui";

export function NewLeadModal({
  pipelineId,
  etapas,
  etapaInicial,
  responsaveis,
  usuarioAtual,
  onClose,
}: {
  /** Funil em que o negócio nasce. Ver o comentário do insert abaixo. */
  pipelineId: string | null;
  etapas: EtapaPipeline[];
  /** Etapa em que o card será criado (vem do botão "+" da coluna). */
  etapaInicial?: string | null;
  responsaveis: Usuario[];
  usuarioAtual: Usuario;
  onClose: () => void;
}) {
  const router = useRouter();
  const idForm = useId();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [titulo, setTitulo] = useState("");
  const [etapaId, setEtapaId] = useState(etapaInicial || etapas[0]?.id || "");
  // Quem opera negocio ja entra como dono; admin deixa no pool de proposito.
  const [responsavelId, setResponsavelId] = useState(operaNegocios(usuarioAtual) ? usuarioAtual.id : "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!nome.trim() || !titulo.trim()) return;
    setLoading(true);
    const supabase = createClient();

    const { data: contato, error: erroContato } = await supabase
      .from("contatos")
      .insert({
        tenant_id: usuarioAtual.tenant_id,
        nome: nome.trim(),
        empresa: empresa.trim() || null,
        email: email.trim() || null,
        telefone: telefone.trim() || null,
        cnpj: cnpj.trim() || null,
        responsavel_id: responsavelId || null,
        origem: "manual",
      })
      .select()
      .single();

    if (erroContato || !contato) {
      setLoading(false);
      setErro(erroContato?.message || "Erro ao criar contato.");
      return;
    }

    const etapa = etapas.find((e) => e.id === etapaId);
    const { data: negocio, error: erroNegocio } = await supabase
      .from("negocios")
      .insert({
        tenant_id: usuarioAtual.tenant_id,
        titulo: titulo.trim(),
        valor: 0,
        contato_id: contato.id,
        responsavel_id: responsavelId || null,
        etapa_id: etapaId || null,
        // O gatilho `trg_negocios_pipeline` deduz o funil pela etapa; mandamos
        // explícito porque `etapa_id` é nulável e negócio sem funil não
        // aparece em board nenhum.
        pipeline_id: etapa?.pipeline_id ?? pipelineId,
        probabilidade: etapa?.probabilidade ?? 10,
      })
      .select()
      .single();

    setLoading(false);
    if (erroNegocio || !negocio) {
      setErro(erroNegocio?.message || "Erro ao criar negócio.");
      return;
    }
    router.push(`/negocios/${negocio.id}`);
    router.refresh();
  };

  return (
    <Modal
      aberto
      aoFechar={onClose}
      titulo="Novo Negócio"
      rodape={
        <>
          <Botao variante="sutil" onClick={onClose}>
            Cancelar
          </Botao>
          {/* O rodape do Modal fica fora do <form>, entao o submit se liga a
              ele pelo atributo form em vez de por aninhamento. */}
          <Botao type="submit" form={idForm} variante="primario" carregando={loading}>
            Criar negócio
          </Botao>
        </>
      }
    >
      <form id={idForm} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome do contato" obrigatorio className="col-span-2">
            {(p) => <Entrada {...p} required value={nome} onChange={(e) => setNome(e.target.value)} />}
          </Campo>
          <Campo rotulo="Empresa" className="col-span-2">
            {(p) => <Entrada {...p} value={empresa} onChange={(e) => setEmpresa(e.target.value)} />}
          </Campo>
          <Campo rotulo="E-mail">
            {(p) => (
              <Entrada {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Campo>
          <Campo rotulo="Telefone">
            {(p) => <Entrada {...p} value={telefone} onChange={(e) => setTelefone(e.target.value)} />}
          </Campo>
          <Campo
            rotulo="CNPJ"
            dica="Necessário para gerar proposta — dá para preencher depois."
            className="col-span-2"
          >
            {(p) => (
              <Entrada
                {...p}
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            )}
          </Campo>
        </div>

        <div className="space-y-3 border-t border-fio pt-3">
          <Campo rotulo="Título do negócio" obrigatorio>
            {(p) => (
              <Entrada
                {...p}
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Automação de pedidos - Acme Ltda"
              />
            )}
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Etapa">
              {(p) => (
                <Selecao {...p} value={etapaId} onChange={(e) => setEtapaId(e.target.value)}>
                  {etapas.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Vendedor responsável">
              {(p) => (
                <Selecao
                  {...p}
                  value={responsavelId}
                  onChange={(e) => setResponsavelId(e.target.value)}
                >
                  <option value="">Sem dono (pool)</option>
                  {responsaveis.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          </div>
        </div>

        {erro && (
          <p className="rounded-lg bg-risco-fraco px-3 py-2 text-rotulo font-medium text-risco">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}
