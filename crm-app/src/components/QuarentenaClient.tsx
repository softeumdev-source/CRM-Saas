"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Info,
  Mail,
  MessageCircle,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { formatarDataHora } from "@/lib/atividades";
import type { Tables } from "@/lib/supabase/types";
import { Alerta, Botao, Cartao, Entrada, Rotulo, Selecao, Selo, Vazio } from "@/components/ui";

/**
 * As mensagens que o CRM recebeu e não soube de quem eram.
 *
 * **A tela é de metadados, e isso é de propósito** — não uma limitação a
 * disfarçar. A tabela não tem coluna de corpo porque e-mail que não casa com
 * negócio nenhum nunca tem o conteúdo lido: é essa propriedade que impede o
 * CRM de virar espelho da caixa pessoal de quem sincroniza. O corpo é buscado
 * no provedor no instante em que alguém diz a qual negócio a mensagem pertence.
 *
 * Duas linguagens diferentes para os dois motivos, porque são decisões
 * diferentes:
 * - **ambíguo** — o resolver já reduziu a 2 ou 3 candidatos e empatou. A
 *   escolha é entre eles, num clique.
 * - **sem negócio** — o contato existe e não tem card aberto. Aí é procurar.
 */

type Linha = Tables<"mensagens_sem_negocio"> & {
  resolvido?: { id: string; titulo: string | null } | null;
};

type NegocioOpcao = {
  id: string;
  titulo: string | null;
  contato: { nome: string | null; empresa: string | null } | null;
};

type Candidato = { id: string; titulo: string };

/** `candidatos` é `jsonb`: veio do banco, então é validado antes de virar tela. */
function candidatosDe(valor: unknown): Candidato[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((c) =>
    c && typeof c === "object" && typeof (c as Candidato).id === "string"
      ? [{ id: (c as Candidato).id, titulo: String((c as Candidato).titulo ?? "sem título") }]
      : [],
  );
}

export function QuarentenaClient({
  mensagensIniciais,
  negocios,
  souAdmin = false,
}: {
  mensagensIniciais: Linha[];
  negocios: NegocioOpcao[];
  souAdmin?: boolean;
}) {
  const [mensagens, setMensagens] = useState<Linha[]>(mensagensIniciais);
  const [verResolvidas, setVerResolvidas] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await createClient()
      .from("mensagens_sem_negocio")
      .select("*, resolvido:negocios(id, titulo)")
      .order("recebida_em", { ascending: false, nullsFirst: false })
      .order("criado_em", { ascending: false })
      .limit(200);
    if (data) setMensagens(data as Linha[]);
  }, []);

  useSincronizacao(carregar, {
    canal: "quarentena",
    tabelas: [{ tabela: "mensagens_sem_negocio" }],
  });

  const pendentes = useMemo(() => mensagens.filter((m) => !m.resolvido_negocio_id), [mensagens]);
  const resolvidas = useMemo(() => mensagens.filter((m) => m.resolvido_negocio_id), [mensagens]);
  const lista = verResolvidas ? resolvidas : pendentes;

  return (
    <div className="max-w-leitura mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
      {/* O número é o maior tipo da tela, e nada compete com ele: quantas
          conversas o CRM está segurando sem saber de quem são. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-rotulo text-tinta-suave">Mensagens não identificadas</p>
          <p className="text-display font-semibold text-tinta tabular leading-none mt-1">
            {pendentes.length}
          </p>
          <p className="text-corpo text-tinta-suave mt-1.5 max-w-[54ch]">
            {pendentes.length === 0
              ? "Nada esperando decisão."
              : "O contato é conhecido, mas o CRM não soube a qual negócio a conversa pertence — e chutar pararia a cadência do card errado."}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-recuo p-1">
          {[
            { v: false, r: "Esperando", n: pendentes.length },
            { v: true, r: "Resolvidas", n: resolvidas.length },
          ].map((a) => (
            <button
              key={a.r}
              onClick={() => setVerResolvidas(a.v)}
              aria-current={verResolvidas === a.v ? "true" : undefined}
              className={`foco flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-rotulo font-medium transition-colors duration-150 ease-out ${
                verResolvidas === a.v
                  ? "bg-superficie text-acento shadow-xs"
                  : "text-tinta-suave hover:text-tinta"
              }`}
            >
              {a.r}
              <span className="text-tinta-fraca tabular">{a.n}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Medido: `mensagens_sem_negocio_select` e "mesmo tenant E (admin OU a
          caixa e minha)", e a linha de WhatsApp tem `usuario_id` NULO — o
          numero e da empresa, nao de uma pessoa. Consequencia: quem nao e admin
          **nunca ve** a quarentena de WhatsApp. Dizer isso e o que separa uma
          lista recortada de uma lista que parece completa e nao esta. */}
      {!souAdmin && (
        <Alerta tom="neutro" icone={Info} titulo="Você está vendo só a sua caixa">
          Esta lista traz as mensagens que chegaram na caixa de e-mail conectada a você. As de
          WhatsApp ficam com o admin, porque o número é da empresa e não tem dono de caixa.
        </Alerta>
      )}

      <Cartao preenchimento="nenhum" className="overflow-hidden">
        {lista.length === 0 ? (
          <Vazio icone={Inbox} titulo={verResolvidas ? "Nada resolvido ainda" : "Caixa limpa"}>
            {verResolvidas
              ? "As mensagens que você associar a um negócio ficam listadas aqui."
              : "Toda resposta que chegou foi para o card certo. Uma mensagem cai aqui quando o contato tem mais de um negócio aberto e o desempate empata de verdade."}
          </Vazio>
        ) : (
          lista.map((m) => (
            <ItemDaQuarentena key={m.id} linha={m} negocios={negocios} aoResolver={carregar} />
          ))
        )}
      </Cartao>
    </div>
  );
}

