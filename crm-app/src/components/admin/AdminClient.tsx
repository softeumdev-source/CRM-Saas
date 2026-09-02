"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { assinarRealtime } from "@/lib/supabase/realtime";
import type {
  AbaAdmin,
  Convite,
  EtapaPipeline,
  NegocioComRelacoes,
  Plano,
  Usuario,
  Contato,
} from "@/lib/types";
import { ehDoTime } from "@/lib/types";
import { VendedoresTab } from "@/components/admin/VendedoresTab";
import { FunilTab } from "@/components/admin/FunilTab";
import { PlanosTab } from "@/components/admin/PlanosTab";
import { LeadsTab } from "@/components/admin/LeadsTab";
import { DesempenhoTab } from "@/components/admin/DesempenhoTab";
import { DescontosTab } from "@/components/admin/DescontosTab";

/**
 * O painel perdeu o hero de gradiente que ocupava a primeira dobra inteira
 * para dizer, em três frases, o que as próprias abas já dizem.
 *
 * O estado da aba passou para a URL (`?aba=`), como já era em /negocios/[id]:
 * dá para mandar o link da aba de descontos para alguém, e o voltar do
 * navegador funciona.
 */
export function AdminClient({
  usuarios,
  convites,
  planos,
  negocios,
  etapas,
  contatosSemDono,
  tetoLeadsSemDono,
  contatosComDono,
  historicoEtapas,
  solicitacoesDesconto,
  usuarioAtual,
  abaInicial = "desempenho",
}: {
  usuarios: Usuario[];
  convites: Convite[];
  planos: Plano[];
  negocios: NegocioComRelacoes[];
  etapas: EtapaPipeline[];
  contatosSemDono: Contato[];
  tetoLeadsSemDono?: number;
  contatosComDono?: (Contato & { responsavel: { id: string; nome: string } | null })[];
  historicoEtapas?: { negocio_id: string; etapa_id: string | null }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitacoesDesconto?: any[];
  usuarioAtual: Usuario;
  abaInicial?: AbaAdmin;
}) {
  const [aba, setAba] = useState<AbaAdmin>(abaInicial);
  const router = useRouter();
  const pathname = usePathname();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Qualquer mudança nas tabelas do painel dispara um refresh do server
  // component (com debounce), que devolve props frescas para todas as abas.
  useEffect(() => {
    const agendarRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 500);
    };
    const limpar = assinarRealtime("admin-realtime", (canal) =>
      canal
        .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, agendarRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "convites" }, agendarRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "planos" }, agendarRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "negocios" }, agendarRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "contatos" }, agendarRefresh)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "etapas_pipeline" },
          agendarRefresh,
        ),
    );
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      limpar();
    };
  }, [router]);

  // replace e não push: trocar de aba não deve encher o histórico do navegador,
  // mas o link precisa refletir onde a pessoa está para poder ser compartilhado.
  const trocarAba = useCallback(
    (nova: AbaAdmin) => {
      setAba(nova);
      // Sem useSearchParams de proposito: o hook obriga a envolver a arvore num
      // limite de Suspense (o build falha sem ele) e a unica coisa que ele traria
      // aqui e a preservacao de outros parametros — que esta URL nao tem.
      router.replace(`${pathname}?aba=${nova}`, { scroll: false });
    },
    [pathname, router],
  );

  const time = usuarios.filter(ehDoTime);
  const timeAtivo = time.filter((u) => u.ativo !== false);
  const descontosPendentes = (solicitacoesDesconto || []).filter(
    (s) => s.status === "pendente",
  ).length;

  const abas: { id: AbaAdmin; label: string; contagem?: number }[] = [
    { id: "desempenho", label: "Desempenho" },
    { id: "vendedores", label: "Time", contagem: timeAtivo.length },
    { id: "funil", label: "Funil" },
    { id: "planos", label: "Planos", contagem: planos.length },
    { id: "leads", label: "Leads", contagem: contatosSemDono.length },
    { id: "descontos", label: "Descontos", contagem: descontosPendentes || undefined },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-serif text-display text-tinta">Administração</h1>
        <p className="text-corpo-lg tabular-nums text-tinta-suave">
          {timeAtivo.length} {timeAtivo.length === 1 ? "pessoa no time" : "pessoas no time"}
          {" · "}
          {contatosSemDono.length}{" "}
          {contatosSemDono.length === 1 ? "lead sem dono" : "leads sem dono"}
          {descontosPendentes > 0 && (
            <span className="text-amber-700">
              {" · "}
              {descontosPendentes}{" "}
              {descontosPendentes === 1 ? "desconto aguardando" : "descontos aguardando"}
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-7 overflow-x-auto border-b border-fio">
        {abas.map((t) => {
          const ativo = aba === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => trocarAba(t.id)}
              aria-current={ativo ? "page" : undefined}
              className={clsx(
                "text-corpo-lg -mb-px flex items-center gap-1.5 border-b-[1.5px] py-3.5 whitespace-nowrap",
                "transition-[color,border-color] duration-150 ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
                ativo
                  ? "border-tinta font-medium text-tinta"
                  : "border-transparent text-tinta-suave hover:text-tinta",
              )}
            >
              {t.label}
              {t.contagem !== undefined && (
                <span
                  className={clsx(
                    "text-corpo tabular-nums",
                    t.id === "descontos" ? "text-amber-700" : "text-tinta-fraca",
                  )}
                >
                  {t.contagem}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {aba === "desempenho" && (
        <DesempenhoTab
          vendedores={timeAtivo}
          negocios={negocios}
          etapas={etapas}
          historicoEtapas={historicoEtapas || []}
        />
      )}
      {aba === "vendedores" && (
        <VendedoresTab
          vendedores={time}
          convites={convites}
          negocios={negocios}
          usuarioAtual={usuarioAtual}
        />
      )}
      {aba === "funil" && <FunilTab vendedores={timeAtivo} negocios={negocios} etapas={etapas} />}
      {aba === "planos" && <PlanosTab planosIniciais={planos} tenantId={usuarioAtual.tenant_id} />}
      {aba === "leads" && (
        <LeadsTab
          vendedores={timeAtivo}
          contatosSemDonoIniciais={contatosSemDono}
          teto={tetoLeadsSemDono}
          contatosComDonoIniciais={contatosComDono || []}
          usuarioAtual={usuarioAtual}
        />
      )}
      {aba === "descontos" && <DescontosTab solicitacoesIniciais={solicitacoesDesconto || []} />}
    </div>
  );
}
