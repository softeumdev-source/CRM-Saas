"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EtapaPipeline, Usuario } from "@/lib/types";
import { Alerta, Button, Field, Input, Modal, Rotulo, Select } from "@/components/ui";

export function NewLeadModal({
  etapas,
  etapaInicial,
  vendedores,
  usuarioAtual,
  onClose,
}: {
  etapas: EtapaPipeline[];
  /** Etapa em que o card será criado (vem do botão "+" da coluna). */
  etapaInicial?: string | null;
  vendedores: Usuario[];
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
  const [responsavelId, setResponsavelId] = useState(
    usuarioAtual.role === "vendedor" ? usuarioAtual.id : "",
  );

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

    const etapa = etapas.find((et) => et.id === etapaId);
    const { data: negocio, error: erroNegocio } = await supabase
      .from("negocios")
      .insert({
        tenant_id: usuarioAtual.tenant_id,
        titulo: titulo.trim(),
        valor: 0,
        contato_id: contato.id,
        responsavel_id: responsavelId || null,
        etapa_id: etapaId || null,
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
      titulo="Novo negócio"
      rodape={
        <>
          <Button variante="sutil" onClick={onClose}>
            Cancelar
          </Button>
          {/* O rodape do Modal fica fora do <form>, entao o submit se liga a ele
              pelo atributo form em vez de por aninhamento. */}
          <Button type="submit" form={idForm} variante="primario" carregando={loading}>
            Criar negócio
          </Button>
        </>
      }
    >
      <form id={idForm} onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Rotulo>Contato</Rotulo>
          <Field rotulo="Nome" obrigatorio>
            {(p) => <Input {...p} required value={nome} onChange={(e) => setNome(e.target.value)} />}
          </Field>
          <Field rotulo="Empresa">
            {(p) => <Input {...p} value={empresa} onChange={(e) => setEmpresa(e.target.value)} />}
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field rotulo="E-mail">
              {(p) => (
                <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
            </Field>
            <Field rotulo="Telefone">
              {(p) => (
                <Input {...p} value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              )}
            </Field>
          </div>
          <Field rotulo="CNPJ" dica="Necessário para gerar proposta — dá para preencher depois.">
            {(p) => (
              <Input
                {...p}
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <Rotulo>Negócio</Rotulo>
          <Field rotulo="Título" obrigatorio>
            {(p) => (
              <Input
                {...p}
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Automação de pedidos — Acme Ltda"
              />
            )}
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field rotulo="Etapa">
              {(p) => (
                <Select {...p} value={etapaId} onChange={(e) => setEtapaId(e.target.value)}>
                  {etapas.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.nome}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field rotulo="Responsável">
              {(p) => (
                <Select
                  {...p}
                  value={responsavelId}
                  onChange={(e) => setResponsavelId(e.target.value)}
                >
                  <option value="">Sem dono (pool)</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>

        {erro && <Alerta>{erro}</Alerta>}
      </form>
    </Modal>
  );
}
