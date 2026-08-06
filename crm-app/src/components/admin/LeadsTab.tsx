"use client";

import { useState } from "react";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { Upload, Loader2, Users2, Shuffle, CheckCircle2, ArrowRightLeft, Search, X, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Contato, Usuario } from "@/lib/types";
import {
  mapearLinha,
  classificarImportacao,
  paraContato,
  rotuloStatus,
  normalizarEmail,
  normalizarCnpj,
  type LinhaClassificada,
  type ResumoImportacao,
  type StatusLinha,
} from "@/lib/importarLeads";

type ContatoComDono = Contato & { responsavel: { id: string; nome: string } | null };

interface Preview {
  arquivo: string;
  classificadas: LinhaClassificada[];
  resumo: ResumoImportacao;
}

const COR_STATUS: Record<StatusLinha, string> = {
  novo: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  sem_nome: "text-slate-500 bg-slate-100 dark:bg-slate-800",
  email_invalido: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  dup_arquivo: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  existe: "text-slate-500 bg-slate-100 dark:bg-slate-800",
};

export function LeadsTab({
  vendedores,
  contatosSemDonoIniciais,
  contatosComDonoIniciais = [],
  usuarioAtual,
}: {
  vendedores: Usuario[];
  contatosSemDonoIniciais: Contato[];
  contatosComDonoIniciais?: ContatoComDono[];
  usuarioAtual: Usuario;
}) {
  const [contatosSemDono, setContatosSemDono] = useState(contatosSemDonoIniciais);
  const [contatosComDono, setContatosComDono] = useState<ContatoComDono[]>(contatosComDonoIniciais);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ inseridos: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [vendedorManual, setVendedorManual] = useState("");
  const [distribuindo, setDistribuindo] = useState(false);
  // reatribuicao de leads que ja tem dono
  const [selComDono, setSelComDono] = useState<Set<string>>(new Set());
  const [filtroVendedor, setFiltroVendedor] = useState("all");
  const [buscaComDono, setBuscaComDono] = useState("");
  const [novoResp, setNovoResp] = useState("");
  const [reatribuindo, setReatribuindo] = useState(false);

  // Fase 1: lê o arquivo, deduplica (no arquivo e contra o banco) e monta a prévia.
  const analisarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(null);
    setResultado(null);
    setPreview(null);
    setProcessando(true);
    setProgresso("Lendo arquivo...");

    try {
      let linhas: Record<string, unknown>[] = [];
      if (file.name.endsWith(".csv")) {
        const texto = await file.text();
        const parsed = Papa.parse(texto, { header: true, skipEmptyLines: true });
        linhas = parsed.data as Record<string, unknown>[];
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];
        const cabecalho: string[] = [];
        sheet.getRow(1).eachCell((cell, colNumber) => {
          cabecalho[colNumber] = String(cell.value ?? "");
        });
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const obj: Record<string, unknown> = {};
          row.eachCell((cell, colNumber) => {
            obj[cabecalho[colNumber]] = cell.value;
          });
          linhas.push(obj);
        });
      }

      const mapeadas = linhas.map(mapearLinha);
      if (mapeadas.length === 0) {
        setErro("Nenhuma linha encontrada no arquivo.");
        return;
      }

      // Contatos já existentes no tenant (email + cnpj) para dedup contra o banco.
      setProgresso("Conferindo duplicados na base...");
      const supabase = createClient();
      const existentesEmails = new Set<string>();
      const existentesCnpj = new Set<string>();
      const PAGINA = 1000;
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await supabase
          .from("contatos")
          .select("email, cnpj")
          .range(de, de + PAGINA - 1);
        if (error) throw error;
        for (const c of data || []) {
          const em = normalizarEmail(c.email);
          if (em) existentesEmails.add(em);
          const cn = normalizarCnpj(c.cnpj);
          if (cn) existentesCnpj.add(cn);
        }
        if (!data || data.length < PAGINA) break;
      }

      const { classificadas, resumo } = classificarImportacao(mapeadas, existentesEmails, existentesCnpj);
      setPreview({ arquivo: file.name, classificadas, resumo });
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
    } finally {
      setProcessando(false);
      setProgresso(null);
      e.target.value = "";
    }
  };

  // Fase 2: grava apenas as linhas classificadas como "novo".
  const confirmarImportacao = async () => {
    if (!preview) return;
    const novos = preview.classificadas.filter((l) => l._status === "novo").map(paraContato);
    if (novos.length === 0) {
      setPreview(null);
      return;
    }
    setConfirmando(true);
    setErro(null);
    try {
      const TAMANHO_LOTE = 500;
      const supabase = createClient();
      let inseridos = 0;
      for (let i = 0; i < novos.length; i += TAMANHO_LOTE) {
        const lote = novos.slice(i, i + TAMANHO_LOTE).map((c) => ({ ...c, nome: c.nome ?? "", tenant_id: usuarioAtual.tenant_id, origem: "importacao" }));
        setProgresso(`Importando ${Math.min(i + TAMANHO_LOTE, novos.length)} de ${novos.length}...`);
        const { data, error } = await supabase
          .from("contatos")
          .upsert(lote, { onConflict: "tenant_id,email", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        inseridos += data?.length || 0;
      }

      setResultado({ inseridos, total: preview.resumo.total });
      setPreview(null);
      const { data: atualizados } = await supabase.from("contatos").select("*").is("responsavel_id", null).order("criado_em", { ascending: false });
      if (atualizados) setContatosSemDono(atualizados);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Falha ao importar.");
    } finally {
      setConfirmando(false);
      setProgresso(null);
    }
  };

  const alternarSelecao = (id: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  };

  const distribuirManual = async () => {
    if (!vendedorManual || selecionados.size === 0) return;
    setDistribuindo(true);
    const supabase = createClient();
    await supabase.from("contatos").update({ responsavel_id: vendedorManual }).in("id", Array.from(selecionados));
    setContatosSemDono((prev) => prev.filter((c) => !selecionados.has(c.id)));
    setSelecionados(new Set());
    setDistribuindo(false);
  };

  const distribuirAutomatico = async () => {
    const idsAlvo = selecionados.size > 0 ? Array.from(selecionados) : contatosSemDono.map((c) => c.id);
    if (idsAlvo.length === 0) return;
    setDistribuindo(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("distribuir_leads", { p_contato_ids: idsAlvo });
    setDistribuindo(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setContatosSemDono((prev) => prev.filter((c) => !idsAlvo.includes(c.id)));
    setSelecionados(new Set());
  };

  const selecionarTodosPool = () => {
    setSelecionados((prev) => (prev.size === contatosSemDono.length ? new Set() : new Set(contatosSemDono.map((c) => c.id))));
  };

  const comDonoFiltrados = contatosComDono.filter((c) => {
    const okVendedor = filtroVendedor === "all" || c.responsavel?.id === filtroVendedor;
    const okBusca = !buscaComDono.trim() || (c.nome + " " + (c.empresa || "") + " " + (c.email || "")).toLowerCase().includes(buscaComDono.trim().toLowerCase());
    return okVendedor && okBusca;
  });

  const alternarSelComDono = (id: string) => {
    setSelComDono((prev) => {
      const novo = new Set(prev);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  };

  const reatribuir = async (paraPool: boolean) => {
    if (selComDono.size === 0) return;
    if (!paraPool && !novoResp) return;
    setReatribuindo(true);
    const ids = Array.from(selComDono);
    const supabase = createClient();
    const destino = paraPool ? null : novoResp;
    await supabase.from("contatos").update({ responsavel_id: destino }).in("id", ids);
    if (paraPool) {
      const movidos = contatosComDono.filter((c) => selComDono.has(c.id)).map((c) => ({ ...c, responsavel_id: null, responsavel: null }));
      setContatosSemDono((prev) => [...movidos, ...prev]);
      setContatosComDono((prev) => prev.filter((c) => !selComDono.has(c.id)));
    } else {
      const dest = vendedores.find((v) => v.id === novoResp);
      setContatosComDono((prev) =>
        prev.map((c) => (selComDono.has(c.id) ? { ...c, responsavel_id: novoResp, responsavel: dest ? { id: dest.id, nome: dest.nome } : null } : c))
      );
    }
    setSelComDono(new Set());
    setNovoResp("");
    setReatribuindo(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-3">
        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Upload className="h-4 w-4 text-indigo-600" /> Importar base de contatos (CSV ou XLSX)
        </h3>
        <p className="text-xs text-slate-500">
          Colunas reconhecidas: nome, empresa, email, telefone, cargo, cidade, estado, cnpj. Repetidos (por e-mail ou
          CNPJ) — tanto no arquivo quanto já cadastrados — são detectados e mostrados numa prévia antes de gravar.
          Os leads importados entram no pool &quot;sem dono&quot; até serem distribuídos.
        </p>
        {!preview && (
          <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md cursor-pointer w-fit">
            {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {processando ? progresso || "Processando..." : "Escolher arquivo"}
            <input type="file" accept=".csv,.xlsx" className="hidden" onChange={analisarArquivo} disabled={processando} />
          </label>
        )}
        {resultado && (
          <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> {resultado.inseridos} de {resultado.total} contatos importados. O restante foi ignorado (sem nome, duplicados ou já cadastrados).
          </p>
        )}
        {erro && <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{erro}</p>}

        {preview && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">Prévia — {preview.arquivo}</p>
                <p className="text-[11px] text-slate-500">{preview.resumo.total} linhas analisadas</p>
              </div>
              <button
                onClick={() => setPreview(null)}
                disabled={confirmando}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
            </div>

            <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <ResumoPill cor="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/40" label="Novos" valor={preview.resumo.novos} />
              <ResumoPill cor="text-slate-500" bg="bg-slate-100 dark:bg-slate-800" label="Já existem" valor={preview.resumo.existentes} />
              <ResumoPill cor="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/40" label="Repetidos" valor={preview.resumo.dupArquivo} />
              <ResumoPill cor="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/40" label="E-mail inválido" valor={preview.resumo.emailInvalido} />
              <ResumoPill cor="text-slate-500" bg="bg-slate-100 dark:bg-slate-800" label="Sem nome" valor={preview.resumo.semNome} />
            </div>

            <div className="max-h-72 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="p-2 w-10">Linha</th>
                    <th className="p-2">Nome</th>
                    <th className="p-2">Empresa</th>
                    <th className="p-2">E-mail / CNPJ</th>
                    <th className="p-2">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preview.classificadas.slice(0, 300).map((l) => (
                    <tr key={l._linha} className={l._status === "novo" ? "" : "opacity-70"}>
                      <td className="p-2 text-slate-400">{l._linha}</td>
                      <td className="p-2 font-semibold text-slate-800 dark:text-slate-200">{l.nome || <span className="text-rose-500">—</span>}</td>
                      <td className="p-2 text-slate-500">{l.empresa || "—"}</td>
                      <td className="p-2 text-slate-500">{l.email || l.cnpj || "—"}</td>
                      <td className="p-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${COR_STATUS[l._status]}`}>
                          {(l._status === "email_invalido" || l._status === "dup_arquivo") && <AlertTriangle className="h-3 w-3" />}
                          {rotuloStatus(l._status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.classificadas.length > 300 && (
                <p className="p-2 text-[11px] text-slate-400 text-center">Mostrando as primeiras 300 de {preview.classificadas.length} linhas.</p>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={confirmarImportacao}
                disabled={confirmando || preview.resumo.novos === 0}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md disabled:opacity-50"
              >
                {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {confirmando ? progresso || "Importando..." : preview.resumo.novos === 0 ? "Nada novo para importar" : `Importar ${preview.resumo.novos} novos`}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Users2 className="h-4 w-4 text-amber-600" /> Leads sem dono ({contatosSemDono.length})
            </h3>
            <p className="text-xs text-slate-500">{selecionados.size} selecionados</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={vendedorManual} onChange={(e) => setVendedorManual(e.target.value)} className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <option value="">Escolher vendedor...</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
            <button
              onClick={distribuirManual}
              disabled={!vendedorManual || selecionados.size === 0 || distribuindo}
              className="px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 rounded-xl disabled:opacity-50"
            >
              Atribuir selecionados
            </button>
            <button
              onClick={distribuirAutomatico}
              disabled={distribuindo || (contatosSemDono.length === 0)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md disabled:opacity-50"
            >
              {distribuindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
              Distribuir automatico (round-robin)
            </button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={contatosSemDono.length > 0 && selecionados.size === contatosSemDono.length}
                    onChange={selecionarTodosPool}
                    title="Selecionar todos"
                  />
                </th>
                <th className="p-3">Nome</th>
                <th className="p-3">Empresa</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {contatosSemDono.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3"><input type="checkbox" checked={selecionados.has(c.id)} onChange={() => alternarSelecao(c.id)} /></td>
                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{c.nome}</td>
                  <td className="p-3 text-slate-500">{c.empresa || "—"}</td>
                  <td className="p-3 text-slate-500">{c.email || "—"}</td>
                  <td className="p-3 text-slate-400 capitalize">{c.origem}</td>
                </tr>
              ))}
              {contatosSemDono.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-slate-400">Nenhum lead sem dono no momento.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-indigo-600" /> Leads com vendedor ({comDonoFiltrados.length})
              </h3>
              <p className="text-xs text-slate-500">{selComDono.size} selecionados · reatribua ou devolva ao pool</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={buscaComDono}
                onChange={(e) => setBuscaComDono(e.target.value)}
                placeholder="Buscar nome/empresa/e-mail..."
                className="pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl w-56"
              />
            </div>
            <select value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)} className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <option value="all">Todos os vendedores</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
            <div className="flex-1" />
            <select value={novoResp} onChange={(e) => setNovoResp(e.target.value)} className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <option value="">Passar para...</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
            <button
              onClick={() => reatribuir(false)}
              disabled={reatribuindo || selComDono.size === 0 || !novoResp}
              className="px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
            >
              {reatribuindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reatribuir"}
            </button>
            <button
              onClick={() => reatribuir(true)}
              disabled={reatribuindo || selComDono.size === 0}
              className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl disabled:opacity-50"
            >
              Devolver ao pool
            </button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={comDonoFiltrados.length > 0 && comDonoFiltrados.every((c) => selComDono.has(c.id))}
                    onChange={() =>
                      setSelComDono((prev) =>
                        comDonoFiltrados.every((c) => prev.has(c.id)) ? new Set() : new Set(comDonoFiltrados.map((c) => c.id))
                      )
                    }
                  />
                </th>
                <th className="p-3">Nome</th>
                <th className="p-3">Empresa</th>
                <th className="p-3">Vendedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {comDonoFiltrados.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3"><input type="checkbox" checked={selComDono.has(c.id)} onChange={() => alternarSelComDono(c.id)} /></td>
                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{c.nome}</td>
                  <td className="p-3 text-slate-500">{c.empresa || "—"}</td>
                  <td className="p-3 text-indigo-600 dark:text-indigo-400 font-semibold">{c.responsavel?.nome || "—"}</td>
                </tr>
              ))}
              {comDonoFiltrados.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-slate-400">Nenhum lead com vendedor neste filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ResumoPill({ cor, bg, label, valor }: { cor: string; bg: string; label: string; valor: number }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${bg}`}>
      <p className={`text-lg font-extrabold ${cor}`}>{valor}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
