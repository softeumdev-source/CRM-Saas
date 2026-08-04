"use client";

import { useState } from "react";
import { UserPlus, Loader2, Copy, Check, Mail, Clock, RefreshCw, UserX, UserCheck, Trash2 } from "lucide-react";
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
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [emailErro, setEmailErro] = useState<string | null>(null);
  const [remetenteTest, setRemetenteTest] = useState(false);
  const [vendedoresState, setVendedoresState] = useState(vendedores);
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const [reenviado, setReenviado] = useState<string | null>(null);
  const [deletandoId, setDeletandoId] = useState<string | null>(null);

  const handleConvidar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const resp = await fetch("/api/vendedores/convidar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), email: email.trim() }),
    });
    const data = await resp.json();
    setEnviando(false);
    if (!resp.ok) {
      setErro(data.error || "Erro ao convidar vendedor.");
      return;
    }
    setLinkGerado(data.link);
    setEmailEnviado(data.emailEnviado);
    setEmailErro(data.emailErro || null);
    setRemetenteTest(data.remetenteTest || false);
    setConvites((prev) => [
      { id: data.convite_id, token: data.token, email, nome, role: "vendedor", status: "pendente", tenant_id: usuarioAtual.tenant_id, convidado_por: usuarioAtual.id, criado_em: new Date().toISOString(), expira_em: "" } as any,
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

  const handleReenviar = async (conviteId: string) => {
    setReenviandoId(conviteId);
    const resp = await fetch("/api/vendedores/reenviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conviteId }),
    });
    setReenviandoId(null);
    if (resp.ok) {
      setReenviado(conviteId);
      setTimeout(() => setReenviado(null), 2500);
    }
  };

  const toggleAtivo = async (v: Usuario) => {
    const novoAtivo = !v.ativo;
    if (novoAtivo === false && !confirm(`Desativar ${v.nome}? Ele nao conseguira mais acessar o sistema, mas os leads dele continuam atribuidos.`)) return;
    setVendedoresState((prev) => prev.map((u) => (u.id === v.id ? { ...u, ativo: novoAtivo } : u)));
    const supabase = createClient();
    await supabase.from("usuarios").update({ ativo: novoAtivo }).eq("id", v.id);
  };

  const deletarVendedor = async (v: Usuario) => {
    const deles = negocios.filter((n) => n.responsavel_id === v.id);
    const msg = deles.length > 0
      ? `Excluir permanentemente ${v.nome}? Ele tem ${deles.length} negocio(s) — os leads serao devolvidos ao pool sem dono. Esta acao nao pode ser desfeita.`
      : `Excluir permanentemente ${v.nome}? Esta acao nao pode ser desfeita.`;
    if (!confirm(msg)) return;
    setDeletandoId(v.id);
    const supabase = createClient();
    if (deles.length > 0) {
      await supabase.from("negocios").update({ responsavel_id: null }).eq("responsavel_id", v.id);
      await supabase.from("contatos").update({ responsavel_id: null }).eq("responsavel_id", v.id);
    }
    await supabase.from("usuarios").delete().eq("id", v.id);
    setVendedoresState((prev) => prev.filter((u) => u.id !== v.id));
    setDeletandoId(null);
  };

  const deletarConvite = async (conviteId: string) => {
    if (!confirm("Cancelar este convite?")) return;
    const supabase = createClient();
    await supabase.from("convites").delete().eq("id", conviteId);
    setConvites((prev) => prev.filter((c) => c.id !== conviteId));
  };

  const totalMeta = vendedoresState.filter((v) => v.ativo !== false).reduce((acc, v) => acc + (v.meta_mensal || 0), 0);
  const pendentes = convites.filter((c) => c.status === "pendente");
  const vendedoresAtivos = vendedoresState.filter((v) => v.ativo !== false);
  const vendedoresInativos = vendedoresState.filter((v) => v.ativo === false);

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
            <div className={`rounded-xl p-3 text-xs ${emailEnviado ? "bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800" : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"}`}>
              <p className={`font-bold mb-1.5 ${emailEnviado ? "text-indigo-800 dark:text-indigo-300" : "text-amber-800 dark:text-amber-300"}`}>
                {emailEnviado
                  ? remetenteTest
                    ? "E-mail enviado (remetente de teste — so chega no e-mail da conta Resend). Link de apoio:"
                    : "E-mail de convite enviado! Link de apoio:"
                  : emailErro
                    ? `Falha ao enviar e-mail: ${emailErro}`
                    : "RESEND_API_KEY nao configurada — envie este link manualmente:"}
              </p>
              {!emailEnviado && (
                <p className="text-amber-700 dark:text-amber-400 mb-2">
                  Configure as variaveis RESEND_API_KEY e RESEND_FROM_EMAIL (com dominio verificado no Resend) nas variaveis de ambiente do Vercel.
                </p>
              )}
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">{linkGerado}</code>
                <button onClick={copiarLink} className="text-indigo-600">{copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
              </div>
            </div>
          )}

          {pendentes.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase text-slate-400 mb-2">Convites pendentes</p>
              <div className="space-y-1.5">
                {pendentes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
                    <span className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300 truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{c.email}</span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1 text-amber-600"><Clock className="h-3 w-3" /> pendente</span>
                      <button
                        type="button"
                        onClick={() => handleReenviar(c.id)}
                        disabled={reenviandoId === c.id}
                        className="flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      >
                        {reenviandoId === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : reenviado === c.id ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Reenviar
                      </button>
                      <button
                        onClick={() => deletarConvite(c.id)}
                        className="text-rose-500 hover:text-rose-700"
                        title="Cancelar convite"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 content-start">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-xs font-bold uppercase text-slate-400">Total de vendedores</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">{vendedoresAtivos.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-xs font-bold uppercase text-slate-400">Meta mensal somada</p>
            <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">{formatarMoeda(totalMeta)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-xs font-bold uppercase text-slate-400">Negocios ativos</p>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{negocios.filter((n) => !n.ganho).length}</p>
          </div>

          {vendedoresAtivos.map((v) => {
            const deles = negocios.filter((n) => n.responsavel_id === v.id);
            const valorAtivo = deles.reduce((acc, n) => acc + (n.valor || 0), 0);
            return (
              <div key={v.id} className="col-span-full sm:col-span-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-extrabold shrink-0">
                    {iniciais(v.nome)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{v.nome}</p>
                    <p className="text-xs text-slate-500 truncate">{v.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">{formatarMoeda(valorAtivo)}</p>
                    <p className="text-[11px] text-slate-400">{deles.length} negocios</p>
                  </div>
                  <button
                    onClick={() => toggleAtivo(v)}
                    title="Desativar vendedor"
                    className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-xl transition-colors"
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deletarVendedor(v)}
                    disabled={deletandoId === v.id}
                    title="Excluir vendedor permanentemente"
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {deletandoId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}

          {vendedoresInativos.length > 0 && (
            <div className="col-span-full">
              <p className="text-[11px] font-bold uppercase text-slate-400 mb-2 mt-2">Vendedores desativados ({vendedoresInativos.length})</p>
              <div className="space-y-2">
                {vendedoresInativos.map((v) => (
                  <div key={v.id} className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 opacity-70">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-[10px] font-extrabold shrink-0">
                        {iniciais(v.nome)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-slate-700 dark:text-slate-300 truncate">{v.nome}</p>
                        <p className="text-[11px] text-slate-400 truncate">{v.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleAtivo(v)}
                        title="Reativar vendedor"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg"
                      >
                        <UserCheck className="h-3.5 w-3.5" /> Reativar
                      </button>
                      <button
                        onClick={() => deletarVendedor(v)}
                        disabled={deletandoId === v.id}
                        title="Excluir permanentemente"
                        className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg"
                      >
                        {deletandoId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
