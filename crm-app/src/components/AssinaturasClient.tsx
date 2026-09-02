"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Eye, FileSignature, Search } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { assinarRealtime } from "@/lib/supabase/realtime";
import { abrirPdf } from "@/lib/storage";
import { Badge, Button, Cartao, Input, Segmentado, Vazio, type Tom } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Situacao = "todos" | "aguardando" | "concluido" | "cancelado";

/** Os quatro status do envelope reduzidos aos tres que o vendedor distingue. */
function situacaoDoEnvelope(status: string): Exclude<Situacao, "todos"> {
  if (status === "concluido") return "concluido";
  if (status === "cancelado") return "cancelado";
  return "aguardando"; // enviado | aguardando
}

const ROTULO_STATUS: Record<string, { texto: string; tom: Tom }> = {
  concluido: { texto: "Concluído", tom: "sucesso" },
  cancelado: { texto: "Cancelado", tom: "neutro" },
  aguardando: { texto: "Cliente visualizou", tom: "atencao" },
  enviado: { texto: "Enviado", tom: "atencao" },
};

const ROTULO_SIGNATARIO: Record<string, { texto: string; tom: Tom }> = {
  assinado: { texto: "assinou", tom: "sucesso" },
  visualizado: { texto: "visualizou", tom: "info" },
};

