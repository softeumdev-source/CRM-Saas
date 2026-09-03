"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Mail, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { formatarDataHora } from "@/lib/atividades";
import { agruparEmThreads, quandoAconteceu, separarCitacao, trecho, type Thread } from "@/lib/conversa";
import type { Mensagem } from "@/lib/cadencia";
import type { NegocioComRelacoes } from "@/lib/types";
import type { Tables } from "@/lib/supabase/types";
import { Alerta, Botao, Ponto, Selo, Vazio } from "@/components/ui";
import { ListaDeAnexos } from "@/components/negocio/ListaDeAnexos";
import { usarRespostasLidas } from "@/components/negocio/usarRespostasLidas";

/**
 * A caixa de e-mail do cliente, dentro do card.
 *
 * A forma aqui é o ponto, e não um detalhe: antes os dois canais usavam o MESMO
 * balão, na mesma pilha, com o mesmo alinhamento esquerda/direita — o e-mail era
 * um WhatsApp com outro rótulo. Agora e-mail é uma **pilha de documentos**
 * (blocos de largura total, cada um com seu cabeçalho) e o WhatsApp é um
 * **fluxo de bolhas**. Dá para separar os dois de longe, borrados.
 *
 * Duas colunas, como qualquer inbox: as conversas à esquerda, a aberta à
 * direita. No celular vira uma coluna só, e a conversa cobre a lista.
 */

const POR_PAGINA = 50;

type AnexoLinha = Tables<"anexos">;

export function EmailTab({ negocio }: { negocio: NegocioComRelacoes }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [anexos, setAnexos] = useState<AnexoLinha[]>([]);
  const [teto, setTeto] = useState(POR_PAGINA);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Abrir a conversa é o que conta como ler a resposta — não abrir a
  // Cadência, que é onde este efeito morava antes de as abas se separarem.
  usarRespostasLidas(negocio.id, negocio.respostas_nao_lidas);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    // Pede UM a mais que o teto: é assim que dá para saber que existe mais sem
    // uma segunda consulta de contagem. Antes a tela cortava em 100 e não
    // dizia nada — a conversa simplesmente terminava.
    const [msg, anx] = await Promise.all([
      supabase
        .from("mensagens")
        .select("*")
        .eq("negocio_id", negocio.id)
        .eq("canal", "email")
        // A ordem certa é a de quando a mensagem ACONTECEU, não a de quando o
        // CRM sincronizou. Uma sincronização traz várias de uma vez, com
        // `criado_em` quase idêntico; é o índice `mensagens_conversa_idx` que
        // existe exatamente para esta ordenação.
        .order("recebida_em", { ascending: false, nullsFirst: false })
        .order("criado_em", { ascending: false })
        .limit(teto + 1),
      supabase.from("anexos").select("*").eq("negocio_id", negocio.id),
    ]);

    // O supabase-js NÃO lança em falha de rede: devolve `{ data: null, error }`.
    // Sem olhar o erro, uma conexão caída chegaria aqui como "nenhum e-mail",
    // que é uma afirmação sobre a caixa do cliente, não sobre a rede.
    if (msg.error) {
      setErro(`Não foi possível carregar os e-mails: ${msg.error.message}`);
      setCarregando(false);
      return;
    }
    const lista = (msg.data || []) as unknown as Mensagem[];
    setTemMais(lista.length > teto);
    setMensagens(lista.slice(0, teto));
    if (anx.data) setAnexos(anx.data);
    setErro(null);
    setCarregando(false);
  }, [negocio.id, teto]);

  useSincronizacao(carregar, {
    canal: `email-${negocio.id}`,
    tabelas: [
      { tabela: "mensagens", filtro: `negocio_id=eq.${negocio.id}` },
      { tabela: "anexos", filtro: `negocio_id=eq.${negocio.id}` },
    ],
    carregarAoMontar: true,
  });

  const threads = useMemo(() => agruparEmThreads(mensagens), [mensagens]);
  const anexosPorMensagem = useMemo(() => {
    const mapa = new Map<string, AnexoLinha[]>();
    for (const a of anexos) {
      if (!a.mensagem_id) continue;
      const atual = mapa.get(a.mensagem_id);
      if (atual) atual.push(a);
      else mapa.set(a.mensagem_id, [a]);
    }
    return mapa;
  }, [anexos]);

  if (erro) return <Alerta tom="risco" titulo="Erro ao carregar">{erro}</Alerta>;

  return (
    <VistaDeEmail
      threads={threads}
      anexosPorMensagem={anexosPorMensagem}
      contato={negocio.contato?.nome || negocio.contato?.email || "o cliente"}
      emailDoContato={negocio.contato?.email || null}
      carregando={carregando}
      temMais={temMais}
      aoCarregarMais={() => setTeto((t) => t + POR_PAGINA)}
    />
  );
}

