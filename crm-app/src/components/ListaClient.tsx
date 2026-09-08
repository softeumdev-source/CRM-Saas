"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { LIMITE_DA_BUSCA, MINIMO_PARA_BUSCAR, buscarNegociosPorTermo } from "@/lib/board";
import { NENHUM_FUNIL, etapasParaEscolher, type Pipeline } from "@/lib/pipelines";
import { atrasoDaCascata } from "@/components/ui";
import type { EtapaPipeline, NegocioComRelacoes } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, formatarMoeda, localDoContato } from "@/lib/types";
import {
  descreverPrazo,
  diasSemContato,
  estaAtrasada,
  formatarDataHora,
  proximaAtividade,
  temAtividadeHoje,
} from "@/lib/atividades";

type Ordem = "recentes" | "sem_contato" | "valor" | "proxima_acao";

export function ListaClient({
  funis,
  negocios: negociosIniciais,
  total,
  lote,
  etapas,
  buscaInicial,
}: {
  /** TODOS os funis, não só o de vendas — ver o comentário da page. */
  funis: Pipeline[];
  negocios: NegocioComRelacoes[];
  /** Quantos existem nos funis, não quantos vieram. */
  total: number;
  lote: number;
  /** As etapas dos dois funis. `pipeline_id` diz de qual é cada uma. */
  etapas: EtapaPipeline[];
  /** Termo vindo de `?q=` — o board manda a pessoa para cá já procurando. */
  buscaInicial: string;
}) {
  const [negocios, setNegocios] = useEstadoDaProp(negociosIniciais);
  // Só o valor INICIAL: a partir daí quem manda é o campo. Sincronizar com a
  // URL a cada tecla trocaria uma busca por um histórico de navegação cheio de
  // entradas que ninguém quer percorrer com o botão "voltar".
  const [busca, setBusca] = useState(buscaInicial);
  const [etapaFiltro, setEtapaFiltro] = useState("all");
  const [funilFiltro, setFunilFiltro] = useState("todos");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [carregados, setCarregados] = useEstadoDaProp(negociosIniciais.length);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * A última resposta do banco, CARIMBADA COM A PERGUNTA que a produziu.
   *
   * A chave é `termo|funil` porque as duas mudam o resultado: trocar de funil
   * com o mesmo texto digitado tem que refazer a consulta, e sem o funil na
   * chave a tela continuaria mostrando o resultado do funil anterior.
   *
   * Guardar a pergunta junto é o que deixa "estou buscando" e "estou no lote
   * paginado" serem DERIVADOS, em vez de mais dois estados para manter em dia —
   * e é o que o ESLint exige aqui: zerar estado no corpo de um efeito é uma
   * renderização em cascata para calcular algo que já dá para ler.
   *
   * `null` e `[]` dizem coisas opostas: o primeiro é "estou mostrando o lote
   * paginado", o segundo é "o banco procurou e não achou ninguém". Com o mesmo
   * valor para os dois, apagar a busca deixaria a tela em branco.
   */
  const [resultadoDaBusca, setResultadoDaBusca] = useState<{
    chave: string;
    itens: NegocioComRelacoes[];
  } | null>(null);

  // `.in()` com array vazio é sintaxe inválida no PostgREST: derrubaria a tela
  // em vez de mostrá-la vazia.
  const idsDosFunis = useMemo(
    () => (funis.length ? funis.map((f) => f.id) : [NENHUM_FUNIL]),
    [funis],
  );

  /** O funil que a busca deve percorrer. `null` = os dois. */
  const funilDaBusca = funilFiltro === "todos" ? null : funilFiltro;

  const termoBusca = busca.trim();
  const buscaAtiva = termoBusca.length >= MINIMO_PARA_BUSCAR;
  const chaveDaBusca = `${termoBusca}|${funilDaBusca ?? ""}`;
  /**
   * As linhas que a busca achou, ou `null` se a tela está no lote paginado.
   *
   * O resultado ANTERIOR fica visível enquanto o novo não chega — limpar a cada
   * tecla faria a tabela piscar vazia entre "Silv" e "Silva", e tabela vazia lê
   * como resposta.
   */
  const achados = buscaAtiva ? (resultadoDaBusca?.itens ?? null) : null;
  const buscando = buscaAtiva && resultadoDaBusca?.chave !== chaveDaBusca;

  const buscarAte = useCallback(
    (limite: number) =>
      createClient()
        .from("negocios")
        .select(SELECT_NEGOCIO_COMPLETO)
        .in("pipeline_id", idsDosFunis)
        .order("criado_em", { ascending: false })
        .range(0, limite - 1),
    [idsDosFunis],
  );

  const recarregar = useCallback(async () => {
    const { data } = await buscarAte(Math.max(carregados, lote));
    if (data) setNegocios(data as unknown as NegocioComRelacoes[]);
  }, [buscarAte, carregados, lote, setNegocios]);

  const carregarMais = useCallback(async () => {
    const alvo = carregados + lote;
    setCarregando(true);
    const { data, error } = await buscarAte(alvo);
    setCarregando(false);
    if (error) {
      setErro(`Não foi possível carregar mais: ${error.message}`);
      return;
    }
    const lista = (data as unknown as NegocioComRelacoes[]) || [];
    setNegocios(lista);
    setCarregados(lista.length);
  }, [buscarAte, carregados, lote, setNegocios, setCarregados]);

  // Sem `atividades`: o gatilho `atividades_tocar_negocio` já toca `negocios`
  // em tudo que esta tela mostra. Ver o comentário no KanbanPageClient.
  // O `filtro: pipeline_id=eq.…` saiu junto com o recorte de um funil só. Ele
  // existia para esta tela não recarregar quando alguém mexesse no OUTRO funil;
  // agora os dois estão nela, e um lead de prospecção que muda de etapa é
  // notícia daqui. A RLS continua sendo quem decide o que volta na consulta.
  useSincronizacao(recarregar, {
    canal: "lista-negocios",
    tabelas: [{ tabela: "negocios" }, { tabela: "contatos" }],
  });

  /**
   * A BUSCA PASSA A IR AO BANCO.
   *
   * Era `Array.filter` sobre os 200 primeiros — e a própria tela já admitia
   * isso numa linha do cabeçalho ("os filtros trabalham sobre estes 200").
   * Dizer que a resposta é parcial é melhor do que esconder, mas continua sendo
   * uma busca que responde "não existe" quando a verdade é "não procurei ali".
   *
   * Os 300ms separam "digitou" de "está digitando", e o `cancelado` fecha a
   * corrida: sem ele a resposta de "Sil" poderia chegar depois da de "Silva" e
   * repintar a tabela com o resultado errado.
   */
  useEffect(() => {
    if (!buscaAtiva) return;
    // Já é a resposta desta pergunta: não repete a consulta a cada render.
    if (resultadoDaBusca?.chave === chaveDaBusca) return;
    let cancelado = false;
    const relogio = setTimeout(async () => {
      const { data, error } = await buscarNegociosPorTermo(
        createClient(),
        termoBusca,
        funilDaBusca,
      );
      if (cancelado) return;
      if (error) {
        setErro(`Não foi possível buscar: ${error.message}`);
        return;
      }
      setResultadoDaBusca({
        chave: chaveDaBusca,
        itens: (data as unknown as NegocioComRelacoes[]) || [],
      });
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(relogio);
    };
  }, [buscaAtiva, chaveDaBusca, termoBusca, funilDaBusca, resultadoDaBusca]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    // Com resposta do banco, o termo JÁ foi aplicado lá — sobre a base inteira
    // e com mais campos do que este filtro alcança (telefone e WhatsApp, e os
    // números comparados só por dígitos). Reaplicá-lo aqui só poderia TIRAR da
    // tabela um lead que o banco achou.
    const base = achados ?? negocios;
    const aplicarTermoLocal = achados === null;

    const lista = base.filter((n) => {
      const matchBusca =
        !aplicarTermoLocal ||
        termo === "" ||
        n.titulo.toLowerCase().includes(termo) ||
        (n.contato?.nome || "").toLowerCase().includes(termo) ||
        (n.contato?.empresa || "").toLowerCase().includes(termo) ||
        (n.contato?.email || "").toLowerCase().includes(termo) ||
        (n.contato?.cnpj || "").toLowerCase().includes(termo);
      const matchEtapa = etapaFiltro === "all" || n.etapa_id === etapaFiltro;
      const matchFunil = funilFiltro === "todos" || n.pipeline_id === funilFiltro;
      return matchBusca && matchEtapa && matchFunil;
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
  }, [negocios, achados, busca, etapaFiltro, funilFiltro, ordem]);

  /** O que o recorte visível soma. É o número grande do cabeçalho. */
  const totalFiltrado = useMemo(
    () => filtrados.reduce((soma, n) => soma + (n.valor || 0), 0),
    [filtrados],
  );

  return (
    <div className="max-w-pagina mx-auto w-full px-4 sm:px-6 py-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="min-w-0">
          {/* O ASSUNTO desta tela é quanto dinheiro está no recorte que a
              pessoa acabou de filtrar — não o texto "Lista de Negócios".
              Antes o título era o maior elemento (20px) e o total não existia
              em lugar nenhum: dava para filtrar por etapa e não saber quanto
              aquilo somava.

              É o mesmo idioma da tela de quarentena — rótulo miúdo, número
              grande, apoio embaixo — e é o que dá a esta tela um elemento com
              permissão de ser grande (craft R4). */}
          <h1 className="text-rotulo text-tinta-suave">Lista de negócios</h1>
          <p className="text-display font-semibold text-tinta tabular leading-none mt-1">
            {formatarMoeda(totalFiltrado)}
          </p>
          <p className="text-rotulo text-tinta-suave mt-1.5">
            {filtrados.length} {filtrados.length === 1 ? "negócio" : "negócios"}
            {/* A frase mudou porque o fato mudou.

                Ela dizia "os filtros trabalham sobre estes 200" — era honesta
                sobre uma busca que só alcançava o lote carregado, mas a busca
                continuava respondendo "não existe" para quem estava na posição
                300. Agora a busca vai ao banco: enquanto há texto digitado, o
                que a tela mostra é o resultado da base INTEIRA, e o aviso de
                lote paginado não se aplica. Ele volta assim que a busca sai. */}
            {buscando ? (
              <> · procurando na base inteira…</>
            ) : achados !== null ? (
              <>
                {" "}
                · encontrados na base inteira
                {achados.length >= LIMITE_DA_BUSCA ? ` (teto de ${LIMITE_DA_BUSCA} — refine o texto)` : ""}
              </>
            ) : carregados < total ? (
              <> · mostrando {carregados} de {total}, e os filtros trabalham sobre estes {carregados}</>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-tinta-fraca" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome, empresa, e-mail, CNPJ ou telefone..."
              className="foco pl-9 pr-3 py-2 text-rotulo bg-superficie border border-fio rounded-xl w-64"
            />
          </div>
          {/* O filtro de funil só aparece quando há mais de um — com um funil
              só ele seria um controle que não escolhe nada. */}
          {funis.length > 1 && (
            <select
              value={funilFiltro}
              onChange={(e) => {
                setFunilFiltro(e.target.value);
                // A etapa escolhida pertence a UM funil. Trocar de funil sem
                // limpar a etapa deixaria um filtro impossível ligado — nenhuma
                // linha casaria, e a tela diria "nenhum negócio" sem motivo
                // visível.
                setEtapaFiltro("all");
              }}
              className="foco px-3 py-2 text-rotulo bg-superficie border border-fio rounded-xl"
            >
              <option value="todos">Todos os funis</option>
              {funis.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          )}
          <select
            value={etapaFiltro}
            onChange={(e) => setEtapaFiltro(e.target.value)}
            className="foco px-3 py-2 text-rotulo bg-superficie border border-fio rounded-xl"
          >
            <option value="all">Todas as etapas</option>
            {/* Agrupado por funil, e não numa lista corrida: os dois funis têm
                a MESMA lista de nomes (migration 20260903170000), então sem o
                `optgroup` a pessoa veria "Novo Lead" duas vezes sem nada que
                dissesse qual é qual. */}
            {funis.map((f) => {
              const doFunil = etapasParaEscolher(etapas.filter((et) => et.pipeline_id === f.id));
              if (doFunil.length === 0) return null;
              return (
                <optgroup key={f.id} label={f.nome}>
                  {doFunil.map((et) => (
                    <option key={et.id} value={et.id}>{et.nome}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="foco px-3 py-2 text-rotulo bg-superficie border border-fio rounded-xl"
          >
            <option value="recentes">Mais recentes</option>
            <option value="sem_contato">Mais tempo sem contato</option>
            <option value="proxima_acao">Próxima ação</option>
            <option value="valor">Maior valor</option>
          </select>
        </div>
      </div>

      <div className="bg-superficie rounded-2xl border border-fio shadow-cartao overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-rotulo">
            <thead>
              <tr className="border-b border-fio text-tinta-fraca uppercase tracking-wider font-medium text-rotulo">
                <th className="p-4">Empresa / Contato</th>
                <th className="p-4">Etapa</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Último contato</th>
                <th className="p-4">Próxima ação</th>
                <th className="p-4">Vendedor</th>
                {/* Ao lado do CNPJ de proposito: os dois sao dado de CADASTRO.
                    Enfiada logo depois de "Empresa / Contato", a cidade
                    empurraria Etapa, Valor e Proxima acao para a direita — as
                    colunas que a pessoa varre primeiro. O cartao ja rola na
                    horizontal (`overflow-x-auto` na linha 181), entao a coluna
                    nova nao empurra a pagina. */}
                <th className="p-4">Cidade</th>
                <th className="p-4">CNPJ</th>
                <th className="p-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fio">
              {filtrados.map((n, i) => {
                const hoje = temAtividadeHoje(n);
                const dias = diasSemContato(n);
                const proxima = proximaAtividade(n.atividades_pendentes);
                const atrasada = estaAtrasada(proxima?.data_agendada);
                return (
                  <tr
                    key={n.id}
                    style={atrasoDaCascata(i)}
                    className="surge hover:bg-recuo transition-colors"
                  >
                    <td className="p-4">
                      <p className="font-semibold text-tinta flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${hoje ? "bg-ok" : "bg-alerta"}`} />
                        {n.contato?.empresa || n.contato?.nome}
                      </p>
                      <p className="text-rotulo text-tinta-suave pl-3.5">{n.contato?.nome}</p>
                    </td>
                    {/* A pilula era `background: cor + "22"` — hex com alfa
                        concatenado. Isso pinta um VEU CLARO da cor da etapa, e
                        sobre o fundo escuro do tema escuro o resultado clareia
                        em vez de tingir: a pilula ficava mais clara que o
                        cartao em volta. O mesmo defeito ja tinha sido corrigido
                        no cabecalho da coluna do kanban.

                        E o conserto e o mesmo de la, o que tambem resolve
                        consistencia: PONTO na cor da etapa + nome em tinta
                        normal. A cor continua dizendo qual etapa e, sem
                        precisar de um fundo que so funciona num tema. */}
                    <td className="p-4">
                      <span className="flex items-center gap-1.5 text-tinta">
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: n.etapa?.cor || "var(--cor-acento)" }}
                        />
                        {n.etapa?.nome}
                      </span>
                    </td>
                    {/* "R$ 0,00" nao e o preco, e "ainda nao foi precificado" —
                        a mesma licao que ja tinha tirado o zero do card do
                        board, e que aqui tinha ficado. */}
                    <td className="p-4">
                      {n.valor ? (
                        <span className="font-medium text-tinta tabular">{formatarMoeda(n.valor)}</span>
                      ) : (
                        <span className="text-tinta-fraca">a definir</span>
                      )}
                    </td>
                    <td className="p-4">
                      {hoje ? (
                        <span className="flex items-center gap-1 font-semibold text-ok">
                          <CheckCircle2 className="h-3 w-3" /> Hoje
                        </span>
                      ) : dias === null ? (
                        <span className="text-alerta font-medium">Nunca</span>
                      ) : (
                        <span className={dias >= 7 ? "text-alerta font-medium" : "text-tinta-suave"}>
                          há {dias} {dias === 1 ? "dia" : "dias"}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {proxima ? (
                        <span className={`font-medium ${atrasada ? "text-risco" : "text-tinta-suave"}`}>
                          {atrasada && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                          {formatarDataHora(proxima.data_agendada)} ({descreverPrazo(proxima.data_agendada)})
                        </span>
                      ) : (
                        <span className="text-alerta font-medium">Sem agendamento</span>
                      )}
                    </td>
                    <td className="p-4 font-medium text-tinta-suave">{n.responsavel?.nome || "Sem dono"}</td>
                    <td className="p-4 text-tinta-suave whitespace-nowrap">
                      {localDoContato(n.contato?.cidade, n.contato?.estado)}
                    </td>
                    <td className="p-4">
                      {/* "OK" VERDE aparecia em quase toda linha, e sinal que
                          nao varia nao e sinal — e ruido que treina a pessoa a
                          ignorar a coluna. A informacao FICA (o "OK" continua
                          escrito, a regra 14 do DESIGN.md), mas recua para
                          tinta fraca. Quem grita e a falta, que e a unica
                          notícia: sem CNPJ nao sai proposta. */}
                      {n.contato?.cnpj ? (
                        <span className="text-tinta-fraca">OK</span>
                      ) : (
                        <span className="font-medium text-alerta">Faltando</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {/* Era um botao tingido em CADA linha: sete retangulos
                          indigo identicos numa coluna, dizendo sete vezes a
                          mesma coisa. Vira link — a acao continua no mesmo
                          lugar e com o mesmo texto, mas para de competir com o
                          nome da empresa, que e o que a pessoa esta lendo. */}
                      <Link
                        href={`/negocios/${n.id}`}
                        className="foco rounded-lg text-rotulo font-medium text-acento hover:underline whitespace-nowrap"
                      >
                        Ver detalhes
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-tinta-fraca">
                    {carregados < total
                      ? `Nenhum negócio encontrado entre os ${carregados} carregados — carregue mais abaixo.`
                      : "Nenhum negócio encontrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {erro && (
          <p className="m-4 text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">
            {erro}
          </p>
        )}

        {carregados < total && (
          <div className="p-4 border-t border-fio flex items-center justify-center">
            <button
              onClick={() => void carregarMais()}
              disabled={carregando}
              className="foco px-4 py-2 text-rotulo font-semibold text-tinta-suave hover:text-acento bg-recuo border border-fio rounded-xl transition-colors duration-150 ease-out disabled:opacity-60"
            >
              {carregando ? "Carregando…" : `Carregar mais ${Math.min(lote, total - carregados)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