function ItemDaQuarentena({
  linha,
  negocios,
  aoResolver,
}: {
  linha: Linha;
  negocios: NegocioOpcao[];
  aoResolver: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState("");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const candidatos = candidatosDe(linha.candidatos);
  const email = linha.canal === "email";
  const resolvida = !!linha.resolvido_negocio_id;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = q
      ? negocios.filter((n) =>
          [n.titulo, n.contato?.nome, n.contato?.empresa]
            .filter(Boolean)
            .some((t) => t!.toLowerCase().includes(q)),
        )
      : negocios;
    return lista.slice(0, 50);
  }, [busca, negocios]);

  const resolver = useCallback(
    async (negocioId: string) => {
      setEnviando(true);
      setErro(null);
      try {
        const r = await fetch("/api/quarentena/resolver", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: linha.id, negocioId }),
        });
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErro(dados?.error || "Não foi possível associar.");
          return;
        }
        // O corpo pode não ter vindo, e a tela DIZ isso em vez de deixar a
        // pessoa descobrir sozinha ao abrir o card e achar "(sem conteúdo)".
        if (dados?.semCorpo) setAviso(dados.semCorpo);
        else setAberto(false);
        aoResolver();
      } catch {
        setErro("Sem conexão. Nada foi associado.");
      } finally {
        setEnviando(false);
      }
    },
    [linha.id, aoResolver],
  );

  return (
    <div className="border-b border-fio last:border-b-0">
      <button
        onClick={() => !resolvida && setAberto((v) => !v)}
        aria-expanded={resolvida ? undefined : aberto}
        disabled={resolvida}
        className={`foco flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out ${
          resolvida ? "cursor-default" : "hover:bg-recuo"
        }`}
      >
        <span className="mt-0.5 shrink-0 text-tinta-fraca" aria-hidden>
          {email ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-corpo font-semibold text-tinta">{linha.remetente}</span>
            {resolvida ? (
              <Selo tom="ok" icone={CheckCircle2}>
                {linha.resolvido?.titulo || "associada"}
              </Selo>
            ) : linha.motivo === "ambiguo" ? (
              <Selo tom="alerta">{candidatos.length} negócios empatados</Selo>
            ) : (
              <Selo tom="neutro">sem negócio aberto</Selo>
            )}
          </span>
          <span className="mt-0.5 block truncate text-rotulo text-tinta-suave">
            {linha.assunto || (email ? "(sem assunto)" : "mensagem de WhatsApp")}
          </span>
        </span>

        <time className="shrink-0 text-rotulo text-tinta-fraca tabular">
          {formatarDataHora(linha.recebida_em || linha.criado_em)}
        </time>
      </button>

      {aberto && !resolvida && (
        <div className="border-t border-fio bg-recuo px-4 py-4">
          {/* Dito ANTES da escolha, e não depois: muda o que a pessoa espera
              encontrar no card. */}
          <p className="text-rotulo text-tinta-suave mb-3 max-w-[62ch]">
            {email
              ? "O corpo não foi guardado — e-mail que não casa com um negócio nunca tem o conteúdo lido. Ele é buscado no Gmail agora, ao associar."
              : "O WhatsApp não permite reler uma mensagem já entregue, então esta vai para o card com os metadados apenas."}
          </p>

          {candidatos.length > 0 && (
            <div className="mb-4">
              <Rotulo>Os que empataram</Rotulo>
              <div className="mt-2 flex flex-wrap gap-2">
                {candidatos.map((c) => (
                  <Botao
                    key={c.id}
                    variante="secundario"
                    tamanho="sm"
                    disabled={enviando}
                    onClick={() => void resolver(c.id)}
                    // `secundario` é `bg-recuo`, e este painel TAMBÉM é
                    // `bg-recuo`: medido no screenshot, os botões sumiam no
                    // fundo e viravam texto em negrito. Sobem um degrau da
                    // rampa, como os campos ao lado já fazem — e ganham o fio,
                    // que é a linguagem de elevação do projeto (craft R10).
                    className="bg-superficie border border-fio hover:bg-recuo"
                  >
                    {c.titulo}
                  </Botao>
                ))}
              </div>
            </div>
          )}

          <Rotulo>{candidatos.length > 0 ? "Ou escolher outro" : "Escolher o negócio"}</Rotulo>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta-fraca"
                aria-hidden
              />
              <Entrada
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Filtrar por título, contato ou empresa"
                aria-label="Filtrar negócios"
                className="pl-9"
              />
            </div>
            <Selecao
              value={escolhido}
              onChange={(e) => setEscolhido(e.target.value)}
              aria-label="Negócio de destino"
              className="sm:w-72"
            >
              <option value="">Selecione…</option>
              {filtrados.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.titulo || "sem título"}
                  {n.contato?.empresa ? ` · ${n.contato.empresa}` : ""}
                </option>
              ))}
            </Selecao>
            <Botao
              variante="primario"
              disabled={!escolhido || enviando}
              carregando={enviando}
              onClick={() => void resolver(escolhido)}
            >
              Associar
            </Botao>
          </div>

          {busca.trim() && filtrados.length === 0 && (
            <p className="mt-2 text-rotulo text-tinta-fraca">Nenhum negócio aberto com esse texto.</p>
          )}

          {aviso && (
            <Alerta tom="alerta" icone={AlertTriangle} titulo="Associada, mas sem o corpo" className="mt-3">
              {aviso}
            </Alerta>
          )}
          {erro && (
            <Alerta tom="risco" icone={AlertTriangle} titulo="Não foi associada" className="mt-3">
              {erro}
            </Alerta>
          )}
        </div>
      )}
    </div>
  );
}
