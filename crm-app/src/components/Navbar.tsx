"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import type { Usuario, Notificacao } from "@/lib/types";
import { iniciais } from "@/lib/types";
import { formatarDataHora } from "@/lib/atividades";
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
  CalendarClock,
  Radar,
  Inbox,
} from "lucide-react";

type UsuarioComTenant = Usuario & { tenant: { nome: string; cor_primaria: string | null } | null };

export function Navbar({ usuario }: { usuario: UsuarioComTenant }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);

  const carregarNotificacoes = useCallback(async () => {
    const { data } = await createClient()
      .from("notificacoes")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(30);
    if (data) setNotificacoes(data);
  }, []);

  // O sino é o canal dos lembretes de agendamento: precisa chegar sozinho.
  useSincronizacao(carregarNotificacoes, {
    canal: "notificacoes",
    tabelas: [{ tabela: "notificacoes", filtro: `usuario_id=eq.${usuario.id}` }],
    intervaloMs: 30_000,
    carregarAoMontar: true,
  });

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  // A quarentena precisa de um NÚMERO na barra, e não só de uma página: uma
  // mensagem que cai lá é invisível até alguém ir olhar, e ninguém vai olhar
  // uma tela que nunca pede nada. `head: true` traz só a contagem — a barra do
  // topo está em toda página e não pode puxar 200 linhas para mostrar "3".
  const [semNegocio, setSemNegocio] = useState(0);
  const carregarQuarentena = useCallback(async () => {
    const { count } = await createClient()
      .from("mensagens_sem_negocio")
      .select("id", { count: "exact", head: true })
      .is("resolvido_negocio_id", null);
    setSemNegocio(count ?? 0);
  }, []);

  useSincronizacao(carregarQuarentena, {
    canal: "quarentena-contador",
    tabelas: [{ tabela: "mensagens_sem_negocio" }],
    intervaloMs: 60_000,
    carregarAoMontar: true,
  });

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

  const links: { href: string; label: string; icon: typeof Kanban; contador?: number }[] = [
    { href: "/", label: "Pipeline Kanban", icon: Kanban },
  ];
  // O board do SDR so aparece para quem opera ele. Um vendedor que abrisse
  // /sdr veria um board vazio, porque a RLS nao lhe mostra lead nenhum de la.
  if (usuario.role === "sdr" || usuario.role === "admin") {
    links.push({ href: "/sdr", label: "Prospecção", icon: Radar });
  }
  links.push({ href: "/agenda", label: "Agenda", icon: CalendarClock });
  // A quarentena so entra no menu QUANDO TEM ALGO nela.
  //
  // Ela cai aqui quando um contato tem mais de um negocio aberto e a resposta
  // dele nao decide sozinha em qual card entrar — e medido no banco: ha ZERO
  // contatos nessa situacao, e a tabela nunca teve uma linha. Ou seja, a aba
  // estava ocupando um lugar fixo na barra para mostrar "0" todo dia.
  //
  // A ROTA, A TELA E A GRAVACAO CONTINUAM. Sao coisas diferentes: o dia em que
  // a condicao acontecer, a mensagem precisa estar guardada e a aba reaparece
  // sozinha. Apagar a gravacao junto (`lib/entrada/gravar.ts`, chamada pela
  // sincronizacao do Gmail e pelo webhook do WhatsApp) transformaria uma
  // resposta de cliente em descarte silencioso.
  if (semNegocio > 0) {
    links.push({
      href: "/nao-identificadas",
      label: "Não identificadas",
      icon: Inbox,
      contador: semNegocio,
    });
  }
  links.push(
    { href: "/lista", label: "Lista de Leads", icon: ListFilter },
    { href: "/assinaturas", label: "Assinaturas", icon: FileSignature },
  );
  if (usuario.role === "admin") {
    links.push({ href: "/admin", label: "Painel Admin", icon: ShieldCheck });
  }

  return (
    <header className="bg-superficie border-b border-fio sticky top-0 z-30 shadow-cartao">
      <div className="max-w-pagina mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-acento-solido p-0.5 flex items-center justify-center">
            {/* 10px NAO e valor arbitrario solto: e o raio CONCENTRICO do
                quadrado interno — 12px do `rounded-xl` de fora menos os 2px do
                `p-0.5`. Usar `rounded-lg` (8px) aqui abriria uma meia-lua de
                folga em cada canto. */}
            <div className="h-full w-full bg-superficie rounded-[10px] flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-acento" />
            </div>
          </div>
          <div>
            <h1 className="text-corpo-lg font-semibold text-tinta tracking-tight leading-tight">
              CRM {usuario.tenant?.nome ?? ""}
            </h1>
            <p className="text-rotulo text-tinta-suave">Funil comercial</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center bg-recuo p-1 rounded-xl gap-1">
          {links.map((l) => {
            const Icon = l.icon;
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 px-3 py-1.5 text-rotulo font-medium rounded-lg transition-colors duration-150 ease-out ${
                  active
                    ? "bg-superficie text-acento shadow-cartao"
                    : "text-tinta-suave hover:text-tinta"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{l.label}</span>
                {/* Só aparece quando há o que decidir. Um "0" permanente vira
                    ruído e a pessoa para de ver o número quando ele importa. */}
                {l.contador ? (
                  <span className="h-5 min-w-5 px-1 rounded-full bg-acento-solido text-acento-tinta text-rotulo font-medium flex items-center justify-center tabular">
                    {l.contador}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={marcarLidas}
              className="foco relative p-2 text-tinta-fraca hover:text-acento hover:bg-recuo rounded-xl transition-colors"
            >
              <Bell className="h-4.5 w-4.5" />
              {naoLidas > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 rounded-full bg-risco-solido text-risco-tinta text-rotulo font-medium flex items-center justify-center">
                  {naoLidas}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-superficie border border-fio rounded-2xl shadow-flutuante z-40">
                <div className="p-3 border-b border-fio flex items-center justify-between gap-2">
                  <span className="text-rotulo font-medium text-tinta-suave">Notificações</span>
                  {notificacoes.length > 0 && (
                    <button
                      onClick={limparNotificacoes}
                      disabled={limpando}
                      className="foco flex items-center gap-1 text-rotulo font-medium text-tinta-fraca hover:text-risco disabled:opacity-50"
                    >
                      {limpando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Limpar
                    </button>
                  )}
                </div>
                {notificacoes.length === 0 ? (
                  <p className="p-4 text-rotulo text-tinta-fraca text-center">Nenhuma notificação ainda.</p>
                ) : (
                  notificacoes.map((n) => (
                    <Link
                      key={n.id}
                      href={n.link || "#"}
                      onClick={() => setShowNotifs(false)}
                      className="block p-3 border-b border-fio hover:bg-recuo text-rotulo"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-semibold ${n.lida ? "text-tinta-suave" : "text-tinta"}`}>
                          {n.titulo}
                        </p>
                        {!n.lida && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-acento shrink-0" />}
                      </div>
                      {n.corpo && <p className="text-tinta-suave mt-0.5">{n.corpo}</p>}
                      <p className="text-rotulo text-tinta-fraca mt-1">{formatarDataHora(n.criado_em)}</p>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-fio">
            <div className="h-8 w-8 rounded-full bg-acento-fraco text-acento flex items-center justify-center text-rotulo font-semibold">
              {iniciais(usuario.nome)}
            </div>
            <div className="hidden sm:block">
              <p className="text-rotulo font-medium text-tinta leading-tight">{usuario.nome}</p>
              <p className="text-rotulo text-tinta-fraca capitalize">{usuario.role}</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="Sair"
              className="foco p-2 text-tinta-fraca hover:text-risco hover:bg-recuo rounded-xl transition-colors"
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
              className={`flex items-center gap-1.5 px-3 py-1.5 text-rotulo font-medium rounded-lg whitespace-nowrap ${
                active ? "bg-acento-solido text-acento-tinta" : "bg-recuo text-tinta-suave"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{l.label}</span>
              {l.contador ? (
                <span
                  className={`h-5 min-w-5 px-1 rounded-full text-rotulo font-medium flex items-center justify-center tabular ${
                    active ? "bg-superficie text-acento" : "bg-acento-solido text-acento-tinta"
                  }`}
                >
                  {l.contador}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
