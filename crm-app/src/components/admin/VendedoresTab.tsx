"use client";

import { useState } from "react";
import { UserPlus, Loader2, Copy, Check, Mail, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Convite, NegocioComRelacoes, Usuario } from "@/lib/types";
import { formatarMoeda, iniciais } from "@/lib/types";

export function VendedoresTab({
  vendedores,
  convites: convitesIniciais,
  negocios,
  usuarioAtual,
}: {
  vendedores: Usuario[];
  convites: Convite[];
  negocios: NegocioComRelacoes[];
  usuarioAtual: Usuario;
}) {
  const [convites, setConvites] = useState(convitesIniciais);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const handleConvidar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("convidar_usuario", {
      p_email: email.trim(),
      p_nome: nome.trim(),
      p_role: "vendedor",
    });
    setEnviando(false);
    if (error || !data || data.length === 0) {
      setErro(error?.message || "Erro ao convidar vendedor.");
      return;
    }
    const link = `${window.location.origin}/aceitar-convite/${data[0].token}`;
    setLinkGerado(link);
    setConvites((prev) => [
      { id: data[0].convite_id, token: data[0].token, email, nome, role: "vendedor", status: "pendente", tenant_id: usuarioAtual.tenant_id, convidado_por: usuarioAtual.id, criado_em: new Date().toISOString(), expira_em: "" } as any,
      ...prev,
    ]);
    setNome("");
    setEmail("");
  };

  const copiarLink = () => {
    if (!linkGerado) return;
    navigator.clipboard.writeText(linkGerado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const totalMeta = vendedores.reduce((acc, v) => acc + (v.meta_mensal || 0), 0);
  const pendentes = convites.filter((c) => c.status === "pendente");

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4 h-fit">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-indigo-600" /> Convidar novo vendedor
          </h3>
          <form onSubmit={handleConvidar} className="space-y-3">
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@softeum.com.br"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
            {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="w-full py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enviar convite
            </button>
          </form>

          {linkGerado && (
            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 text-xs">
              <p className="font-bold text-indigo-800 dark:text-indigo-300 mb-1.5">Link de convite (envie manualmente se o e-mail nao chegar):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">{linkGerado}</code>
                <button onClick={copiarLink} className="text-indigo-600">{copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
              </div>
            </div>
          )}

          {pendentes.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-slate-400 mb-2">Convites pendentes</p>
              <div className="space-y-1.5">
                {pendentes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
                    <span className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                      <Mail className="h-3.5 w-3.5" /> {c.email}
                    </span>
                    <span className="flex items-center gap-1 text-amber-600"><Clock className="h-3 w-3" /> pendente</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 content-start">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-xs font-bold uppercase text-slate-400">Total de vendedores</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">{vendedores.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-xs font-bold uppercase text-slate-400">Meta mensal somada</p>
            <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">{formatarMoeda(totalMeta)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-xs font-bold uppercase text-slate-400">Negocios ativos</p>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{negocios.filter((n) => !n.ganho).length}</p>
          </div>

          {vendedores.map((v) => {
            const deles = negocios.filter((n) => n.responsavel_id === v.id);
            const valorAtivo = deles.reduce((acc, n) => acc + (n.valor || 0), 0);
            return (
              <div key={v.id} className="col-span-full sm:col-span-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-extrabold">
                    {iniciais(v.nome)}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-900 dark:text-slate-100">{v.nome}</p>
                    <p className="text-xs text-slate-500">{v.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">{formatarMoeda(valorAtivo)}</p>
                  <p className="text-[11px] text-slate-400">{deles.length} negocios</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
