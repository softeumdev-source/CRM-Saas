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
import { Abas, PainelDaAba, useAbaNaUrl, useIdDeAbas } from "@/components/ui";

/**
 * A lista e a fonte do tipo. Antes a uniao estava escrita a mao no `useState`
 * ao lado de um literal inline, e o `onClick` fazia `t.id as any` para os dois
 * conversarem — ou seja, acrescentar uma aba e esquecer da uniao compilava.
 */
const ABAS_ADMIN = [
  { chave: "desempenho", rotulo: "Desempenho", icone: LineChart },
  { chave: "vendedores", rotulo: "Time", icone: Users },
  { chave: "funil", rotulo: "Funil do Vendedor", icone: BarChart3 },
  { chave: "planos", rotulo: "Planos", icone: Package },
  { chave: "leads", rotulo: "Leads", icone: UserSquare2 },
  { chave: "descontos", rotulo: "Descontos", icone: BadgePercent },
  { chave: "cadencias", rotulo: "Cadências", icone: Send },
  { chave: "integracoes", rotulo: "Integrações", icone: Plug },
] as const;

export type AbaAdmin = (typeof ABAS_ADMIN)[number]["chave"];

export function ehAbaAdmin(v: string | undefined): v is AbaAdmin {
  return ABAS_ADMIN.some((a) => a.chave === v);
}

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
  solicitacoesDesconto?: any[];
  /** Vem de `?tab=`, validado no servidor. */
  abaInicial?: AbaAdmin;
  usuarioAtual: Usuario;
}) {
  // Estado da aba na URL: F5 e link compartilhado caem na mesma aba. Antes o
  // admin inteiro nao tinha uma unica leitura de query string.
  const [aba, setAba] = useAbaNaUrl<AbaAdmin>(abaInicial);
  const idDasAbas = useIdDeAbas("admin");
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
    // O cabeçalho NÃO é um cartão. Cartão é conteúdo; isto é o "onde estou" da
    // página, e antes ele acumulava quatro papéis numa caixa só — um selo de
    // eyebrow, um título de 28px, um parágrafo de duas linhas e o trilho de 8
    // abas espremido ao lado. Agora o título fica sobre o fundo da página e as
    // abas ganham a própria linha, que é o que elas são: navegação.
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6">
      <header className="mb-5">
        <h1 className="text-titulo font-semibold text-tinta">Administração</h1>
        {/* `text-display` era gasto aqui numa frase estática. Ele existe para
            "um número que é o assunto da tela" — e quem usa isso é o
            Desempenho, não um rótulo que nunca muda. */}
        <p className="text-corpo text-tinta-suave mt-1">
          O time, o funil, os planos das propostas e a distribuição dos leads.
        </p>
      </header>

      <div className="mb-6 border-b border-fio pb-px">
        <Abas
          abas={ABAS_ADMIN.map((a) => ({
            ...a,
            contagem:
              a.chave === "vendedores" ? membrosAtivos.length
              : a.chave === "planos" ? planos.length
              : a.chave === "leads" ? contatosSemDono.length
              : a.chave === "descontos" && descontosPendentes > 0 ? descontosPendentes
              : undefined,
            alerta: a.chave === "descontos" && descontosPendentes > 0,
          }))}
          valor={aba}
          aoTrocar={setAba}
          idBase={idDasAbas}
        />
      </div>

      {/* `PainelDaAba` estava construído e não ligado: as 8 abas apontavam
          `aria-controls` para elementos que não existiam. Um leitor de tela
          seguia o vínculo e não achava nada. */}
      <PainelDaAba idBase={idDasAbas} chave="desempenho" ativa={aba === "desempenho"}>
        <DesempenhoTab vendedores={vendedoresAtivos} negocios={negocios} etapas={etapas} historicoEtapas={historicoEtapas || []} />
      </PainelDaAba>
      <PainelDaAba idBase={idDasAbas} chave="vendedores" ativa={aba === "vendedores"}>
        <VendedoresTab membros={membros} convites={convites} negocios={negocios} usuarioAtual={usuarioAtual} />
      </PainelDaAba>
      <PainelDaAba idBase={idDasAbas} chave="funil" ativa={aba === "funil"}>
        <FunilTab vendedores={vendedoresAtivos} negocios={negocios} etapas={etapas} />
      </PainelDaAba>
      <PainelDaAba idBase={idDasAbas} chave="planos" ativa={aba === "planos"}>
        <PlanosTab planosIniciais={planos} tenantId={usuarioAtual.tenant_id} />
      </PainelDaAba>
      <PainelDaAba idBase={idDasAbas} chave="cadencias" ativa={aba === "cadencias"}>
        <CadenciasTab />
      </PainelDaAba>
      <PainelDaAba idBase={idDasAbas} chave="integracoes" ativa={aba === "integracoes"}>
        <IntegracoesTab usuarioAtual={usuarioAtual} />
      </PainelDaAba>
      <PainelDaAba idBase={idDasAbas} chave="leads" ativa={aba === "leads"}>
        <LeadsTab vendedores={vendedoresAtivos} contatosSemDonoIniciais={contatosSemDono} teto={tetoLeadsSemDono} contatosComDonoIniciais={contatosComDono || []} usuarioAtual={usuarioAtual} />
      </PainelDaAba>
      <PainelDaAba idBase={idDasAbas} chave="descontos" ativa={aba === "descontos"}>
        <DescontosTab solicitacoesIniciais={solicitacoesDesconto || []} />
      </PainelDaAba>
    </div>
  );
}
