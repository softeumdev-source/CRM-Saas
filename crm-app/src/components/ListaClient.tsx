"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import clsx from "clsx";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, formatarMoeda } from "@/lib/types";
import {
  diasSemContato,
  proximaAtividade,
  situacaoDoNegocio,
  type TomSituacao,
} from "@/lib/atividades";
import { Badge, Cartao, Input, Select, Vazio } from "@/components/ui";

type Ordem = "recentes" | "sem_contato" | "valor" | "proxima_acao";

const TOM_TEXTO: Record<TomSituacao, string> = {
  ok: "text-emerald-700",
  neutro: "text-tinta-suave",
  atencao: "text-amber-700",
  perigo: "text-rose-700",
};

// whitespace-nowrap em tudo: sem isso a tabela se espreme ate quebrar nome de
// empresa, etapa e CNPJ em tres linhas cada. Quem quebra a linha e a coluna da
// empresa, de proposito; o resto rola na horizontal.
const CELULA = "whitespace-nowrap px-4 py-3 align-middle";
// Constante propria em vez de "whitespace-normal" por cima de CELULA: duas
// classes do mesmo grupo sao decididas pela ordem no CSS gerado, nao pela
// ordem em que foram escritas.
// min-width, nao width: em tabela de layout automatico a largura e so uma
// sugestao, e a coluna da empresa (a unica que quebra linha) acabava
// absorvendo toda a sobra e espremendo em tres linhas.
const CELULA_EMPRESA = "min-w-[240px] px-4 py-3 align-middle";