/**
 * A vista, separada de quem busca os dados.
 *
 * Não é cerimônia: sem esta separação não há como olhar a tela neste ambiente —
 * a saída para o Supabase está bloqueada, então um componente que busca os
 * próprios dados renderiza vazio e não dá para provar nada sobre a forma dele.
 * Com a vista pura, os mesmos componentes de verdade rodam com dados
 * fabricados.
 */
export function VistaDeEmail({
  threads,
  anexosPorMensagem,
  contato,
  emailDoContato,
  carregando = false,
  temMais = false,
  aoCarregarMais,
}: {
  threads: Thread[];
  anexosPorMensagem: Map<string, AnexoLinha[]>;
  contato: string;
  emailDoContato: string | null;
  carregando?: boolean;
  temMais?: boolean;
  aoCarregarMais?: () => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);

  // A thread aberta acompanha a lista: se ela sumiu (filtro, recarga), abre a
  // primeira em vez de mostrar uma coluna direita vazia sem explicação.
  const selecionada = threads.find((t) => t.id === aberta) ?? threads[0] ?? null;

  if (!carregando && threads.length === 0) {
    return (
      <Vazio icone={Mail} titulo="Nenhum e-mail com este cliente">
        Os e-mails trocados aparecem aqui assim que a caixa comercial estiver conectada em
        Admin → Integrações. O histórico segue o negócio: passar do SDR para o vendedor não perde
        nada.
      </Vazio>
    );
  }

  return (
    <div className="flex min-h-[32rem] overflow-hidden rounded-2xl border border-fio bg-superficie">
      {/* ------------------------------------------------------------------ */}
      {/* Coluna esquerda: as conversas                                       */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`w-full shrink-0 flex-col border-fio md:flex md:w-[19rem] md:border-r ${
          selecionada && aberta ? "hidden" : "flex"
        }`}
      >
        <div className="flex items-baseline justify-between gap-2 border-b border-fio px-4 py-3">
          <h3 className="text-corpo font-semibold text-tinta">Conversas</h3>
          <span className="text-rotulo text-tinta-fraca tabular">{threads.length}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {threads.map((t) => (
            <LinhaDaThread
              key={t.id}
              thread={t}
              ativa={selecionada?.id === t.id}
              temAnexo={t.mensagens.some((m) => anexosPorMensagem.has(m.id))}
              aoAbrir={() => setAberta(t.id)}
            />
          ))}

          {temMais && (
            <div className="p-3">
              <Botao variante="secundario" tamanho="sm" className="w-full" onClick={aoCarregarMais}>
                Carregar mais antigas
              </Botao>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Coluna direita: a conversa aberta                                   */}
      {/* ------------------------------------------------------------------ */}
      {selecionada && (
        <div className={`min-w-0 flex-1 flex-col ${aberta ? "flex" : "hidden md:flex"}`}>
          <div className="border-b border-fio px-5 py-4">
            <button
              onClick={() => setAberta(null)}
              className="foco mb-2 -ml-1 flex items-center gap-1 rounded-lg px-1 text-rotulo font-medium text-tinta-suave hover:text-acento md:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Conversas
            </button>
            {/* O maior tipo desta coluna, e nada compete com ele. */}
            <h2 className="text-titulo font-semibold text-tinta">{selecionada.assunto}</h2>
            <p className="mt-0.5 text-rotulo text-tinta-suave">
              {selecionada.mensagens.length}{" "}
              {selecionada.mensagens.length === 1 ? "mensagem" : "mensagens"} ·{" "}
              {emailDoContato || "sem e-mail no contato"}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {selecionada.mensagens.map((m, i) => (
              <MensagemDeEmail
                key={m.id}
                mensagem={m}
                anexos={anexosPorMensagem.get(m.id) || []}
                contato={contato}
                // A última abre; as anteriores ficam numa linha só. É o que
                // impede uma thread de dez respostas de virar uma parede.
                abertaPorPadrao={i === selecionada.mensagens.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaDaThread({
  thread,
  ativa,
  temAnexo,
  aoAbrir,
}: {
  thread: Thread;
  ativa: boolean;
  temAnexo: boolean;
  aoAbrir: () => void;
}) {
  const ultima = thread.mensagens[thread.mensagens.length - 1];

  return (
    <button
      onClick={aoAbrir}
      aria-current={ativa ? "true" : undefined}
      className={`foco w-full border-b border-fio px-4 py-3 text-left transition-colors duration-150 ease-out ${
        ativa ? "bg-acento-fraco" : "hover:bg-recuo"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        {/* Não lida com PESO, não com cor: uma lista de trinta linhas tingidas
            fica gritando. O ponto de acento carrega o sinal. */}
        {/* O `truncate` vai no FILHO que tem o texto, não no contêiner flex:
            `text-overflow` não atravessa o flex, e o assunto ficava cortado no
            meio da letra em vez de ganhar reticência. Visto no screenshot. */}
        <span
          className={`flex min-w-0 flex-1 items-center gap-1.5 text-corpo text-tinta ${
            thread.temResposta ? "font-semibold" : "font-normal"
          }`}
        >
          {thread.temResposta && <Ponto tom="info" />}
          <span className="truncate">{thread.assunto}</span>
        </span>
        <span className="shrink-0 text-rotulo text-tinta-fraca tabular">
          {formatarDataHora(new Date(thread.ultimaEm).toISOString())}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-1 text-rotulo text-tinta-suave">{trecho(ultima.corpo)}</p>
      {temAnexo && (
        <span className="mt-1 inline-flex items-center gap-1 text-rotulo text-tinta-fraca">
          <Paperclip className="h-3 w-3" aria-hidden /> anexo
        </span>
      )}
    </button>
  );
}

function MensagemDeEmail({
  mensagem,
  anexos,
  contato,
  abertaPorPadrao,
}: {
  mensagem: Mensagem;
  anexos: AnexoLinha[];
  contato: string;
  abertaPorPadrao: boolean;
}) {
  const [aberta, setAberta] = useState(abertaPorPadrao);
  const [mostrarCitacao, setMostrarCitacao] = useState(false);
  const entrada = mensagem.direcao === "entrada";
  const quem = entrada ? contato : "Softeum";
  const quando = formatarDataHora(new Date(quandoAconteceu(mensagem)).toISOString());

  // Só o corpo NOVO por padrão. A citação é o histórico colado embaixo, e
  // mostrá-la faz toda mensagem parecer a anterior — que é exatamente o que a
  // thread deveria resolver.
  const { corpo, citacao } =
    mensagem.corpo_formato === "html"
      ? { corpo: mensagem.corpo, citacao: null }
      : separarCitacao(mensagem.corpo);

  if (!aberta) {
    return (
      <button
        onClick={() => setAberta(true)}
        className="foco flex w-full items-baseline gap-2 border-b border-fio py-2.5 text-left hover:bg-recuo"
      >
        <span className="shrink-0 text-corpo font-medium text-tinta">{quem}</span>
        <span className="min-w-0 flex-1 truncate text-rotulo text-tinta-suave">
          {trecho(mensagem.corpo, 90)}
        </span>
        <span className="shrink-0 text-rotulo text-tinta-fraca tabular">{quando}</span>
      </button>
    );
  }

  return (
    <article className="border-b border-fio py-4 last:border-b-0">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-corpo font-semibold text-tinta">{quem}</p>
          <p className="text-rotulo text-tinta-fraca">
            {entrada ? "para a caixa comercial" : `para ${contato}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mensagem.status === "falhou" && <Selo tom="risco">falhou</Selo>}
          {mensagem.status === "aguardando_aprovacao" && (
            <Selo tom="alerta">aguardando aprovação</Selo>
          )}
          {mensagem.automatica && <Selo tom="neutro">automática</Selo>}
          <time className="text-rotulo text-tinta-fraca tabular">{quando}</time>
        </div>
      </header>

      {/* `corpo_formato` decide o render, e isto é uma FRONTEIRA DE SEGURANÇA,
          não estilo: 'html' só existe para o que NÓS escrevemos (template, IA,
          humano). Conteúdo que vem de fora entra sempre como 'texto' e é
          escapado pelo React. */}
      {mensagem.corpo_formato === "html" ? (
        <div
          className="text-corpo text-tinta [&_a]:text-acento [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: corpo }}
        />
      ) : (
        <p className="whitespace-pre-wrap text-corpo text-tinta">{corpo}</p>
      )}

      {citacao && (
        <div className="mt-2">
          <button
            onClick={() => setMostrarCitacao((v) => !v)}
            aria-expanded={mostrarCitacao}
            className="foco rounded-md bg-recuo px-2 py-0.5 text-rotulo font-medium text-tinta-fraca hover:text-tinta"
            title={mostrarCitacao ? "Esconder o histórico citado" : "Mostrar o histórico citado"}
          >
            ···
          </button>
          {mostrarCitacao && (
            <p className="mt-2 whitespace-pre-wrap border-l-2 border-fio-forte pl-3 text-corpo text-tinta-suave">
              {citacao}
            </p>
          )}
        </div>
      )}

      {anexos.length > 0 && <ListaDeAnexos anexos={anexos} className="mt-3" />}

      {!abertaPorPadrao && (
        <button
          onClick={() => setAberta(false)}
          className="foco mt-2 inline-flex items-center gap-1 rounded-md text-rotulo font-medium text-tinta-fraca hover:text-tinta"
        >
          <ChevronDown className="h-3 w-3 rotate-180" aria-hidden /> recolher
        </button>
      )}
    </article>
  );
}
