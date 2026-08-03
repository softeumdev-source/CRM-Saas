"use client";

import { useState } from "react";
import { Plus, Edit3, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Plano } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";

const PLANO_VAZIO = {
  nome: "",
  descricao: "",
  franquia_pedidos: 1000,
  valor_setup_plataforma: 0,
  valor_setup_erp: 0,
  valor_setup_catalogo: 0,
  valor_plataforma_base: 690,
  valor_uso_base: 890,
  valor_excedente_pedido: 2,
};

export function PlanosTab({ planosIniciais }: { planosIniciais: Plano[] }) {
  const [planos, setPlanos] = useState(planosIniciais);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Plano | null>(null);
  const [form, setForm] = useState<any>(PLANO_VAZIO);

  const abrirNovo = () => {
    setEditando(null);
    setForm(PLANO_VAZIO);
    setModalAberto(true);
  };

  const abrirEdicao = (p: Plano) => {
    setEditando(p);
    setForm(p);
    setModalAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    if (editando) {
      const { data } = await supabase.from("planos").update(form).eq("id", editando.id).select().single();
      if (data) setPlanos((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } else {
      const { data } = await supabase.from("planos").insert(form).select().single();
      if (data) setPlanos((prev) => [...prev, data]);
    }
    setModalAberto(false);
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este plano?")) return;
    const supabase = createClient();
    await supabase.from("planos").delete().eq("id", id);
    setPlanos((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Planos usados nas propostas</h3>
          <p className="text-xs text-slate-500">Os vendedores so podem cobrar igual ou acima destes valores base.</p>
        </div>
        <button onClick={abrirNovo} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-md flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo plano
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {planos.map((p) => (
          <div key={p.id} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">{p.nome}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{p.descricao}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => abrirEdicao(p)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Edit3 className="h-4 w-4" /></button>
                <button onClick={() => excluir(p.id)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="py-2 border-y border-slate-100 dark:border-slate-800 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Franquia</span><strong>{p.franquia_pedidos.toLocaleString("pt-BR")} pedidos/mes</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Plataforma (min)</span><strong className="text-indigo-600">{formatarMoeda(p.valor_plataforma_base)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Uso (min)</span><strong className="text-indigo-600">{formatarMoeda(p.valor_uso_base)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Excedente/pedido</span><strong>{formatarMoeda(p.valor_excedente_pedido)}</strong></div>
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100">{editando ? "Editar plano" : "Novo plano"}</h3>
              <button onClick={() => setModalAberto(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={salvar} className="p-5 space-y-3">
              <input required placeholder="Nome do plano" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
              <textarea placeholder="Descricao" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Franquia de pedidos/mes" value={form.franquia_pedidos} onChange={(v) => setForm({ ...form, franquia_pedidos: v })} />
                <Campo label="Excedente por pedido (R$)" value={form.valor_excedente_pedido} onChange={(v) => setForm({ ...form, valor_excedente_pedido: v })} step="0.01" />
                <Campo label="Plataforma base (R$/mes)" value={form.valor_plataforma_base} onChange={(v) => setForm({ ...form, valor_plataforma_base: v })} />
                <Campo label="Uso base (R$/mes)" value={form.valor_uso_base} onChange={(v) => setForm({ ...form, valor_uso_base: v })} />
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button type="button" onClick={() => setModalAberto(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">Cancelar</button>
                <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md">Salvar plano</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">{label}</label>
      <input
        type="number"
        step={step || "1"}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-indigo-600"
      />
    </div>
  );
}
