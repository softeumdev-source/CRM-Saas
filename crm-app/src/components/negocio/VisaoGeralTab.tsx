"use client";

import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { NegocioComRelacoes } from "@/lib/types";

export function VisaoGeralTab({
  negocio,
  onAtualizarContato,
}: {
  negocio: NegocioComRelacoes;
  onAtualizarContato: (campos: Partial<NonNullable<NegocioComRelacoes["contato"]>>) => void;
}) {
  const [cnpj, setCnpj] = useState(negocio.contato?.cnpj || "");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [cargo, setCargo] = useState(negocio.contato?.cargo || "");
  const [industria, setIndustria] = useState(negocio.contato?.estado || "");
  const [nome, setNome] = useState(negocio.contato?.nome || "");
  const [empresa, setEmpresa] = useState(negocio.contato?.empresa || "");
  const [email, setEmail] = useState(negocio.contato?.email || "");
  const [telefone, setTelefone] = useState(negocio.contato?.telefone || "");
  const [whatsapp, setWhatsapp] = useState(negocio.contato?.whatsapp || "");
  const [erroContato, setErroContato] = useState<string | null>(null);

  const salvarContato = async (campos: Record<string, any>) => {
    if (!negocio.contato) return;
    setSalvando(true);
    setErroContato(null);
    const supabase = createClient();
    const { error } = await supabase.from("contatos").update({ ...campos, atualizado_em: new Date().toISOString() }).eq("id", negocio.contato.id);
    setSalvando(false);
    if (error) {
      setErroContato(
        error.message.includes("dominio") || error.message.includes("concorrentes")
          ? "Não é permitido cadastrar e-mails deste domínio."
          : error.message.includes("duplicate") || error.code === "23505"
            ? "Já existe um contato com este e-mail."
            : error.message
      );
      return;
    }
    setSalvo(true);
    onAtualizarContato(campos);
    setTimeout(() => setSalvo(false), 2000);
  };

  const salvarTudo = () => {
    salvarContato({
      nome: nome.trim(),
      empresa: empresa.trim() || null,
      email: email.trim() || null,
      telefone: telefone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      cnpj: cnpj.trim() || null,
      cargo: cargo.trim() || null,
      estado: industria.trim() || null,
    });
  };

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Dados do contato</h3>
          <div className="flex items-center gap-1.5 h-5">
            {salvando && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...
              </span>
            )}
            {salvo && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                <Check className="h-3.5 w-3.5" /> Salvo
              </span>
            )}
          </div>
        </div>

        {erroContato && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erroContato}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Nome do contato</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Empresa</label>
            <input
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Telefone</label>
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">WhatsApp</label>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(00) 00000-0000"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
            CNPJ <span className="text-rose-500">(obrigatório para gerar proposta)</span>
          </label>
          <input
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            placeholder="00.000.000/0000-00"
            className={`w-full px-3 py-2 text-sm rounded-xl border ${
              cnpj.trim() ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
            }`}
          />
          {!cnpj.trim() && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
              Sem CNPJ não é possível gerar a proposta para este cliente.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Cargo</label>
            <input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Estado (UF)</label>
            <input
              value={industria}
              onChange={(e) => setIndustria(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>

        <button
          onClick={salvarTudo}
          disabled={salvando || !nome.trim()}
          className="w-full py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl shadow-md flex items-center justify-center gap-2 transition-colors"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar alterações
        </button>

        <div>
          <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Origem</label>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 capitalize">{negocio.contato?.origem || "manual"}</p>
        </div>

        {negocio.contato?.tags && negocio.contato.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {negocio.contato.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-3xl p-5 shadow-lg">
        <p className="text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1">Resumo do negócio</p>
        <p className="text-2xl font-extrabold mt-1">{negocio.titulo}</p>
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-indigo-800/60">
          <div>
            <p className="text-xs text-slate-300">Probabilidade</p>
            <p className="text-lg font-bold">{negocio.probabilidade ?? 0}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-300">Prioridade</p>
            <select
              defaultValue={negocio.prioridade || "media"}
              onChange={async (e) => {
                const supabase = createClient();
                await supabase.from("negocios").update({ prioridade: e.target.value }).eq("id", negocio.id);
              }}
              className="bg-indigo-950/60 border border-indigo-700/60 rounded-lg px-2 py-1 text-sm font-bold mt-1"
            >
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
