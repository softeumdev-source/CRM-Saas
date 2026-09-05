"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { Upload, Loader2, Users2, Shuffle, CheckCircle2, ArrowRightLeft, Search, Send, X, AlertTriangle, Trash2 } from "lucide-react";
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
import { Alerta, Botao, Cartao, Confirmar, Entrada, Rotulo, Selecao, Selo, Vazio } from "@/components/ui";
import { useEstadoDaProp } from "@/lib/estadoDaProp";

type ContatoComDono = Contato & { responsavel: { id: string; nome: string } | null };

interface Preview {
  arquivo: string;
  classificadas: LinhaClassificada[];
  resumo: ResumoImportacao;
}

const COR_STATUS: Record<StatusLinha, string> = {
  novo: "text-ok bg-ok-fraco",
  sem_nome: "text-tinta-suave bg-recuo",
  email_invalido: "text-alerta bg-alerta-fraco",
  dup_arquivo: "text-alerta bg-alerta-fraco",
  existe: "text-tinta-suave bg-recuo",
};

export function LeadsTab({
  vendedores,
  contatosSemDonoIniciais,
  teto,
  contatosComDonoIniciais = [],
  usuarioAtual,
  negociosAbertos = [],
}: {
  vendedores: Usuario[];
  contatosSemDonoIniciais: Contato[];
  /** Teto de carregamento do servidor; se a lista bater nele, avisa. */
  teto?: number;
  contatosComDonoIniciais?: ContatoComDono[];
  usuarioAtual: Usuario;
  /**
   * Contatos que JA TEM negocio aberto, e em qual funil.
   *
   * `enviar_para_prospeccao` recusa esses contatos de proposito: sem a guarda,
   * um clique duplicado criaria dois cards e o cliente receberia a cadencia em
   * dobro. Mas ate agora a tela nao sabia disso — deixava selecionar, chamava a
   * funcao, a funcao pulava todos, e o resumo anunciava "0 leads entraram" num
   * alerta VERDE. Parecia que tinha funcionado.
   */
  negociosAbertos?: { contato_id: string | null; pipeline: { chave: string; nome: string } | null }[];
}) {
  // `useEstadoDaProp` e nao `useEffect`: e o padrao oficial do React de
  // ajustar estado durante o render. Com o efeito, o navegador chegava a
  // PINTAR a lista velha antes de o efeito rodar — um piscar de dado
  // desatualizado a cada `router.refresh()`.
  const [contatosSemDono, setContatosSemDono] = useEstadoDaProp(contatosSemDonoIniciais);
  const [contatosComDono, setContatosComDono] = useEstadoDaProp<ContatoComDono[]>(contatosComDonoIniciais);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ inseridos: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Mesma pergunta que a funcao faz no banco ("existe negocio aberto deste
  // contato?"), respondida aqui para a tela poder avisar ANTES do clique. Se as
  // duas divergirem, a tela volta a prometer o que a funcao recusa — entao a
  // condicao e deliberadamente a mesma: negocio com `fechado_em` nulo.
  const funilDoContato = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of negociosAbertos) {
      if (n.contato_id) m.set(n.contato_id, n.pipeline?.nome || "outro funil");
    }
    return m;
  }, [negociosAbertos]);

  /** Dos selecionados no POOL, os que a prospecção de fato vai aceitar. */
  const prontosParaProspeccao = useMemo(
    () => Array.from(selecionados).filter((id) => !funilDoContato.has(id)),
    [selecionados, funilDoContato],
  );

  const [vendedorManual, setVendedorManual] = useState("");
  const [distribuindo, setDistribuindo] = useState(false);
  // reatribuicao de leads que ja tem dono
  const [selComDono, setSelComDono] = useState<Set<string>>(new Set());

  /** O mesmo, para a lista de quem já tem vendedor. Mesma regra de elegibilidade. */
  const prontosComDono = useMemo(
    () => Array.from(selComDono).filter((id) => !funilDoContato.has(id)),
    [selComDono, funilDoContato],
  );
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
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
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

  const [resumoProspeccao, setResumoProspeccao] = useState<{ texto: string; houve: boolean } | null>(null);

  /**
   * O elo que faltava entre a planilha e o Kanban de prospecção.
   *
   * A importação acima grava só em `contatos`. Até aqui, para um lead virar
   * card era preciso abrir o board e clicar "+ Novo Negócio", redigitando
   * tudo — inviável com uma planilha de centenas de linhas.
   *
   * Exige SELEÇÃO, e é de propósito: `distribuirAutomatico` cai na lista
   * inteira quando nada está marcado, mas ali o efeito é reversível (troca um
   * dono). Aqui cada lead vira card E entra numa cadência que vai escrever para
   * o cliente. Mandar a lista inteira por engano não se desfaz com um clique.
   */
  /**
   * Serve as DUAS listas — a do pool e a de quem já tem vendedor.
   *
   * O card sempre nasce sem dono, no pool do SDR; o que muda é que, vindo de
   * uma carteira, `enviar_para_prospeccao` grava `vendedor_origem_id`, e a tela
   * de "Entregar ao vendedor" pré-seleciona essa pessoa quando o SDR qualificar.
   * Sem isso o lead sairia da carteira de alguém e voltaria para o rodízio.
   */
  const enviarParaProspeccao = async (ids: string[], limpar: () => void) => {
    if (ids.length === 0) return;
    setDistribuindo(true);
    setErro(null);
    setResumoProspeccao(null);
    const { data, error } = await createClient().rpc("enviar_para_prospeccao", { p_contato_ids: ids });
    setDistribuindo(false);
    if (error) {
      setErro(error.message);
      return;
    }
    const r = (data ?? {}) as {
      criados?: number; pulados?: number; sem_email?: number;
      inscritos?: number; tem_cadencia?: boolean;
    };
    // Conta o que ACONTECEU, em vez de dizer "pronto!". Um lead pulado ou sem
    // e-mail é informação que muda o que a pessoa faz a seguir.
    const partes = [`${r.criados ?? 0} ${r.criados === 1 ? "lead entrou" : "leads entraram"} na prospecção`];
    if (r.tem_cadencia && (r.inscritos ?? 0) > 0) partes.push(`${r.inscritos} na cadência`);
    if (!r.tem_cadencia) partes.push("sem cadência ativa no funil — ninguém foi inscrito");
    if ((r.sem_email ?? 0) > 0) partes.push(`${r.sem_email} sem e-mail (card criado, fora da cadência)`);
    if ((r.pulados ?? 0) > 0) partes.push(`${r.pulados} já tinha negócio aberto`);
    // O TOM SEGUE O DESFECHO. "0 leads entraram" num alerta verde com ícone de
    // enviado é o que fez alguém procurar no Kanban um card que nunca existiu.
    setResumoProspeccao({ texto: partes.join(" · "), houve: (r.criados ?? 0) > 0 });
    limpar();
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
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  /**
   * Excluir um lead — e tudo que pende dele.
   *
   * Não existia botão nenhum: das sete exclusões do projeto, nenhuma era sobre
   * `contatos` ou `negocios`. Não era permissão — `contatos_delete_admin` já
   * existe no banco e nenhuma chave estrangeira trava.
   *
   * O QUE A CASCATA LEVA, medido em transação revertida antes de escrever isto:
   * apagar o contato apaga os negócios dele, e com eles atividades, propostas,
   * mensagens, anexos, histórico de etapas e solicitações de desconto — zero
   * órfãos, mas também zero volta. Por isso o diálogo abaixo diz isso em vez de
   * um "não dá para desfazer" genérico.
   *
   * O erro volta como STRING para dentro do `Confirmar` — é o contrato dele, e
   * o motivo já está escrito no `PlanosTab`: com `alert()` a falha chegava
   * depois de o diálogo ter fechado.
   */
  const [excluindo, setExcluindo] = useState<{ id: string; nome: string } | null>(null);

  const excluirLead = async (): Promise<string | void> => {
    if (!excluindo) return;
    const id = excluindo.id;
    const { error } = await createClient().from("contatos").delete().eq("id", id);
    if (error) return `Falha ao excluir: ${error.message}`;
    setContatosSemDono((prev) => prev.filter((c) => c.id !== id));
    setContatosComDono((prev) => prev.filter((c) => c.id !== id));
    setSelecionados((prev) => {
      const novo = new Set(prev);
      novo.delete(id);
      return novo;
    });
    setSelComDono((prev) => {
      const novo = new Set(prev);
      novo.delete(id);
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
      <Cartao className="space-y-3">
        <Rotulo className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-acento" /> Importar base de contatos (CSV ou XLSX)
        </Rotulo>
        <p className="text-rotulo text-tinta-suave">
          Colunas reconhecidas: nome, empresa, email, telefone, cargo, cidade, estado, cnpj. Repetidos (por e-mail ou
          CNPJ) — tanto no arquivo quanto já cadastrados — são detectados e mostrados numa prévia antes de gravar.
          Os leads importados entram no pool &quot;sem dono&quot; até serem distribuídos.
        </p>
        {!preview && (
          <label htmlFor="leadstab-1" className="inline-flex items-center gap-2 px-4 py-2.5 text-rotulo font-medium text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl cursor-pointer w-fit foco">
            {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {processando ? progresso || "Processando..." : "Escolher arquivo"}
            <input id="leadstab-1" type="file" accept=".csv,.xlsx" className="foco hidden" onChange={analisarArquivo} disabled={processando} />
          </label>
        )}
        {resultado && (
          <p className="text-rotulo font-medium text-ok flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> {resultado.inseridos} de {resultado.total} contatos importados. O restante foi ignorado (sem nome, duplicados ou já cadastrados).
          </p>
        )}
        {erro && <Alerta tom="risco" icone={AlertTriangle}>{erro}</Alerta>}

        {preview && (
          <div className="border border-fio rounded-2xl overflow-hidden">
            <div className="p-4 bg-recuo border-b border-fio flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-rotulo text-tinta-suave truncate">Prévia — {preview.arquivo}</p>
                <p className="text-rotulo text-tinta-suave">{preview.resumo.total} linhas analisadas</p>
              </div>
              <Botao variante="sutil" tamanho="sm" onClick={() => setPreview(null)} disabled={confirmando} icone={X}>
                Cancelar
              </Botao>
            </div>

            <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <ResumoPill cor="text-ok" bg="bg-ok-fraco" label="Novos" valor={preview.resumo.novos} />
              <ResumoPill cor="text-tinta-suave" bg="bg-recuo" label="Já existem" valor={preview.resumo.existentes} />
              <ResumoPill cor="text-alerta" bg="bg-alerta-fraco" label="Repetidos" valor={preview.resumo.dupArquivo} />
              <ResumoPill cor="text-alerta" bg="bg-alerta-fraco" label="E-mail inválido" valor={preview.resumo.emailInvalido} />
              <ResumoPill cor="text-tinta-suave" bg="bg-recuo" label="Sem nome" valor={preview.resumo.semNome} />
            </div>

            <div className="max-h-72 overflow-y-auto border-t border-fio">
              <table className="w-full text-left text-rotulo">
                <thead className="sticky top-0 bg-superficie">
                  <tr className="border-b border-fio text-tinta-fraca uppercase text-rotulo">
                    <th className="p-2 w-10">Linha</th>
                    <th className="p-2">Nome</th>
                    <th className="p-2">Empresa</th>
                    <th className="p-2">E-mail / CNPJ</th>
                    <th className="p-2">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-fio">
                  {preview.classificadas.slice(0, 300).map((l) => (
                    <tr key={l._linha} className={l._status === "novo" ? "" : "opacity-70"}>
                      <td className="p-2 text-tinta-fraca">{l._linha}</td>
                      <td className="p-2 font-medium text-tinta">{l.nome || <span className="text-risco">—</span>}</td>
                      <td className="p-2 text-tinta-suave">{l.empresa || "—"}</td>
                      <td className="p-2 text-tinta-suave">{l.email || l.cnpj || "—"}</td>
                      <td className="p-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-rotulo ${COR_STATUS[l._status]}`}>
                          {(l._status === "email_invalido" || l._status === "dup_arquivo") && <AlertTriangle className="h-3 w-3" />}
                          {rotuloStatus(l._status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.classificadas.length > 300 && (
                <p className="p-2 text-rotulo text-tinta-fraca text-center">Mostrando as primeiras 300 de {preview.classificadas.length} linhas.</p>
              )}
            </div>

            <div className="p-4 border-t border-fio flex items-center justify-end gap-2">
              <Botao
                variante="primario"
                onClick={confirmarImportacao}
                disabled={confirmando || preview.resumo.novos === 0}
                icone={confirmando ? Loader2 : CheckCircle2}
              >
                {confirmando ? progresso || "Importando..." : preview.resumo.novos === 0 ? "Nada novo para importar" : `Importar ${preview.resumo.novos} novos`}
              </Botao>
            </div>
          </div>
        )}
      </Cartao>

      <Cartao preenchimento="nenhum" className="overflow-hidden">
        <div className="p-5 border-b border-fio flex flex-wrap items-center justify-between gap-3">
          <div>
            <Rotulo className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-alerta" /> Leads sem dono ({contatosSemDono.length})
            </Rotulo>
            <p className="text-rotulo text-tinta-suave">
              {selecionados.size} selecionados
              {teto !== undefined && contatosSemDono.length >= teto && (
                <span className="font-medium text-alerta">
                  {" · "}mostrando os {teto} mais recentes; distribua estes e recarregue para ver o resto
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Selecao aria-label="Vendedor que vai receber os leads selecionados" value={vendedorManual} onChange={(e) => setVendedorManual(e.target.value)}>
              <option value="">Escolher vendedor...</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </Selecao>
            <Botao
              tamanho="sm"
              onClick={distribuirManual}
              disabled={!vendedorManual || selecionados.size === 0 || distribuindo}
            >
              Atribuir selecionados
            </Botao>
            <Botao
              tamanho="sm"
              onClick={distribuirAutomatico}
              disabled={distribuindo || contatosSemDono.length === 0}
              icone={distribuindo ? Loader2 : Shuffle}
            >
              Distribuir automático (round-robin)
            </Botao>
            {/* O primário é este: distribuir manda o lead para um vendedor
                trabalhar na mão; prospecção põe o SDR para tocar. */}
            <Botao
              variante="primario"
              tamanho="sm"
              onClick={() => void enviarParaProspeccao(prontosParaProspeccao, () => setSelecionados(new Set()))}
              // Conta os ELEGÍVEIS, e não os selecionados: com todos já em
              // outro funil, o botão fica desligado em vez de prometer um
              // envio que a função vai recusar em silêncio.
              disabled={distribuindo || prontosParaProspeccao.length === 0}
              icone={distribuindo ? Loader2 : Send}
              title={
                selecionados.size > 0 && prontosParaProspeccao.length === 0
                  ? "Todos os selecionados já têm negócio aberto — a prospecção não aceita lead que já está em um funil."
                  : undefined
              }
            >
              Enviar {prontosParaProspeccao.length > 0 ? prontosParaProspeccao.length : ""} para prospecção
            </Botao>
          </div>
        </div>
        {/* Um aviso ANTES do clique, quando a seleção inteira é inelegível.
            É o caso que mandou alguém procurar no Kanban um card que a função
            nunca chegou a criar. */}
        {selecionados.size > 0 && prontosParaProspeccao.length === 0 && (
          <div className="px-4 pb-3">
            <Alerta tom="alerta" icone={AlertTriangle} titulo="Nenhum destes pode ir para a prospecção">
              {selecionados.size === 1 ? "O lead selecionado já tem" : "Os leads selecionados já têm"} negócio
              aberto em outro funil. A prospecção é para lead frio: se o SDR abrisse um card aqui, ele mandaria
              a mensagem de primeiro contato para alguém que um vendedor já está atendendo.
            </Alerta>
          </div>
        )}
        {resumoProspeccao && (
          <div className="px-4 pb-3">
            <Alerta
              tom={resumoProspeccao.houve ? "ok" : "alerta"}
              icone={resumoProspeccao.houve ? Send : AlertTriangle}
            >
              {resumoProspeccao.texto}
            </Alerta>
          </div>
        )}
        <div className="max-h-105 overflow-y-auto">
          <table className="w-full text-left text-rotulo">
            <thead className="sticky top-0 bg-superficie">
              <tr className="border-b border-fio text-tinta-fraca uppercase text-rotulo">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    className="foco"
                    checked={contatosSemDono.length > 0 && selecionados.size === contatosSemDono.length}
                    onChange={selecionarTodosPool}
                    title="Selecionar todos"
                  />
                </th>
                <th className="p-3">Nome</th>
                <th className="p-3">Empresa</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Origem</th>
                <th className="p-3 w-10"><span className="sr-only">Excluir</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fio">
              {contatosSemDono.map((c) => (
                <tr key={c.id} className="hover:bg-recuo">
                  <td className="p-3"><input className="foco" type="checkbox" checked={selecionados.has(c.id)} onChange={() => alternarSelecao(c.id)} /></td>
                  <td className="p-3 font-medium text-tinta">{c.nome}</td>
                  <td className="p-3 text-tinta-suave">{c.empresa || "—"}</td>
                  <td className="p-3 text-tinta-suave">{c.email || "—"}</td>
                  <td className="p-3 text-tinta-fraca capitalize">
                    {funilDoContato.has(c.id) ? (
                      <Selo tom="neutro">já em {funilDoContato.get(c.id)}</Selo>
                    ) : (
                      c.origem
                    )}
                  </td>
                  <td className="p-3">
                    <Botao
                      variante="sutil"
                      tamanho="sm"
                      onClick={() => setExcluindo({ id: c.id, nome: c.nome })}
                      aria-label={`Excluir o lead ${c.nome}`}
                      icone={Trash2}
                    />
                  </td>
                </tr>
              ))}
              {contatosSemDono.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <Vazio icone={Users2} titulo="Nenhum lead sem dono">
                      Importe uma base acima ou aguarde novos leads — eles caem aqui antes de ir para um vendedor.
                    </Vazio>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Cartao>

      <Cartao preenchimento="nenhum" className="overflow-hidden">
        <div className="p-5 border-b border-fio space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Rotulo className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-acento" /> Leads com vendedor ({comDonoFiltrados.length})
        </Rotulo>
              <p className="text-rotulo text-tinta-suave">{selComDono.size} selecionados · reatribua ou devolva ao pool</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tinta-fraca" />
              <Entrada
                aria-label="Buscar leads por nome, empresa ou e-mail"
                value={buscaComDono}
                onChange={(e) => setBuscaComDono(e.target.value)}
                placeholder="Buscar nome/empresa/e-mail…"
                className="pl-8 w-56"
              />
            </div>
            <Selecao aria-label="Filtrar leads por vendedor" value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)}>
              <option value="all">Todos os vendedores</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </Selecao>
            <div className="flex-1" />
            <Selecao aria-label="Passar os leads selecionados para outro vendedor" value={novoResp} onChange={(e) => setNovoResp(e.target.value)}>
              <option value="">Passar para...</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </Selecao>
            <Botao
              variante="primario"
              tamanho="sm"
              onClick={() => reatribuir(false)}
              disabled={reatribuindo || selComDono.size === 0 || !novoResp}
              icone={reatribuindo ? Loader2 : undefined}
            >
              Reatribuir
            </Botao>
            <Botao tamanho="sm" onClick={() => reatribuir(true)} disabled={reatribuindo || selComDono.size === 0}>
              Devolver ao pool
            </Botao>
            {/* O card nasce no pool do SDR, mas guardando de quem era o lead:
                quando o SDR qualificar e clicar em "Entregar ao vendedor",
                esta pessoa já vem escolhida. Sem isso o lead sairia de uma
                carteira e voltaria para o rodízio. */}
            <Botao
              tamanho="sm"
              icone={distribuindo ? Loader2 : Send}
              onClick={() => void enviarParaProspeccao(prontosComDono, () => setSelComDono(new Set()))}
              disabled={distribuindo || prontosComDono.length === 0}
              title={
                selComDono.size > 0 && prontosComDono.length === 0
                  ? "Todos os selecionados já têm negócio aberto — a prospecção não aceita lead que já está em um funil."
                  : "O card vai para o pool do SDR e volta para o mesmo vendedor na entrega."
              }
            >
              Enviar {prontosComDono.length > 0 ? prontosComDono.length : ""} para prospecção
            </Botao>
          </div>
        </div>
        {selComDono.size > 0 && prontosComDono.length === 0 && (
          <div className="px-4 pb-3">
            <Alerta tom="alerta" icone={AlertTriangle} titulo="Nenhum destes pode ir para a prospecção">
              {selComDono.size === 1 ? "O lead selecionado já tem" : "Os leads selecionados já têm"} negócio
              aberto. A prospecção é para lead frio: se o SDR abrisse um card aqui, ele mandaria a mensagem
              de primeiro contato para alguém que já está sendo atendido.
            </Alerta>
          </div>
        )}
        <div className="max-h-105 overflow-y-auto">
          <table className="w-full text-left text-rotulo">
            <thead className="sticky top-0 bg-superficie">
              <tr className="border-b border-fio text-tinta-fraca uppercase text-rotulo">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    className="foco"
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
            <tbody className="divide-y divide-fio">
              {comDonoFiltrados.map((c) => (
                <tr key={c.id} className="hover:bg-recuo">
                  <td className="p-3"><input className="foco" type="checkbox" checked={selComDono.has(c.id)} onChange={() => alternarSelComDono(c.id)} /></td>
                  <td className="p-3 font-medium text-tinta">{c.nome}</td>
                  <td className="p-3 text-tinta-suave">{c.empresa || "—"}</td>
                  <td className="p-3 text-acento font-medium">
                    <span className="flex items-center gap-2 flex-wrap">
                      {c.responsavel?.nome || "—"}
                      {/* Mesmo selo da outra lista, pelo mesmo motivo: dizer
                          ANTES do clique por que este lead não vai entrar. */}
                      {funilDoContato.has(c.id) && (
                        <Selo tom="neutro">já em {funilDoContato.get(c.id)}</Selo>
                      )}
                    </span>
                  </td>
                  <td className="p-3">
                    <Botao
                      variante="sutil"
                      tamanho="sm"
                      onClick={() => setExcluindo({ id: c.id, nome: c.nome })}
                      aria-label={`Excluir o lead ${c.nome}`}
                      icone={Trash2}
                    />
                  </td>
                </tr>
              ))}
              {comDonoFiltrados.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <Vazio icone={Search} titulo="Nenhum lead neste filtro">
                      Tente outro vendedor ou limpe a busca.
                    </Vazio>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Cartao>

      <Confirmar
        aberto={!!excluindo}
        titulo="Excluir lead"
        rotuloConfirmar="Excluir lead"
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={excluirLead}
        descricao={
          <>
            <strong className="font-medium text-tinta">{excluindo?.nome}</strong> sai da base, e
            junto vão os negócios dele — com as atividades, propostas, mensagens, anexos e o
            histórico de etapas de cada um. Não dá para desfazer.
          </>
        }
      />
    </div>
  );
}

function ResumoPill({ cor, bg, label, valor }: { cor: string; bg: string; label: string; valor: number }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${bg}`}>
      <p className={`text-titulo font-medium ${cor}`}>{valor}</p>
      <p className="text-rotulo font-medium text-tinta-suave">{label}</p>
    </div>
  );
}
