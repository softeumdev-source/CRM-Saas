"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { assinarRealtime } from "@/lib/supabase/realtime";
import type { Usuario, Notificacao } from "@/lib/types";
import { iniciais } from "@/lib/types";
import {
  Kanban,
  ListFilter,
  ShieldCheck,
  FileSignature,
  TrendingUp,
  Bell,
  LogOut,
  Loader2,
  Trash2,
} from "lucide-react";

type UsuarioComTenant = Usuario & { tenant: { nome: string; cor_primaria: string | null } | null };

export function Navbar({ usuario }: { usuario: UsuarioComTenant }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function carregar() {
      const { data } = await supabase
        .from("notificacoes")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(20);
      if (active && data) setNotificacoes(data);
    }
    carregar();

    const limpar = assinarRealtime("notificacoes-realtime", (canal) =>
      canal.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes", filter: `usuario_id=eq.${usuario.id}` },
        (payload) => setNotificacoes((prev) => [payload.new as Notificacao, ...prev])
      )
    );

    return () => {
      active = false;
      limpar();
    };
  }, [usuario.id]);

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  const marcarLidas = async () => {
    setShowNotifs((v) => !v);
    if (naoLidas === 0) return;
    const supabase = createClient();
    const ids = notificacoes.filter((n) => !n.lida).map((n) => n.id);
    await supabase.from("notificacoes").update({ lida: true }).in("id", ids);
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  const [limpando, setLimpando] = useState(false);
  const limparNotificacoes = async () => {
    if (notificacoes.length === 0 || limpando) return;
    setLimpando(true);
    const supabase = createClient();
    const ids = notificacoes.map((n) => n.id);
    const anteriores = notificacoes;
    setNotificacoes([]);
    const { error } = await supabase.from("notificacoes").delete().in("id", ids);
    if (error) setNotificacoes(anteriores);
    setLimpando(false);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const links = [
    { href: "/", label: "Pipeline Kanban", icon: Kanban },
    { href: "/lista", label: "Lista de Leads", icon: ListFilter },
    { href: "/assinaturas", label: "Assinaturas", icon: FileSignature },
  ];
  if (usuario.role === "admin") {
    links.push({ href: "/admin", label: "Painel Admin", icon: ShieldCheck });
  }

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 p-0.5 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <div className="h-full w-full bg-white dark:bg-slate-900 rounded-[10px] flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
              CRM {usuario.tenant?.nome ?? ""}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Funil comercial</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1">
          {links.map((l) => {
            const Icon = l.icon;
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  active
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={marcarLidas}
              className="relative p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Bell className="h-4.5 w-4.5" />
              {naoLidas > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {naoLidas}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-40">
                <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Notificações</span>
                  {notificacoes.length > 0 && (
                    <button
                      onClick={limparNotificacoes}
                      disabled={limpando}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 disabled:opacity-50"
                    >
                      {limpando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Limpar
                    </button>
                  )}
                </div>
                {notificacoes.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 text-center">Nenhuma notificação ainda.</p>
                ) : (
                  notificacoes.map((n) => (
                    <Link
                      key={n.id}
                      href={n.link || "#"}
                      onClick={() => setShowNotifs(false)}
                      className="block p-3 border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs"
                    >
                      <p className="font-bold text-slate-800 dark:text-slate-200">{n.titulo}</p>
                      {n.corpo && <p className="text-slate-500 dark:text-slate-400 mt-0.5">{n.corpo}</p>}
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-700">
            <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-extrabold">
              {iniciais(usuario.nome)}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">{usuario.nome}</p>
              <p className="text-[10px] text-slate-400 capitalize">{usuario.role}</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="Sair"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
        {links.map((l) => {
          const Icon = l.icon;
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
                active ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{l.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