export function ListaClient({
  negocios: negociosIniciais,
  etapas,
}: {
  negocios: NegocioComRelacoes[];
  etapas: EtapaPipeline[];
}) {
  const [negocios, setNegocios] = useEstadoDaProp(negociosIniciais);
  const [busca, setBusca] = useState("");
  const [etapaFiltro, setEtapaFiltro] = useState("all");
  const [ordem, setOrdem] = useState<Ordem>("recentes");

  const recarregar = useCallback(async () => {
    const { data } = await createClient()
      .from("negocios")
      .select(SELECT_NEGOCIO_COMPLETO)
      .order("criado_em", { ascending: false });
    if (data) setNegocios(data as unknown as NegocioComRelacoes[]);
  }, []);

  useSincronizacao(recarregar, {
    canal: "lista-negocios",
    tabelas: [{ tabela: "negocios" }, { tabela: "contatos" }, { tabela: "atividades" }],
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = negocios.filter((n) => {
      const matchBusca =
        termo === "" ||
        n.titulo.toLowerCase().includes(termo) ||
        (n.contato?.nome || "").toLowerCase().includes(termo) ||
        (n.contato?.empresa || "").toLowerCase().includes(termo) ||
        (n.contato?.email || "").toLowerCase().includes(termo) ||
        (n.contato?.cnpj || "").toLowerCase().includes(termo);
      const matchEtapa = etapaFiltro === "all" || n.etapa_id === etapaFiltro;
      return matchBusca && matchEtapa;
    });

    const semData = Number.MAX_SAFE_INTEGER;
    return lista.sort((a, b) => {
      if (ordem === "valor") return (b.valor || 0) - (a.valor || 0);
      if (ordem === "sem_contato") return (diasSemContato(b) ?? 9999) - (diasSemContato(a) ?? 9999);
      if (ordem === "proxima_acao") {
        const pa = proximaAtividade(a.atividades_pendentes)?.data_agendada;
        const pb = proximaAtividade(b.atividades_pendentes)?.data_agendada;
        return (pa ? new Date(pa).getTime() : semData) - (pb ? new Date(pb).getTime() : semData);
      }
      return new Date(b.criado_em || 0).getTime() - new Date(a.criado_em || 0).getTime();
    });
  }, [negocios, busca, etapaFiltro, ordem]);

  const total = filtrados.reduce((acc, n) => acc + (n.valor || 0), 0);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-serif text-display text-tinta">Lista</h1>
          <p className="text-corpo-lg tabular-nums text-tinta-suave">
            {filtrados.length} {filtrados.length === 1 ? "negócio" : "negócios"} ·{" "}
            {formatarMoeda(total)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta-fraca"
              aria-hidden
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar negócio"
              placeholder="Buscar empresa, contato, e-mail ou CNPJ…"
              className="pl-9"
            />
          </div>
          <div className="w-44">
            <Select
              value={etapaFiltro}
              onChange={(e) => setEtapaFiltro(e.target.value)}
              aria-label="Filtrar por etapa"
            >
              <option value="all">Todas as etapas</option>
              {etapas.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-52">
            <Select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as Ordem)}
              aria-label="Ordenar por"
            >
              <option value="recentes">Mais recentes</option>
              <option value="sem_contato">Mais tempo sem contato</option>
              <option value="proxima_acao">Próxima ação</option>
              <option value="valor">Maior valor</option>
            </Select>
          </div>
        </div>
      </div>

      <Cartao className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="text-rotulo uppercase text-tinta-fraca">
                <th className={CELULA_EMPRESA}>Empresa / contato</th>
                <th className={CELULA}>Etapa</th>
                <th className={clsx(CELULA, "text-right")}>Valor</th>
                <th className={CELULA}>Situação</th>
                <th className={clsx(CELULA, "text-right")}>Sem contato</th>
                <th className={CELULA}>Responsável</th>
                <th className={CELULA}>CNPJ</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((n) => {
                const situacao = situacaoDoNegocio(n);
                const dias = diasSemContato(n);
                return (
                  <tr
                    key={n.id}
                    className="border-t border-fio transition-colors duration-150 ease-out hover:bg-recuo"
                  >
                    <td className={CELULA_EMPRESA}>
                      <Link
                        href={`/negocios/${n.id}`}
                        className="text-titulo text-tinta transition-colors duration-150 ease-out hover:text-acento focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                      >
                        {n.contato?.empresa || n.contato?.nome || n.titulo}
                      </Link>
                      <p className="text-corpo text-tinta-suave">
                        {[n.contato?.nome, n.contato?.cargo].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className={CELULA}>
                      <span className="text-corpo-lg flex items-center gap-2 text-tinta-suave">
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: n.etapa?.cor || "var(--acento)" }}
                        />
                        {n.etapa?.nome ?? "—"}
                      </span>
                    </td>
                    <td className={clsx(CELULA, "text-right")}>
                      <span className="font-serif text-lg tabular-nums text-tinta">
                        {formatarMoeda(n.valor)}
                      </span>
                    </td>
                    <td className={CELULA}>
                      <span
                        title={situacao.detalhe}
                        className={clsx("text-corpo-lg font-medium", TOM_TEXTO[situacao.tom])}
                      >
                        {situacao.texto}
                      </span>
                    </td>
                    <td className={clsx(CELULA, "text-corpo-lg tabular-nums text-right")}>
                      {dias === null ? (
                        <span className="text-tinta-fraca">—</span>
                      ) : (
                        <span className={dias >= 7 ? "text-amber-700" : "text-tinta-suave"}>
                          {dias}d
                        </span>
                      )}
                    </td>
                    <td className={clsx(CELULA, "text-corpo-lg")}>
                      {n.responsavel?.nome ?? <span className="text-tinta-fraca">Pool</span>}
                    </td>
                    <td className={CELULA} title={n.contato?.cnpj ?? undefined}>
                      {/* Sinal binario, nao o numero: com os 18 digitos a coluna
                          empurrava a tabela para a rolagem horizontal, e o que o
                          vendedor precisa saber aqui e se a proposta esta
                          bloqueada. O numero fica no title e no card. */}
                      {n.contato?.cnpj ? (
                        <span className="text-corpo-lg text-tinta-fraca">ok</span>
                      ) : (
                        <Badge tom="atencao">falta</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtrados.length === 0 && (
            <Vazio
              icone={Search}
              titulo="Nenhum negócio encontrado"
              descricao="Tente outro termo de busca ou limpe o filtro de etapa."
            />
          )}
        </div>
      </Cartao>
    </div>
  );
}
