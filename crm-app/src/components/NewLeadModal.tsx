"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EtapaPipeline, Usuario } from "@/lib/types";

export function NewLeadModal({
  etapas,
  vendedores,
  usuarioAtual,
  onClose,
}: {
  etapas: EtapaPipeline[];
  vendedores: Usuario[];
  usuarioAtual: Usuario;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState(0);
  const [etapaId, setEtapaId] = useState(etapas[0]?.id || "");
  const [responsavelId, setResponsavelId] = useState(
    usuarioAtual.role === "vendedor" ? usuarioAtual.id : ""
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

    const etapa = etapas.find((e) => e.id === etapaId);
    const { data: negocio, error: erroNegocio } = await supabase
      .from("negocios")
      .insert({
        tenant_id: usuarioAtual.tenant_id,
        titulo: titulo.trim(),
        valor,
        contato_id: contato.id,
        responsavel_id: responsavelId || null,
        etapa_id: etapaId || null,
        probabilidade: etapa?.probabilidade ?? 10,
      })
      .select()
      .single();

    setLoading(false);
    if (erroNegocio || !negocio) {
      setErro(erroNegocio?.message || "Erro ao criar negocio.");
      return;
    }
    router.push(`/negocios/${negocio.id}`);
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between shrink-0">
          <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">Novo Negocio</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Nome do contato *</label>
              <input required value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Empresa</label>
              <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Telefone</label>
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">CNPJ (necessario para gerar proposta)</label>
              <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Titulo do negocio *</label>
              <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Automacao de pedidos - Acme Ltda" className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Valor estimado (R$)</label>
                <input type="number" min={0} value={valor} onChange={(e) => setValor(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-indigo-600" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Etapa</label>
                <select value={etapaId} onChange={(e) => setEtapaId(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                  {etapas.map((et) => (
                    <option key={et.id} value={et.id}>{et.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Vendedor responsavel</label>
              <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                <option value="">Sem dono (pool)</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar negocio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
