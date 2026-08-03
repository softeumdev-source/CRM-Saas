"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Mail, Phone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EtapaPipeline, NegocioComRelacoes, Plano, Usuario } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { VisaoGeralTab } from "@/components/negocio/VisaoGeralTab";
import { CadenciaTab } from "@/components/negocio/CadenciaTab";
import { PropostaTab } from "@/components/negocio/PropostaTab";
import { CopilotoTab } from "@/components/negocio/CopilotoTab";

type AtividadeComUsuario = any;
type PropostaComRelacoes = any;

export function NegocioDetailClient({
  negocioInicial,
  etapas,
  vendedores,
  planos,
  atividadesIniciais,
  propostasIniciais,
  usuarioAtual,
}: {
  negocioInicial: NegocioComRelacoes;
  etapas: EtapaPipeline[];
  vendedores: Usuario[];
  planos: Plano[];
  atividadesIniciais: AtividadeComUsuario[];
  propostasIniciais: PropostaComRelacoes[];
  usuarioAtual: Usuario;
}) {
  const router = useRouter();
  const [negocio, setNegocio] = useState(negocioInicial);
  const [aba, setAba] = useState<"geral" | "cadencia" | "proposta" | "ia">("geral");

  const atualizarNegocio = async (campos: Partial<NegocioComRelacoes>) => {
    setNegocio((prev) => ({ ...prev, ...campos }));
    const supabase = createClient();
    const { etapa, contato, responsavel, ...camposDb } = campos as any;
    await supabase
      .from("negocios")
      .update({ ...camposDb, atualizado_em: new Date().toISOString() })
      .eq("id", negocio.id);
  };

  const handleExcluir = async () => {
    const etapaPerdido = etapas.find((e) => e.nome.trim().toLowerCase() === "perdido");
    if (!etapaPerdido) return;
    if (!confirm("Este negocio sera movido para a etapa Perdido. Deseja continuar?")) return;
    const motivo = window.prompt("Motivo da perda (opcional):") || null;
    const supabase = createClient();
    await supabase
      .from("negocios")
      .update({ etapa_id: etapaPerdido.id, ganho: false, motivo_perda: motivo, probabilidade: 0, atualizado_em: new Date().toISOString() })
      .eq("id", negocio.id);
    router.push("/");
    router.refresh();
  };

  const etapaAtual = etapas.find((e) => e.id === negocio.etapa_id);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao pipeline
      </Link>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600" />
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {negocio.contato?.empresa || negocio.contato?.nome}
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{negocio.titulo}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
              {negocio.contato?.email && (
                <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{negocio.contato.email}</span>
              )}
              {negocio.contato?.telefone && (
                <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{negocio.contato.telefone}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExcluir}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
              title="Marcar como perdido"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Etapa</p>
            <select
              value={negocio.etapa_id || ""}
              onChange={(e) => {
                const nova = etapas.find((et) => et.id === e.target.value);
                atualizarNegocio({ etapa_id: e.target.value, etapa: nova, probabilidade: nova?.probabilidade ?? negocio.probabilidade });
              }}
              className="w-full mt-1 text-sm font-bold bg-transparent focus:outline-hidden"
            >
              {etapas.map((et) => (
                <option key={et.id} value={et.id}>{et.nome}</option>
              ))}
            </select>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Valor</p>
            <input
              type="number"
              defaultValue={negocio.valor ?? 0}
              onBlur={(e) => atualizarNegocio({ valor: parseFloat(e.target.value) || 0 })}
              className="w-full mt-1 text-sm font-extrabold text-indigo-600 bg-transparent focus:outline-hidden"
            />
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Vendedor responsavel</p>
            <select
              value={negocio.responsavel_id || ""}
              onChange={(e) => {
                const resp = vendedores.find((v) => v.id === e.target.value) || null;
                atualizarNegocio({ responsavel_id: e.target.value || null, responsavel: resp });
              }}
              className="w-full mt-1 text-sm font-bold bg-transparent focus:outline-hidden"
            >
              <option value="">Sem dono (pool)</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1 w-fit">
        {[
          { id: "geral", label: "Visao Geral" },
          { id: "cadencia", label: "Cadencia" },
          { id: "proposta", label: "Proposta & Assinatura" },
          { id: "ia", label: "Mensagens" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id as any)}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              aba === t.id ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aba === "geral" && (
        <VisaoGeralTab negocio={negocio} onAtualizarContato={(campos) => setNegocio((prev) => ({ ...prev, contato: { ...prev.contato!, ...campos } }))} />
      )}
      {aba === "cadencia" && (
        <CadenciaTab negocioId={negocio.id} atividadesIniciais={atividadesIniciais} usuarioAtual={usuarioAtual} />
      )}
      {aba === "proposta" && (
        <PropostaTab negocio={negocio} planos={planos} propostasIniciais={propostasIniciais} />
      )}
      {aba === "ia" && <CopilotoTab negocio={negocio} usuarioAtual={usuarioAtual} />}
    </div>
  );
}
