"use client";

import { useState } from "react";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { Upload, Loader2, Users2, Shuffle, CheckCircle2, ArrowRightLeft, Search, Trash2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Contato, Usuario } from "@/lib/types";

type ContatoComDono = Contato & { responsavel: { id: string; nome: string } | null };

interface LinhaImportada {
  nome: string;
  sobrenome?: string;
  empresa?: string;
  email?: string;
  telefone?: string;
  telefone_comercial?: string;
  cargo?: string;
  area?: string;
  cidade?: string;
  estado?: string;
  cnpj?: string;
}

function normalizarChave(k: string) {
  return k.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const MAPA_CAMPOS: Record<string, keyof LinhaImportada> = {
  "nome completo": "nome",
  nome: "nome",
  name: "nome",
  contato: "nome",
  "first name": "nome",
  sobrenome: "sobrenome",
  "last name": "sobrenome",
  empresa: "empresa",
  company: "empresa",
  conta: "empresa",
  account: "empresa",
  email: "email",
  "e-mail": "email",
  telefone: "telefone",
  phone: "telefone",
  celular: "telefone",
  "telefone comercial": "telefone_comercial",
  "business phone": "telefone_comercial",
  "tel comercial": "telefone_comercial",
  cargo: "cargo",
  role: "cargo",
  title: "cargo",
  area: "area",
  department: "area",
  departamento: "area",
  setor: "area",
  cidade: "cidade",
  city: "cidade",
  estado: "estado",
  uf: "estado",
  cnpj: "cnpj",
};

function linhasParaContatos(linhas: Record<string, any>[]): LinhaImportada[] {
  return linhas
    .map((linha) => {
      const contato: any = {};
      for (const [chave, valor] of Object.entries(linha)) {
        const campo = MAPA_CAMPOS[normalizarChave(chave)];
        if (campo && valor !== undefined && valor !== null && String(valor).trim() !== "") {
          contato[campo] = String(valor).trim();
        }
      }
      return contato as LinhaImportada;
    })
    .filter((c) => c.nome);
}

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
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [vendedorManual, setVendedorManual] = useState("");
  const [distribuindo, setDistribuindo] = useState(false);
  const [selComDono, setSelComDono] = useState<Set<string>>(new Set());
  const [filtroVendedor, setFiltroVendedor] = useState("all");
  const [buscaComDono, setBuscaComDono] = useState("");
  const [buscaSemDono, setBuscaSemDono] = useState("");
  const [novoResp, setNovoResp] = useState("");
  const [reatribuindo, setReatribuindo] = useState(false);
  const [deletando, setDeletando] = useState(false);

  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(null);
    setResultado(null);
    setProcessando(true);

    try {
      let linhas: Record<string, any>[] = [];
      if (file.name.endsWith(".csv")) {
        const texto = await file.text();
        const parsed = Papa.parse(texto, { header: true, skipEmptyLines: true });
        linhas = parsed.data as Record<string, any>[];
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
          const obj: Record<string, any> = {};
          row.eachCell((cell, colNumber) => {
            obj[cabecalho[colNumber]] = cell.value;
          });
          linhas.push(obj);
        });
      }

      const contatos = linhasParaContatos(linhas);
      if (contatos.length === 0) {
        setErro("Nenhuma linha valida encontrada. Verifique se ha uma coluna 'Nome' ou 'Nome Completo'.");
        setProcessando(false);
        return;
      }

      const TAMANHO_LOTE = 500;
      const supabase = createClient();
      let inseridos = 0;
      for (let i = 0; i < contatos.length; i += TAMANHO_LOTE) {
        const lote = contatos.slice(i, i + TAMANHO_LOTE).map((c) => ({ ...c, tenant_id: usuarioAtual.tenant_id, origem: "importacao" }));
        setProgresso(`Importando ${Math.min(i + TAMANHO_LOTE, contatos.length)} de ${contatos.length}...`);
        const { data, error } = await supabase
          .from("contatos")
          .upsert(lote, { onConflict: "tenant_id,email", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        inseridos += data?.length || 0;
      }

      setResultado({ inseridos, total: contatos.length });
      const { data: atualizados } = await supabase.from("contatos").select("*").is("responsavel_id", null).order("criado_em", { ascending: false });
      if (atualizados) setContatosSemDono(atualizados);
    } catch (err: any) {
      setErro(err.message || "Falha ao importar arquivo.");
    } finally {
      setProcessando(false);
      setProgresso(null);
      e.target.value = "";
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
    const movidos = contatosSemDono.filter((c) => selecionados.has(c.id));
    const dest = vendedores.find((v) => v.id === vendedorManual);
    setContatosComDono((prev) => [...movidos.map((c) => ({ ...c, responsavel_id: vendedorManual, responsavel: dest ? { id: dest.id, nome: dest.nome } : null })), ...prev]);
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
    if (error) {
      setErro(error.message);
      setDistribuindo(false);
      return;
    }
    const { data: atualizadosSemDono } = await supabase.from("contatos").select("*").is("responsavel_id", null).order("criado_em", { ascending: false });
    const { data: atualizadosComDono } = await supabase.from("contatos").select("*, responsavel:usuarios(id, nome)").not("responsavel_id", "is", null).order("criado_em", { ascending: false }).limit(1000);
    if (atualizadosSemDono) setContatosSemDono(atualizadosSemDono);
    if (atualizadosComDono) setContatosComDono(atualizadosComDono as any);
    setSelecionados(new Set());
    setDistribuindo(false);
  };

  const deletarSelecionadosSemDono = async () => {
    if (selecionados.size === 0) return;
    if (!confirm(`Tem certeza que deseja deletar ${selecionados.size} lead(s)? Esta acao nao pode ser desfeita.`)) return;
    setDeletando(true);
    const supabase = createClient();
    const ids = Array.from(selecionados);
    const { error } = await supabase.from("contatos").delete().in("id", ids);
    setDeletando(false);
    if (error) { setErro(error.message); return; }
    setContatosSemDono((prev) => prev.filter((c) => !selecionados.has(c.id)));
    setSelecionados(new Set());
  };

  const deletarSelecionadosComDono = async () => {
    if (selComDono.size === 0) return;
    if (!confirm(`Tem certeza que deseja deletar ${selComDono.size} lead(s)? Esta acao nao pode ser desfeita.`)) return;
    setDeletando(true);
    const supabase = createClient();
    const ids = Array.from(selComDono);
    const { error } = await supabase.from("contatos").delete().in("id", ids);
    setDeletando(false);
    if (error) { setErro(error.message); return; }
    setContatosComDono((prev) => prev.filter((c) => !selComDono.has(c.id)));
    setSelComDono(new Set());
  };

  const semDonoFiltrados = contatosSemDono.filter((c) => {
    if (!buscaSemDono.trim()) return true;
    const termo = buscaSemDono.trim().toLowerCase();
    return (c.nome + " " + (c.sobrenome || "") + " " + (c.empresa || "") + " " + (c.email || "") + " " + (c.cargo || "")).toLowerCase().includes(termo);
  });

  const selecionarTodosPool = () => {
    const idsFiltrados = semDonoFiltrados.map((c) => c.id);
    setSelecionados((prev) => (prev.size === idsFiltrados.length && idsFiltrados.every((id) => prev.has(id)) ? new Set() : new Set(idsFiltrados)));
  };

  const comDonoFiltrados = contatosComDono.filter((c) => {
    const okVendedor = filtroVendedor === "all" || c.responsavel?.id === filtroVendedor;
    const okBusca = !buscaComDono.trim() || (c.nome + " " + (c.sobrenome || "") + " " + (c.empresa || "") + " " + (c.email || "") + " " + (c.cargo || "")).toLowerCase().includes(buscaComDono.trim().toLowerCase());
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
      {/* Import section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-3">
        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Upload className="h-4 w-4 text-indigo-600" /> Importar base de contatos (CSV ou XLSX)
        </h3>
        <p className="text-xs text-slate-500">
          Colunas reconhecidas: <span className="font-semibold text-slate-600 dark:text-slate-400">Nome Completo, Nome, Sobrenome, Cargo, Area, E-mail, Telefone Comercial, Conta/Empresa, CNPJ</span>.
          Contatos com e-mail repetido sao ignorados. Suporta importacao em massa (ate 200 mil registros). Os leads importados entram no pool "sem dono".
        </p>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md cursor-pointer w-fit">
            {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {processando ? progresso || "Processando..." : "Escolher arquivo"}
            <input type="file" accept=".csv,.xlsx" className="hidden" onChange={handleArquivo} disabled={processando} />
          </label>
          {processando && <p className="text-xs text-slate-500 animate-pulse">{progresso}</p>}
        </div>
        {resultado && (
          <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> {resultado.inseridos} de {resultado.total} contatos importados (duplicados por e-mail ignorados).
          </p>
        )}
        {erro && (
          <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0" /> {erro}
          </p>
        )}
      </div>

      {/* Leads sem dono */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users2 className="h-4 w-4 text-amber-600" /> Leads sem dono ({contatosSemDono.length})
              </h3>
              <p className="text-xs text-slate-500">{selecionados.size} selecionados</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={buscaSemDono}
                onChange={(e) => setBuscaSemDono(e.target.value)}
                placeholder="Buscar nome/empresa/e-mail..."
                className="pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl w-56"
              />
            </div>
            <div className="flex-1" />
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
              Distribuir automatico
            </button>
            <button
              onClick={deletarSelecionadosSemDono}
              disabled={deletando || selecionados.size === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md disabled:opacity-50"
            >
              {deletando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Deletar
            </button>
          </div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={semDonoFiltrados.length > 0 && semDonoFiltrados.every((c) => selecionados.has(c.id))}
                    onChange={selecionarTodosPool}
                    title="Selecionar todos"
                  />
                </th>
                <th className="p-3">Nome</th>
                <th className="p-3">Empresa</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Cargo</th>
                <th className="p-3">CNPJ</th>
                <th className="p-3">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {semDonoFiltrados.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3"><input type="checkbox" checked={selecionados.has(c.id)} onChange={() => alternarSelecao(c.id)} /></td>
                  <td className="p-3">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{c.nome}</span>
                    {c.sobrenome && <span className="text-slate-500"> {c.sobrenome}</span>}
                  </td>
                  <td className="p-3 text-slate-500">{c.empresa || "—"}</td>
                  <td className="p-3 text-slate-500 max-w-[180px] truncate">{c.email || "—"}</td>
                  <td className="p-3 text-slate-500">{c.cargo || "—"}</td>
                  <td className="p-3">
                    {c.cnpj ? (
                      <span className="text-emerald-600 font-semibold text-[10px]">OK</span>
                    ) : (
                      <span className="text-amber-500 font-semibold text-[10px]">—</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-400 capitalize text-[11px]">{c.origem || "—"}</td>
                </tr>
              ))}
              {semDonoFiltrados.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400">
                  {buscaSemDono.trim() ? "Nenhum lead encontrado para esta busca." : "Nenhum lead sem dono no momento."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {contatosSemDono.length > 50 && (
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[11px] text-slate-400">Exibindo {semDonoFiltrados.length} de {contatosSemDono.length} leads sem dono</p>
          </div>
        )}
      </div>

      {/* Leads com vendedor */}
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
            <button
              onClick={deletarSelecionadosComDono}
              disabled={deletando || selComDono.size === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md disabled:opacity-50"
            >
              {deletando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Deletar
            </button>
          </div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
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
                <th className="p-3">E-mail</th>
                <th className="p-3">Cargo</th>
                <th className="p-3">Vendedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {comDonoFiltrados.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3"><input type="checkbox" checked={selComDono.has(c.id)} onChange={() => alternarSelComDono(c.id)} /></td>
                  <td className="p-3">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{c.nome}</span>
                    {c.sobrenome && <span className="text-slate-500"> {c.sobrenome}</span>}
                  </td>
                  <td className="p-3 text-slate-500">{c.empresa || "—"}</td>
                  <td className="p-3 text-slate-500 max-w-[180px] truncate">{c.email || "—"}</td>
                  <td className="p-3 text-slate-500">{c.cargo || "—"}</td>
                  <td className="p-3 text-indigo-600 dark:text-indigo-400 font-semibold">{c.responsavel?.nome || "—"}</td>
                </tr>
              ))}
              {comDonoFiltrados.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-slate-400">Nenhum lead com vendedor neste filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
