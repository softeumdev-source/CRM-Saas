"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  CalendarClock,
  ChartNoAxesColumnDecreasing,
  FileSignature,
  Kanban,
  ListFilter,
  Loader2,
  LogOut,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { iniciais, type Usuario } from "@/lib/types";
import { Notificacoes } from "./Notificacoes";

/**
 * O trilho de navegacao do estilo Papel: a unica superficie escura do app,
 * a esquerda no desktop e no topo no celular.
 *
 * Substitui o Navbar, entao carrega tudo o que ele carregava alem dos links —
 * sino com assinatura realtime propria (extraido em Notificacoes), chip de
 * usuario e logout.
 *
 * As duas formas (trilho e topo) compartilham o mesmo ItemNav e a mesma regra
 * de ativo. No Navbar antigo essa regra estava escrita duas vezes, e as duas
 * copias ja tinham divergido no estilo.
 */

type UsuarioComTenant = Usuario & { tenant: { nome: string; cor_primaria: string | null } | null };

type Grupo = { titulo: string; itens: { href: string; label: string; icone: LucideIcon }[] };

function grupos(role: string): Grupo[] {
  const lista: Grupo[] = [
    {
      titulo: "Comercial",
      itens: [
        { href: "/", label: "Pipeline", icone: Kanban },
        { href: "/agenda", label: "Agenda", icone: CalendarClock },
        { href: "/lista", label: "Lista", icone: ListFilter },
        { href: "/assinaturas", label: "Assinaturas", icone: FileSignature },
      ],
    },
  ];
  if (role === "admin") {
    lista.push({
      titulo: "Gestão",
      itens: [{ href: "/admin", label: "Administração", icone: ShieldCheck }],
    });
  }
  return lista;
}

/** A raiz so casa exata; as outras casam por prefixo (ex.: /negocios/[id]). */
function ehAtivo(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Exportado para a navegacao do SDR reusar o mesmo item.
 * So pode ser montado de dentro de um modulo "use client": `icone` e uma
 * funcao, e funcao nao atravessa a fronteira servidor -> cliente.
 */
export function ItemNav({
  href,
  label,
  icone: Icone,
  ativo,
  forma,
  aoNavegar,
}: {
  href: string;
  label: string;
  icone: LucideIcon;
  ativo: boolean;
  forma: "trilho" | "topo";
  aoNavegar?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={aoNavegar}
      aria-current={ativo ? "page" : undefined}
      className={clsx(
        "flex items-center gap-2.5 rounded-lg transition-colors duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400",
        forma === "trilho" ? "px-2.5 py-2.5" : "shrink-0 px-3 py-2",
        ativo
          ? "bg-trilho-alto text-stone-50"
          : "text-stone-300 hover:bg-trilho-alto hover:text-stone-50",
      )}
    >
      <Icone
        className={clsx("h-4 w-4 shrink-0", ativo ? "text-indigo-300" : "text-stone-500")}
        aria-hidden
      />
      <span className={clsx("text-corpo-lg whitespace-nowrap", ativo ? "font-medium" : "font-normal")}>
        {label}
      </span>
    </Link>
  );
}

function Marca({ tenant }: { tenant: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-acento">
        <ChartNoAxesColumnDecreasing className="h-4 w-4 text-white" aria-hidden />
      </div>
      <span className="truncate font-serif text-[19px] leading-none text-stone-50">{tenant}</span>
    </div>
  );
}

function Chip({
  usuario,
  saindo,
  aoSair,
}: {
  usuario: UsuarioComTenant;
  saindo: boolean;
  aoSair: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-trilho-alto px-2.5 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-700 text-[10.5px] font-semibold text-stone-200">
        {iniciais(usuario.nome)}
      </div>
      {/* So o primeiro nome: com o botao de sair ao lado, sobram ~100px e o
          nome completo virava "William Sou...". O completo fica no title. */}
      <div className="flex min-w-0 flex-col" title={usuario.nome}>
        <span className="truncate text-corpo font-medium text-stone-50">
          {usuario.nome.split(" ")[0]}
        </span>
        <span className="truncate text-corpo capitalize text-stone-400">{usuario.role}</span>
      </div>
      <button
        type="button"
        onClick={aoSair}
        disabled={saindo}
        title="Sair"
        aria-label="Sair"
        className="ml-auto shrink-0 rounded-lg p-1.5 text-stone-500 transition-colors duration-150 ease-out hover:bg-stone-700 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:opacity-50"
      >
        {saindo ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <LogOut className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

export function BarraLateral({ usuario }: { usuario: UsuarioComTenant }) {
  const pathname = usePathname();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  const secoes = grupos(usuario.role);
  const tenant = usuario.tenant?.nome ?? "CRM";

  const sair = async () => {
    setSaindo(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      {/* Desktop: trilho fixo. z-cabecalho para o painel do sino passar por
          cima do conteudo (ele vem depois no DOM), e abaixo do modal (50). */}
      <aside className="relative z-30 hidden w-50 shrink-0 flex-col gap-6 bg-trilho px-3 py-5 md:flex">
        <div className="flex items-center justify-between gap-2 pl-2">
          <Marca tenant={tenant} />
          <Notificacoes usuarioId={usuario.id} alinharPor="lateral" />
        </div>

        {/* min-h-0 + overflow: em tela baixa a navegacao rola por dentro sem
            empurrar o chip do usuario para fora. */}
        <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
          {secoes.map((g) => (
            <div key={g.titulo} className="flex flex-col gap-0.5">
              <span className="text-rotulo px-2.5 pb-2 uppercase text-stone-600">{g.titulo}</span>
              {g.itens.map((i) => (
                <ItemNav
                  key={i.href}
                  {...i}
                  forma="trilho"
                  ativo={ehAtivo(i.href, pathname)}
                />
              ))}
            </div>
          ))}
        </nav>

        <Chip usuario={usuario} saindo={saindo} aoSair={sair} />
      </aside>

      {/* Celular: o mesmo trilho deitado no topo. */}
      <header className="relative z-30 flex shrink-0 flex-col gap-2 bg-trilho px-4 py-3 md:hidden">
        <div className="flex items-center gap-3">
          <Marca tenant={tenant} />
          <div className="ml-auto flex items-center gap-2">
            <Notificacoes usuarioId={usuario.id} />
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-700 text-[10.5px] font-semibold text-stone-200">
              {iniciais(usuario.nome)}
            </div>
            <button
              type="button"
              onClick={sair}
              disabled={saindo}
              title="Sair"
              aria-label="Sair"
              className="rounded-lg p-2 text-stone-400 transition-colors duration-150 ease-out hover:bg-trilho-alto hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:opacity-50"
            >
              {saindo ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <LogOut className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>

        <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
          {secoes.flatMap((g) =>
            g.itens.map((i) => (
              <ItemNav key={i.href} {...i} forma="topo" ativo={ehAtivo(i.href, pathname)} />
            )),
          )}
        </nav>
      </header>
    </>
  );
}