export function AssinaturasClient({ envelopesIniciais }: { envelopesIniciais: any[] }) {
  const [envelopes, setEnvelopes] = useState(envelopesIniciais);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("todos");

  useEffect(() => {
    const recarregar = () => {
      createClient()
        .from("envelopes")
        .select(
          "*, signatarios(*), proposta:propostas(*, negocio:negocios(*, contato:contatos(*), responsavel:usuarios(*)))",
        )
        .order("criado_em", { ascending: false })
        .then(({ data }) => data && setEnvelopes(data));
    };
    return assinarRealtime("envelopes-realtime", (canal) =>
      canal
        .on("postgres_changes", { event: "*", schema: "public", table: "envelopes" }, recarregar)
        .on("postgres_changes", { event: "*", schema: "public", table: "signatarios" }, recarregar)
        .on("postgres_changes", { event: "*", schema: "public", table: "propostas" }, recarregar),
    );
  }, []);

  // Busca antes do filtro de situacao, para as contagens nao mudarem ao trocar
  // de aba — mesma regra do kanban.
  const buscados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return envelopes;
    const termoDigitos = termo.replace(/\D/g, "");
    return envelopes.filter((env) => {
      const contato = env.proposta?.negocio?.contato;
      const cnpjDigitos = (contato?.cnpj || "").replace(/\D/g, "");
      if (termoDigitos.length >= 3 && cnpjDigitos.includes(termoDigitos)) return true;
      const campos = [
        contato?.empresa,
        contato?.nome,
        contato?.cnpj,
        contato?.email,
        env.proposta?.numero,
        env.proposta?.negocio?.responsavel?.nome,
        ...(env.signatarios || []).flatMap((s: any) => [s.nome, s.email]),
      ];
      return campos.some((v) => v && String(v).toLowerCase().includes(termo));
    });
  }, [envelopes, busca]);

  const contagens = useMemo(
    () => ({
      todos: buscados.length,
      aguardando: buscados.filter((e) => situacaoDoEnvelope(e.status) === "aguardando").length,
      concluido: buscados.filter((e) => e.status === "concluido").length,
      cancelado: buscados.filter((e) => e.status === "cancelado").length,
    }),
    [buscados],
  );

  const listados =
    situacao === "todos" ? buscados : buscados.filter((e) => situacaoDoEnvelope(e.status) === situacao);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-serif text-display text-tinta">Assinaturas</h1>
        <p className="text-corpo-lg tabular-nums text-tinta-suave">
          {contagens.aguardando} {contagens.aguardando === 1 ? "contrato aguardando" : "contratos aguardando"}
          {" · "}
          {contagens.concluido} {contagens.concluido === 1 ? "concluído" : "concluídos"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          rotulo="Filtrar por situação"
          valor={situacao}
          aoTrocar={setSituacao}
          opcoes={[
            { chave: "todos" as const, label: "Todos", contagem: contagens.todos },
            { chave: "aguardando" as const, label: "Aguardando", contagem: contagens.aguardando },
            { chave: "concluido" as const, label: "Concluídos", contagem: contagens.concluido },
            { chave: "cancelado" as const, label: "Cancelados", contagem: contagens.cancelado },
          ]}
        />
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta-fraca"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar contrato"
            placeholder="Buscar empresa, CNPJ, nº da proposta ou signatário…"
            className="pl-9"
          />
        </div>
      </div>

      <Cartao className="flex flex-col p-0">
        {listados.length === 0 ? (
          <Vazio
            icone={FileSignature}
            titulo={
              envelopes.length === 0
                ? "Nenhum envelope de assinatura ainda"
                : "Nenhum contrato nesta situação"
            }
            descricao={
              envelopes.length === 0
                ? "Os contratos aparecem aqui quando uma proposta é enviada para assinatura."
                : "Tente outro filtro ou limpe a busca."
            }
          />
        ) : (
          listados.map((env, i) => {
            const negocio = env.proposta?.negocio;
            const status = ROTULO_STATUS[env.status] ?? ROTULO_STATUS.enviado;
            const assinados = [
              ["comercial", env.proposta?.pdf_assinado_comercial_path],
              ["técnica", env.proposta?.pdf_assinado_tecnica_path],
            ].filter(([, caminho]) => caminho) as [string, string][];

            return (
              <div
                key={env.id}
                className={clsx("flex flex-col gap-3 px-5 py-4", i > 0 && "border-t border-fio")}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link
                      href={negocio ? `/negocios/${negocio.id}` : "#"}
                      className="text-titulo text-tinta transition-colors duration-150 ease-out hover:text-acento focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                    >
                      {negocio?.contato?.empresa || negocio?.contato?.nome || "Sem contato"}
                    </Link>
                    <span className="text-corpo text-tinta-suave">
                      Proposta {env.proposta?.numero ?? "—"} ·{" "}
                      {negocio?.responsavel?.nome ?? "Sem responsável"}
                    </span>
                  </div>
                  <Badge tom={status.tom}>{status.texto}</Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[...(env.signatarios || [])]
                    .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
                    .map((s: any) => {
                      const r = ROTULO_SIGNATARIO[s.status];
                      return (
                        <Badge
                          key={s.id}
                          tom={r?.tom ?? "neutro"}
                          className={s.status === "visualizado" ? "gap-1" : undefined}
                        >
                          {s.status === "visualizado" && <Eye className="h-3 w-3" aria-hidden />}
                          <span title={quandoSignatario(s)}>
                            {s.nome} ({s.papel}) {r?.texto ?? "aguardando"}
                          </span>
                        </Badge>
                      );
                    })}
                </div>

                {assinados.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-fio pt-3">
                    {assinados.map(([rotulo, caminho]) => (
                      // Botao, nao <a href>: o banco guarda o caminho no bucket
                      // privado, entao a URL tem de ser assinada na hora.
                      <Button
                        key={rotulo}
                        variante="sutil"
                        tamanho="sm"
                        icone={Download}
                        onClick={() => void abrirPdf(caminho)}
                      >
                        Baixar {rotulo} assinada
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </Cartao>
    </div>
  );
}

function quandoSignatario(s: any): string {
  if (s.status === "assinado" && s.assinado_em)
    return `Assinado em ${new Date(s.assinado_em).toLocaleString("pt-BR")}`;
  if (s.status === "visualizado" && s.visualizado_em)
    return `Visualizou em ${new Date(s.visualizado_em).toLocaleString("pt-BR")}`;
  return "Ainda não visualizou o documento";
}
