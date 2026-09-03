"use client";

import { useEffect, useState } from "react";
import { UserPlus, Loader2, Copy, Check, Mail, Clock, RefreshCw, UserX, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Convite, NegocioComRelacoes, Papel, Usuario } from "@/lib/types";
import { DESCRICAO_PAPEL, PAPEIS, ROTULO_PAPEL, ehDoTime, formatarMoeda, iniciais } from "@/lib/types";
import { Botao, Confirmar, Selecao } from "@/components/ui";

export function VendedoresTab({
  membros,
  convites: convitesIniciais,
  negocios,
  usuarioAtual,
}: {
  /** Todo mundo que opera negocio: vendedores e SDRs. */
  membros: Usuario[];
  convites: Convite[];
  negocios: NegocioComRelacoes[];
  usuarioAtual: Usuario;
}) {
  const [convites, setConvites] = useState(convitesIniciais);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("vendedor");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [emailErro, setEmailErro] = useState<string | null>(null);
  const [remetenteTest, setRemetenteTest] = useState(false);
  const [membrosState, setMembrosState] = useState(membros);
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const [reenviado, setReenviado] = useState<string | null>(null);

  // Props chegam renovadas via Realtime + router.refresh() do AdminClient.
  useEffect(() => setMembrosState(membros), [membros]);
  useEffect(() => setConvites(convitesIniciais), [convitesIniciais]);

  const handleConvidar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const resp = await fetch("/api/vendedores/convidar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), email: email.trim(), role: papel }),
    });
    const data = await resp.json();
    setEnviando(false);
    if (!resp.ok) {
      setErro(data.error || "Erro ao enviar o convite.");
      return;
    }
    setLinkGerado(data.link);
    setEmailEnviado(data.emailEnviado);
    setEmailErro(data.emailErro || null);
    setRemetenteTest(data.remetenteTest || false);
    setConvites((prev) => [
      { id: data.convite_id, token: data.token, email, nome, role: papel, status: "pendente", tenant_id: usuarioAtual.tenant_id, convidado_por: usuarioAtual.id, criado_em: new Date().toISOString(), expira_em: "" } as any,
      ...prev,
    ]);
    setNome("");
    setEmail("");
    setPapel("vendedor");
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

  const [desativando, setDesativando] = useState<Usuario | null>(null);

  const definirAtivo = async (v: Usuario, ativo: boolean): Promise<string | void> => {
    const antes = membrosState;
    setMembrosState((prev) => prev.map((u) => (u.id === v.id ? { ...u, ativo } : u)));
    const { error } = await createClient().from("usuarios").update({ ativo }).eq("id", v.id);
    if (error) {
      setMembrosState(antes);
      return error.message;
    }
  };

  const totalMeta = membrosState.filter((v) => ehDoTime(v) && v.ativo !== false).reduce((acc, v) => acc + (v.meta_mensal || 0), 0);
  const pendentes = convites.filter((c) => c.status === "pendente");
  const ativos = membrosState.filter((v) => v.ativo !== false);
  const inativos = membrosState.filter((v) => v.ativo === false);
  const vendedoresAtivos = ativos.filter(ehDoTime);

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4 h-fit">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-indigo-600" /> Convidar para o time
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
            <div>
              <Selecao
                aria-label="Papel de quem esta sendo convidado"
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PAPEL[p]}
                  </option>
                ))}
              </Selecao>
              <p className="mt-1 px-1 text-[11px] text-slate-400">{DESCRICAO_PAPEL[papel]}</p>
            </div>
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
                    ? "E-mail enviado (remetente de teste — só chega no e-mail da conta Resend). Link de apoio:"
                    : "E-mail de convite enviado! Link de apoio:"
                  : emailErro
                    ? `Falha ao enviar e-mail: ${emailErro}`
                    : "RESEND_API_KEY não configurada — envie este link manualmente:"}
              </p>
              {!emailEnviado && (
                <p className="text-amber-700 dark:text-amber-400 mb-2">
                  Configure as variáveis RESEND_API_KEY e RESEND_FROM_EMAIL (com domínio verificado no Resend) nas variáveis de ambiente do Vercel.
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
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                        {ROTULO_PAPEL[c.role || ""] || c.role}
                      </span>
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 content-start">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-xs font-bold uppercase text-slate-400">Time ativo</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">{ativos.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {vendedoresAtivos.length} {vendedoresAtivos.length === 1 ? "vendedor" : "vendedores"}
              {ativos.length - vendedoresAtivos.length > 0 && ` · ${ativos.length - vendedoresAtivos.length} SDR`}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-xs font-bold uppercase text-slate-400">Meta mensal somada</p>
            <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">{formatarMoeda(totalMeta)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <p className="text-xs font-bold uppercase text-slate-400">Negócios ativos</p>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{negocios.filter((n) => !n.ganho).length}</p>
          </div>

          {ativos.map((v) => {
            const deles = negocios.filter((n) => n.responsavel_id === v.id);
            const valorAtivo = deles.reduce((acc, n) => acc + (n.valor || 0), 0);
            return (
              <div key={v.id} className="col-span-full sm:col-span-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-extrabold shrink-0">
                    {iniciais(v.nome)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{v.nome}</p>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {ROTULO_PAPEL[v.role || ""] || v.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{v.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Meta e valor em carteira sao medida de vendedor. Para o
                      SDR nao querem dizer nada: ele entrega reuniao, nao
                      receita — mostrar R$ 0,00 ao lado do nome dele seria so
                      um numero errado. */}
                  {ehDoTime(v) ? (
                    <>
                      <MetaMensal usuario={v} />
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">{formatarMoeda(valorAtivo)}</p>
                        <p className="text-[11px] text-slate-400">{deles.length} negócios</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">{deles.length}</p>
                      <p className="text-[11px] text-slate-400">leads em mãos</p>
                    </div>
                  )}
                  <button
                    onClick={() => setDesativando(v)}
                    title={`Remover ${ROTULO_PAPEL[v.role || ""] || "membro"} do time`}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {inativos.length > 0 && (
            <div className="col-span-full">
              <p className="text-[11px] font-bold uppercase text-slate-400 mb-2 mt-2">Removidos do time ({inativos.length})</p>
              <div className="space-y-2">
                {inativos.map((v) => (
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
                    <button
                      onClick={() => void definirAtivo(v, true)}
                      title="Reativar acesso"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg"
                    >
                      <UserCheck className="h-3.5 w-3.5" /> Reativar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Confirmar
        aberto={!!desativando}
        titulo="Remover do time"
        rotuloConfirmar="Remover do time"
        aoFechar={() => setDesativando(null)}
        aoConfirmar={() => definirAtivo(desativando!, false)}
        descricao={
          <>
            <strong className="font-bold text-slate-900 dark:text-slate-100">{desativando?.nome}</strong>{" "}
            deixa de acessar o sistema e some das listas de quem pode receber lead. Os negócios já
            atribuídos continuam com essa pessoa — reatribua antes se for o caso.
          </>
        }
      />
    </div>
  );
}

/** Edicao da meta mensal na propria linha da pessoa. */
function MetaMensal({ usuario }: { usuario: Usuario }) {
  const [meta, setMeta] = useState(String(usuario.meta_mensal ?? 0));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setMeta(String(usuario.meta_mensal ?? 0)), [usuario.meta_mensal]);

  const alterada = Number(meta) !== (usuario.meta_mensal ?? 0);

  const salvar = async () => {
    const valor = Number(meta);
    if (!Number.isFinite(valor) || valor < 0) {
      setErro("Valor inválido");
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await createClient()
      .from("usuarios")
      .update({ meta_mensal: valor })
      .eq("id", usuario.id);
    setSalvando(false);
    if (error) setErro(error.message);
  };

  return (
    <div className="flex items-center gap-1.5">
      <label
        htmlFor={`meta-${usuario.id}`}
        className="text-[11px] font-bold uppercase text-slate-400"
      >
        Meta
      </label>
      <input
        id={`meta-${usuario.id}`}
        type="number"
        min={0}
        step={1000}
        value={meta}
        onChange={(e) => setMeta(e.target.value)}
        className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-900 transition-[border-color] duration-150 ease-out hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      {alterada && (
        <Botao tamanho="sm" variante="primario" carregando={salvando} onClick={salvar}>
          Salvar
        </Botao>
      )}
      {erro && <span className="text-[11px] font-semibold text-rose-600">{erro}</span>}
    </div>
  );
}
