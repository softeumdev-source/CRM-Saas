"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgePercent, ThumbsUp, ThumbsDown, Clock, CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { assinarRealtime } from "@/lib/supabase/realtime";
import { formatarMoeda } from "@/lib/types";
import { Cartao } from "@/components/ui";

const SELECT =
  "*, negocio:negocios(id, titulo, contato:contatos(nome, empresa)), vendedor:usuarios!solicitacoes_desconto_vendedor_id_fkey(nome), plano:planos(nome)";

function nomeNegocio(s: any): string {
  return s.negocio?.contato?.empresa || s.negocio?.contato?.nome || s.negocio?.titulo || "Negócio";
}

function pctDesconto(s: any): number {
  const base = Number(s.valor_mensal_base) || 0;
  const pedido = Number(s.valor_mensal_solicitado) || 0;
  if (base <= 0) return 0;
  return Math.round(((base - pedido) / base) * 100);
}

export function DescontosTab({ solicitacoesIniciais }: { solicitacoesIniciais: any[] }) {
  const [solicitacoes, setSolicitacoes] = useState<any[]>(solicitacoesIniciais);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const recarregar = () => {
      createClient()
        .from("solicitacoes_desconto")
        .select(SELECT)
        .order("criado_em", { ascending: false })
        .then(({ data }) => data && setSolicitacoes(data));
    };
    return assinarRealtime("descontos-admin", (canal) =>
      canal.on("postgres_changes", { event: "*", schema: "public", table: "solicitacoes_desconto" }, recarregar)
    );
  }, []);

  const ordenadas = useMemo(() => {
    const rank = (st: string) => (st === "pendente" ? 0 : 1);
    return [...solicitacoes].sort((a, b) => {
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
    });
  }, [solicitacoes]);

  const pendentes = solicitacoes.filter((s) => s.status === "pendente").length;

  const decidir = async (id: string, aprovar: boolean) => {
    setDecidindo(id);
    setErro(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("decidir_desconto", {
      p_solicitacao_id: id,
      p_aprovar: aprovar,
      p_resposta: (respostas[id] || "").trim() || null,
    } as any);
    setDecidindo(null);
    if (error) {
      setErro("Falha ao decidir: " + error.message);
      return;
    }
    setSolicitacoes((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    setRespostas((prev) => ({ ...prev, [id]: "" }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BadgePercent className="h-5 w-5 text-acento" />
          <h3 className="text-titulo font-medium text-tinta">Aprovação de descontos</h3>
        </div>
        <span className="px-3 py-1 text-rotulo font-medium rounded-full bg-alerta-fraco text-alerta">
          {pendentes} aguardando
        </span>
      </div>

      {erro && <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">{erro}</p>}

      {ordenadas.length === 0 ? (
        <Cartao className="p-10 text-center">
          <BadgePercent className="h-8 w-8 text-tinta-fraca mx-auto mb-2" />
          <p className="text-corpo text-tinta-fraca">Nenhuma solicitação de desconto até agora.</p>
        </Cartao>
      ) : (
        <div className="grid gap-3">
          {ordenadas.map((s) => {
            const pct = pctDesconto(s);
            const pendente = s.status === "pendente";
            return (
              <div
                key={s.id}
                className={`bg-superficie rounded-2xl border p-4 ${
                  pendente ? "border-alerta/40" : "border-fio"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/negocios/${s.negocio?.id}`} className="font-medium text-corpo text-tinta hover:text-acento">
                        {nomeNegocio(s)}
                      </Link>
                      {s.plano?.nome && <span className="text-rotulo text-tinta-fraca">· {s.plano.nome}</span>}
                    </div>
                    <p className="text-rotulo text-tinta-suave mt-0.5">
                      Vendedor: {s.vendedor?.nome || "—"} · {new Date(s.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1 text-rotulo font-medium rounded-full capitalize ${
                      s.status === "aprovado"
                        ? "bg-ok-fraco text-ok"
                        : s.status === "recusado"
                          ? "bg-risco-fraco text-risco"
                          : "bg-alerta-fraco text-alerta"
                    }`}
                  >
                    {s.status === "aprovado" ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.status === "recusado" ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    {s.status}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap text-corpo">
                  <span className="text-tinta-fraca line-through">{formatarMoeda(Number(s.valor_mensal_base))}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-tinta-fraca" />
                  <span className="font-medium text-acento">{formatarMoeda(Number(s.valor_mensal_solicitado))}</span>
                  <span className="text-tinta-suave">/mês</span>
                  {pct > 0 && (
                    <span className="px-2 py-0.5 text-rotulo font-medium rounded-full bg-acento-fraco text-acento">
                      -{pct}%
                    </span>
                  )}
                  {Number(s.valor_setup_solicitado) > 0 && (
                    <span className="text-rotulo text-tinta-suave">· setup {formatarMoeda(Number(s.valor_setup_solicitado))}</span>
                  )}
                </div>

                {s.motivo && (
                  <p className="mt-2 text-rotulo text-tinta-suave bg-recuo rounded-lg px-3 py-2">
                    <span className="font-medium">Motivo:</span> {s.motivo}
                  </p>
                )}

                {pendente ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={respostas[s.id] || ""}
                      onChange={(e) => setRespostas((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      placeholder="Resposta ao vendedor (opcional)"
                      className="w-full px-3 py-2 text-rotulo bg-recuo border border-fio rounded-lg"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decidir(s.id, true)}
                        disabled={decidindo === s.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-rotulo font-medium text-ok-tinta bg-ok-solido hover:bg-ok-solido-hover rounded-lg disabled:opacity-60"
                      >
                        {decidindo === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />} Aprovar
                      </button>
                      <button
                        onClick={() => decidir(s.id, false)}
                        disabled={decidindo === s.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-rotulo font-medium text-risco-tinta bg-risco-solido hover:bg-risco-solido-hover rounded-lg disabled:opacity-60"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" /> Recusar
                      </button>
                    </div>
                  </div>
                ) : (
                  s.resposta_admin && (
                    <p className="mt-2 text-rotulo text-tinta-suave">
                      Resposta: {s.resposta_admin}
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
