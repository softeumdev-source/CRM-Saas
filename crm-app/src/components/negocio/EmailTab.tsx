"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, Loader2, Mail, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { formatarDataHora } from "@/lib/atividades";
import { agruparEmThreads, quandoAconteceu, separarCitacao, trecho, type Thread } from "@/lib/conversa";
import type { Mensagem } from "@/lib/cadencia";
import type { NegocioComRelacoes } from "@/lib/types";
import type { Tables } from "@/lib/supabase/types";
import { Alerta, Botao, Ponto, Selo, Vazio } from "@/components/ui";
import { ListaDeAnexos } from "@/components/negocio/ListaDeAnexos";
import { CompositorDeEmail } from "@/components/negocio/CompositorDeEmail";

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
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O `limite` entra por parametro, com o `teto` do estado como padrao: quem
  // clica em "carregar mais antigas" precisa buscar JA com o teto novo, e o
  // estado so chegaria neste callback no render seguinte.
  const carregar = useCallback(async (limite: number = teto) => {
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
        .limit(limite + 1),
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
    setTemMais(lista.length > limite);
    setMensagens(lista.slice(0, limite));
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

  /**
   * Aumentar o `teto` sozinho nao busca nada: quem executa `carregar` e a ref
   * guardada dentro de `useSincronizacao`, e o efeito que dispara essa ref nao
   * observa `teto`. Sem esta chamada explicita o clique ficava mudo ate o
   * proximo tique de seguranca do realtime (45s) — o botao parecia quebrado.
   */
  const carregarMais = useCallback(async () => {
    const novoTeto = teto + POR_PAGINA;
    setCarregandoMais(true);
    setTeto(novoTeto);
    try {
      await carregar(novoTeto);
    } finally {
      setCarregandoMais(false);
    }
  }, [carregar, teto]);

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
      carregandoMais={carregandoMais}
      aoCarregarMais={carregarMais}
      compositor={<CompositorDeEmail negocio={negocio} aoEnviado={carregar} />}
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
  carregandoMais = false,
  aoCarregarMais,
  compositor,
}: {
  threads: Thread[];
  anexosPorMensagem: Map<string, AnexoLinha[]>;
  contato: string;
  emailDoContato: string | null;
  carregando?: boolean;
  temMais?: boolean;
  carregandoMais?: boolean;
  aoCarregarMais?: () => void;
  /** Entra por prop para a vista continuar pura — e provável com fixtures. */
  compositor?: ReactNode;
}) {
  const [aberta, setAberta] = useState<string | null>(null);

  // A thread aberta acompanha a lista: se ela sumiu (filtro, recarga), abre a
  // primeira em vez de mostrar uma coluna direita vazia sem explicação.
  const selecionada = threads.find((t) => t.id === aberta) ?? threads[0] ?? null;

  // Zero e-mail NÃO é motivo para esconder o compositor: é justamente quando
  // alguém precisa escrever o primeiro. Antes o estado vazio devolvia só o
  // aviso, e a conversa não tinha como começar de dentro do card.
  // Entre abrir a aba e o Supabase responder, a moldura de duas colunas
  // aparecia com "Conversas" e "0" e nada embaixo — e sem o compositor, que
  // vive dentro da coluna da direita. Isso le como card quebrado, e nao como
  // card carregando. Mesma forma da aba de mensagens.
  if (carregando && threads.length === 0) {
    return (
      <div
        role="status"
        className="flex min-h-128 items-center justify-center gap-2 rounded-2xl border border-fio bg-superficie text-corpo text-tinta-suave"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando e-mails…
      </div>
    );
  }

  if (!carregando && threads.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-fio bg-superficie">
        <div className="px-5 py-6">
          <Vazio icone={Mail} titulo="Nenhum e-mail com este cliente">
            Escreva abaixo para começar. Os e-mails trocados aparecem aqui, agrupados por conversa,
            e o histórico segue o negócio: passar do SDR para o vendedor não perde nada.
          </Vazio>
        </div>
        {compositor}
      </div>
    );
  }

  return (
    <div className="flex min-h-128 overflow-hidden rounded-2xl border border-fio bg-superficie">
      {/* ------------------------------------------------------------------ */}
      {/* Coluna esquerda: as conversas                                       */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`w-full shrink-0 flex-col border-fio md:flex md:w-76 md:border-r ${
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
              <Botao
                variante="secundario"
                tamanho="sm"
                className="w-full"
                carregando={carregandoMais}
                onClick={aoCarregarMais}
              >
                {carregandoMais ? "Carregando…" : "Carregar mais antigas"}
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

          {/* Fora da área que rola: responder não deve exigir chegar ao fim de
              uma thread de trinta mensagens. */}
          {compositor}
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
          {thread.temResposta && (
            <>
              <Ponto tom="info" />
              {/* O `Ponto` e `aria-hidden` e o negrito nao chega a leitor de
                  tela: sem este texto, "o cliente respondeu" existia so como
                  cor e peso. O `sr-only` nao muda um pixel — e
                  `position:absolute`, entao nao vira item do flex e nao soma
                  ao `gap`. */}
              <span className="sr-only">Cliente respondeu.</span>
            </>
          )}
          <span className="truncate">{thread.assunto}</span>
        </span>
        <span className="shrink-0 text-rotulo text-tinta-fraca tabular">
          {formatarDataHora(new Date(thread.ultimaEm).toISOString())}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-1 text-rotulo text-tinta-suave">
        {trecho(ultima.corpo, 120, ultima.corpo_formato === "html")}
      </p>
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
          {trecho(mensagem.corpo, 90, mensagem.corpo_formato === "html")}
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
      {/* `max-w-[70ch]`: o painel da direita cresce com a janela, e sem teto de
          medida o e-mail saia com 130 caracteres por linha numa tela larga.
          Isso e o dobro do que o olho segue sem perder a volta da linha — e o
          texto de um e-mail e a coisa que mais se le nesta tela. */}
      {mensagem.corpo_formato === "html" ? (
        <div
          className="max-w-[70ch] text-corpo text-tinta [&_a]:text-acento [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: corpo }}
        />
      ) : (
        <p className="max-w-[70ch] whitespace-pre-wrap text-corpo text-tinta">{corpo}</p>
      )}

      {citacao && (
        <div className="mt-2">
          <button
            onClick={() => setMostrarCitacao((v) => !v)}
            aria-expanded={mostrarCitacao}
            className="foco rounded-lg bg-recuo px-2 py-0.5 text-rotulo font-medium text-tinta-fraca hover:text-tinta"
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
          className="foco mt-2 inline-flex items-center gap-1 rounded-lg text-rotulo font-medium text-tinta-fraca hover:text-tinta"
        >
          <ChevronDown className="h-3 w-3 rotate-180" aria-hidden /> recolher
        </button>
      )}
    </article>
  );
}
