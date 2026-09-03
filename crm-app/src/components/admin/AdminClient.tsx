"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, BarChart3, Package, UserSquare2, LineChart, BadgePercent, Send, Plug } from "lucide-react";
import { assinarRealtime } from "@/lib/supabase/realtime";
import type { Convite, EtapaPipeline, NegocioComRelacoes, Plano, Usuario, Contato } from "@/lib/types";
import { ehDoTime, operaNegocios } from "@/lib/types";
import { VendedoresTab } from "@/components/admin/VendedoresTab";
import { FunilTab } from "@/components/admin/FunilTab";
import { PlanosTab } from "@/components/admin/PlanosTab";
import { LeadsTab } from "@/components/admin/LeadsTab";
import { DesempenhoTab } from "@/components/admin/DesempenhoTab";
import { DescontosTab } from "@/components/admin/DescontosTab";
import { CadenciasTab } from "@/components/admin/CadenciasTab";
import { IntegracoesTab } from "@/components/admin/IntegracoesTab";

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
  solicitacoesDesconto?: any[];
  usuarioAtual: Usuario;
}) {
  const [aba, setAba] = useState<"desempenho" | "vendedores" | "funil" | "planos" | "leads" | "descontos" | "cadencias" | "integracoes">("desempenho");
  const router = useRouter();
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
        .on("postgres_changes", { event: "*", schema: "public", table: "etapas_pipeline" }, agendarRefresh)
    );
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      limpar();
    };
  }, [router]);

  // Era `u.role === "vendedor"` cravado: qualquer papel novo ficava invisivel
  // no painel inteiro — inclusive nas listas de quem pode receber lead.
  //
  // Duas listas, porque sao duas perguntas diferentes: quem e MEDIDO no funil
  // de vendas (so vendedor) e quem faz parte do TIME e precisa ser gerido (o
  // SDR entra aqui, senao ele nao aparece no painel nem pode ser desativado).
  const vendedores = usuarios.filter(ehDoTime);
  const vendedoresAtivos = vendedores.filter((u) => u.ativo !== false);
  const membros = usuarios.filter(operaNegocios);
  const membrosAtivos = membros.filter((u) => u.ativo !== false);
  const descontosPendentes = (solicitacoesDesconto || []).filter((s) => s.status === "pendente").length;

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-superficie rounded-2xl p-5 border border-fio shadow-cartao flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <span className="px-3 py-1 text-rotulo font-medium bg-acento/20 text-acento rounded-full border border-acento/30">
            Painel de Administracao
          </span>
          <h2 className="text-display font-medium tracking-tight mt-2">Gestao de Vendedores, Funil, Planos e Leads</h2>
          <p className="text-rotulo text-tinta-fraca mt-1 max-w-2xl">
            Convide vendedores, acompanhe o funil individual, configure os planos usados nas propostas e distribua os leads importados.
          </p>
        </div>

        <div className="flex flex-wrap items-center bg-recuo/80 p-1.5 rounded-2xl border border-fio/60 shrink-0">
          {[
            { id: "desempenho", label: "Desempenho", icon: LineChart },
            { id: "vendedores", label: `Time (${membrosAtivos.length})`, icon: Users },
            { id: "funil", label: "Funil do Vendedor", icon: BarChart3 },
            { id: "planos", label: `Planos (${planos.length})`, icon: Package },
            { id: "leads", label: `Leads (${contatosSemDono.length} sem dono)`, icon: UserSquare2 },
            { id: "descontos", label: descontosPendentes > 0 ? `Descontos (${descontosPendentes})` : "Descontos", icon: BadgePercent },
            { id: "cadencias", label: "Cadências", icon: Send },
            { id: "integracoes", label: "Integrações", icon: Plug },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setAba(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2 text-rotulo font-medium rounded-xl transition-colors duration-150 ease-out ${
                  aba === t.id ? "bg-acento-solido text-acento-tinta shadow-md" : "text-tinta-fraca hover:text-tinta"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {aba === "desempenho" && <DesempenhoTab vendedores={vendedoresAtivos} negocios={negocios} etapas={etapas} historicoEtapas={historicoEtapas || []} />}
      {aba === "vendedores" && <VendedoresTab membros={membros} convites={convites} negocios={negocios} usuarioAtual={usuarioAtual} />}
      {aba === "funil" && <FunilTab vendedores={vendedoresAtivos} negocios={negocios} etapas={etapas} />}
      {aba === "planos" && <PlanosTab planosIniciais={planos} tenantId={usuarioAtual.tenant_id} />}
      {aba === "cadencias" && <CadenciasTab />}
      {aba === "integracoes" && <IntegracoesTab usuarioAtual={usuarioAtual} />}
      {aba === "leads" && <LeadsTab vendedores={vendedoresAtivos} contatosSemDonoIniciais={contatosSemDono} teto={tetoLeadsSemDono} contatosComDonoIniciais={contatosComDono || []} usuarioAtual={usuarioAtual} />}
      {aba === "descontos" && <DescontosTab solicitacoesIniciais={solicitacoesDesconto || []} />}
    </div>
  );
}
