"use client";

import { useState } from "react";
import { Users, BarChart3, Package, UserSquare2 } from "lucide-react";
import type { Convite, EtapaPipeline, NegocioComRelacoes, Plano, Usuario, Contato } from "@/lib/types";
import { VendedoresTab } from "@/components/admin/VendedoresTab";
import { FunilTab } from "@/components/admin/FunilTab";
import { PlanosTab } from "@/components/admin/PlanosTab";
import { LeadsTab } from "@/components/admin/LeadsTab";

export function AdminClient({
  usuarios,
  convites,
  planos,
  negocios,
  etapas,
  contatosSemDono,
  contatosComDono,
  usuarioAtual,
}: {
  usuarios: Usuario[];
  convites: Convite[];
  planos: Plano[];
  negocios: NegocioComRelacoes[];
  etapas: EtapaPipeline[];
  contatosSemDono: Contato[];
  contatosComDono?: (Contato & { responsavel: { id: string; nome: string } | null })[];
  usuarioAtual: Usuario;
}) {
  const [aba, setAba] = useState<"vendedores" | "funil" | "planos" | "leads">("vendedores");
  const vendedores = usuarios.filter((u) => u.role === "vendedor");
  const vendedoresAtivos = vendedores.filter((u) => u.ativo !== false);

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <span className="px-3 py-1 text-xs font-bold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
            Painel de Administracao
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight mt-2">Gestao de Vendedores, Funil, Planos e Leads</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Convide vendedores, acompanhe o funil individual, configure os planos usados nas propostas e distribua os leads importados.
          </p>
        </div>

        <div className="flex flex-wrap items-center bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700/60 shrink-0">
          {[
            { id: "vendedores", label: `Vendedores (${vendedoresAtivos.length})`, icon: Users },
            { id: "funil", label: "Funil do Vendedor", icon: BarChart3 },
            { id: "planos", label: `Planos (${planos.length})`, icon: Package },
            { id: "leads", label: `Leads (${contatosSemDono.length} sem dono)`, icon: UserSquare2 },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setAba(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                  aba === t.id ? "bg-indigo-600 text-white shadow-md" : "text-slate-300 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {aba === "vendedores" && <VendedoresTab vendedores={vendedores} convites={convites} negocios={negocios} usuarioAtual={usuarioAtual} />}
      {aba === "funil" && <FunilTab vendedores={vendedoresAtivos} negocios={negocios} etapas={etapas} />}
      {aba === "planos" && <PlanosTab planosIniciais={planos} tenantId={usuarioAtual.tenant_id} />}
      {aba === "leads" && <LeadsTab vendedores={vendedoresAtivos} contatosSemDonoIniciais={contatosSemDono} contatosComDonoIniciais={contatosComDono || []} usuarioAtual={usuarioAtual} />}
    </div>
  );
}
