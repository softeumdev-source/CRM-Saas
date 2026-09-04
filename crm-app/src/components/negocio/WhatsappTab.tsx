"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDownLeft, Check, Clock, ExternalLink, MessageCircle, Send, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import { formatarDataHora } from "@/lib/atividades";
import { descreverRestante, janelaDeResposta } from "@/lib/whatsapp/janela";
import { quandoAconteceu, rotuloDoDia } from "@/lib/conversa";
import type { Mensagem } from "@/lib/cadencia";
import type { NegocioComRelacoes } from "@/lib/types";
import type { Tables } from "@/lib/supabase/types";
import { Alerta, AreaTexto, Botao, Selo, Vazio } from "@/components/ui";
import { BotaoSugerirHorarios } from "@/components/agenda/BotaoSugerirHorarios";
import { linkDoWhatsapp, numeroParaWhatsapp } from "@/lib/contato";
import { registrarMensagemManual } from "@/lib/whatsapp/registroManual";
import { ListaDeAnexos } from "@/components/negocio/ListaDeAnexos";
import { usarRespostasLidas } from "@/components/negocio/usarRespostasLidas";

/**
 * O WhatsApp do cliente, dentro do card.
 *
 * A forma é a oposta da aba de e-mail, e isso é o ponto: aqui é **fluxo de
 * bolhas** — sem cabeçalho por mensagem, sem thread, quem falou se sabe pelo
 * lado. Lá é pilha de documentos. Antes os dois usavam o mesmo balão e eram
 * indistinguíveis.
 *
 * O compositor NÃO é uma caixa de texto comum. Fora da janela de 24h a Meta só
 * aceita template aprovado, e um textarea ali seria um convite a violar a
 * política — que custa a nota de qualidade do número. Então a caixa de texto
 * simplesmente NÃO É RENDERIZADA quando a janela está fechada; no lugar dela
 * aparece o motivo e o caminho válido.
 */

const POR_PAGINA = 80;

type AnexoLinha = Tables<"anexos">;

type EstadoDoCanal = { configurado: boolean; pausado: boolean; motivo: string | null };

export function WhatsappTab({ negocio }: { negocio: NegocioComRelacoes }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  // `null` = ainda carregando. O compositor mostra o estado neutro nesse caso,
  // que já é o certo — melhor do que oferecer caixa de texto e descobrir depois
  // que o número está pausado.
  const [whatsapp, setWhatsapp] = useState<EstadoDoCanal | null>(null);
  const [anexos, setAnexos] = useState<AnexoLinha[]>([]);
  const [teto, setTeto] = useState(POR_PAGINA);
  const [temMais, setTemMais] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Abrir a conversa é o que conta como ler a resposta — não abrir a
  // Cadência, que é onde este efeito morava antes de as abas se separarem.
  usarRespostasLidas(negocio.id, negocio.respostas_nao_lidas);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    // Um a mais que o teto revela que existe mais, sem uma consulta de
    // contagem. O corte silencioso em 100 mensagens era o defeito de antes.
    const [msg, anx] = await Promise.all([
      supabase
        .from("mensagens")
        .select("*")
        .eq("negocio_id", negocio.id)
        .eq("canal", "whatsapp")
        // Quando a mensagem ACONTECEU, não quando o CRM sincronizou.
        .order("recebida_em", { ascending: false, nullsFirst: false })
        .order("criado_em", { ascending: false })
        .limit(teto + 1),
      supabase.from("anexos").select("*").eq("negocio_id", negocio.id),
    ]);

    // Fora do `Promise.all` porque a falha aqui não pode derrubar a conversa:
    // sem esta linha o compositor fica em `null` e mostra o estado neutro.
    const { data: cfg } = await supabase
      .from("whatsapp_config")
      .select("pausado, pausado_motivo, numero_id")
      .maybeSingle();
    setWhatsapp({
      configurado: !!cfg?.numero_id,
      pausado: !!cfg?.pausado,
      motivo: cfg?.pausado_motivo ?? null,
    });

    if (msg.error) {
      setErroCarga(`Não foi possível carregar as mensagens: ${msg.error.message}`);
      return;
    }
    const lista = (msg.data || []) as unknown as Mensagem[];
    setTemMais(lista.length > teto);
    // A conversa lê de cima para baixo; a consulta vem do mais novo.
    setMensagens(lista.slice(0, teto).sort((a, b) => quandoAconteceu(a) - quandoAconteceu(b)));
    if (anx.data) setAnexos(anx.data);
    setErroCarga(null);
  }, [negocio.id, teto]);

  useSincronizacao(carregar, {
    canal: `whatsapp-${negocio.id}`,
    tabelas: [
      { tabela: "mensagens", filtro: `negocio_id=eq.${negocio.id}` },
      { tabela: "anexos", filtro: `negocio_id=eq.${negocio.id}` },
    ],
    carregarAoMontar: true,
  });

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

  // A janela ANDA. Sem este relógio, `acabando` é calculado uma vez e nunca
  // mais: a pessoa vê "faltam 12min", digita, e clica cinco minutos depois de a
  // janela ter fechado — recebendo um 409 que a interface poderia ter evitado.
  //
  // `useSyncExternalStore` porque o relógio é exatamente o que ele resolve: um
  // valor que só existe no cliente. O terceiro argumento é o retrato do
  // SERVIDOR, e devolver `null` ali é o que impede a falha de hidratação.
  const minuto = useSyncExternalStore(
    (avisar) => {
      const t = setInterval(avisar, 60_000);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
  const janela =
    minuto === null
      ? null
      : janelaDeResposta(negocio.ultima_resposta_whatsapp_em, new Date(minuto * 60_000));

  // A chave de idempotência é da MENSAGEM, não do clique: dois cliques no mesmo
  // texto mandam a mesma chave, o segundo insert bate na trava e o cliente não
  // recebe duas vezes. Zerada quando o envio dá certo E quando o texto muda —
  // texto diferente é mensagem diferente.
  const chave = useRef<string | null>(null);

  const enviar = useCallback(async () => {
    setEnviando(true);
    setErro(null);
    chave.current ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/whatsapp/responder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ negocioId: negocio.id, texto: rascunho, chave: chave.current }),
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) {
        // O rascunho NÃO é apagado: perder o texto digitado por causa de uma
        // janela que fechou é o pior desfecho possível desta tela.
        setErro(dados?.error || "Não foi possível enviar.");
        return;
      }
      setRascunho("");
      chave.current = null;
      void carregar();
    } catch {
      setErro("Sem conexão. O texto continua aqui.");
    } finally {
      setEnviando(false);
    }
  }, [negocio.id, rascunho, carregar]);

  return (
    <div className="flex flex-col gap-3">
      {erroCarga && <Alerta tom="risco" titulo="Erro ao carregar">{erroCarga}</Alerta>}
      <VistaDoWhatsapp
        mensagens={mensagens}
        anexosPorMensagem={anexosPorMensagem}
        temMais={temMais}
        aoCarregarMais={() => setTeto((t) => t + POR_PAGINA)}
      />
      {/* `janela` é nula até a montagem — ver o comentário do relógio acima. */}
      {janela && (
        <Compositor
          negocio={negocio}
          janela={janela}
          whatsapp={whatsapp}
          rascunho={rascunho}
          aoMudar={(v) => {
            setRascunho(v);
            if (erro) setErro(null);
            // Editar o texto faz dele OUTRA mensagem, e a chave tem que
            // acompanhar. Sem isto: a primeira tentativa grava, a resposta se
            // perde na rede, a pessoa corrige o texto e clica de novo — e a
            // rota, vendo a mesma chave, devolve "já enviada". A tela limparia
            // o rascunho e a pessoa acreditaria que o texto CORRIGIDO saiu.
            // Saiu o antigo.
            chave.current = null;
          }}
          enviando={enviando}
          erro={erro}
          aoEnviar={enviar}
          aoRegistrado={carregar}
        />
      )}
    </div>
  );
}

/**
 * A vista, separada de quem busca os dados — pelo mesmo motivo da aba de
 * e-mail: sem isto não há como olhar a forma da tela neste ambiente, onde a
 * saída para o Supabase está bloqueada.
 */
export function VistaDoWhatsapp({
  mensagens,
  anexosPorMensagem,
  temMais = false,
  aoCarregarMais,
}: {
  mensagens: Mensagem[];
  anexosPorMensagem: Map<string, AnexoLinha[]>;
  temMais?: boolean;
  aoCarregarMais?: () => void;
}) {
  return (
      <div className="flex min-h-[26rem] flex-col gap-1 rounded-2xl border border-fio bg-recuo p-4">
        {temMais && (
          <div className="mb-2 flex justify-center">
            <Botao variante="secundario" tamanho="sm" onClick={aoCarregarMais}>
              Carregar mais antigas
            </Botao>
          </div>
        )}

        {mensagens.length === 0 ? (
          <Vazio icone={MessageCircle} titulo="Nenhuma mensagem de WhatsApp">
            As mensagens trocadas com este contato aparecem aqui assim que o WhatsApp estiver
            conectado. O histórico segue o negócio: passar do SDR para o vendedor não perde nada.
          </Vazio>
        ) : (
          mensagens.map((m, i) => {
            const anterior = mensagens[i - 1];
            const diaMudou =
              !anterior ||
              new Date(quandoAconteceu(anterior)).toDateString() !==
                new Date(quandoAconteceu(m)).toDateString();
            return (
              <div key={m.id}>
                {diaMudou && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-fio" />
                    <span className="text-rotulo text-tinta-fraca">{rotuloDoDia(quandoAconteceu(m))}</span>
                    <div className="h-px flex-1 bg-fio" />
                  </div>
                )}
                <Balao mensagem={m} anexos={anexosPorMensagem.get(m.id) || []} />
              </div>
            );
          })
        )}
      </div>
  );
}

function Balao({ mensagem, anexos }: { mensagem: Mensagem; anexos: AnexoLinha[] }) {
  const entrada = mensagem.direcao === "entrada";

  return (
    <div className={`flex ${entrada ? "justify-start" : "justify-end"}`}>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-3 py-2",
          entrada ? "rounded-tl-sm bg-superficie border border-fio" : "rounded-tr-sm bg-acento-fraco",
        ].join(" ")}
      >
        {/* Conteúdo de fora entra sempre como 'texto' e é escapado pelo React;
            'html' só existe para o que NÓS escrevemos. É fronteira de
            segurança, não estilo. */}
        {mensagem.corpo_formato === "html" ? (
          <div
            className="text-corpo text-tinta [&_a]:text-acento [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: mensagem.corpo }}
          />
        ) : (
          <p className="whitespace-pre-wrap text-corpo text-tinta">{mensagem.corpo}</p>
        )}

        {anexos.length > 0 && <ListaDeAnexos anexos={anexos} className="mt-2" />}

        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-rotulo text-tinta-fraca tabular">
            {formatarDataHora(new Date(quandoAconteceu(mensagem)).toISOString())}
          </span>
          {mensagem.automatica ? <Selo tom="neutro">automática</Selo> : null}
          {mensagem.status === "falhou" ? <Selo tom="risco">falhou</Selo> : null}
          {mensagem.status === "aguardando_aprovacao" ? (
            <Selo tom="alerta">aguardando aprovação</Selo>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Compositor({
  negocio,
  janela,
  whatsapp,
  rascunho,
  aoMudar,
  enviando,
  erro,
  aoEnviar,
  aoRegistrado,
}: {
  negocio: NegocioComRelacoes;
  janela: ReturnType<typeof janelaDeResposta>;
  whatsapp: { configurado: boolean; pausado: boolean; motivo: string | null } | null;
  rascunho: string;
  aoMudar: (v: string) => void;
  enviando: boolean;
  erro: string | null;
  aoEnviar: () => void;
  aoRegistrado: () => void;
}) {
  const [abriu, setAbriu] = useState(false);
  const [modoRecebida, setModoRecebida] = useState(false);
  const [recebida, setRecebida] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [erroManual, setErroManual] = useState<string | null>(null);

  const numero = negocio.contato?.whatsapp || negocio.contato?.telefone || "";
  const numeroOk = !!numeroParaWhatsapp(numero);
  const link = linkDoWhatsapp(numero, rascunho);
  // `link` nulo COM número válido só acontece por texto longo demais para uma
  // URL. Separar os dois casos importa: um se resolve no cadastro, o outro
  // encurtando a mensagem, e "não deu" não diz qual é.
  const textoLongoDemais = numeroOk && !!rascunho.trim() && !link;

  /**
   * O envio pela API só aparece quando ele REALMENTE pode sair: canal
   * configurado, não pausado, e dentro da janela de 24h. Fora disso o botão
   * sumiria de qualquer jeito na rota — mostrá-lo seria oferecer um caminho
   * que devolve erro.
   */
  const podeApi = !!whatsapp?.configurado && !whatsapp.pausado && janela.aberta;

  const registrar = async (direcao: "saida" | "entrada", corpo: string) => {
    setRegistrando(true);
    setErroManual(null);
    const r = await registrarMensagemManual({
      tenantId: negocio.tenant_id,
      negocioId: negocio.id,
      contatoId: negocio.contato?.id ?? null,
      destino: numero,
      corpo,
      direcao,
    });
    setRegistrando(false);
    if (!r.ok) {
      setErroManual(r.erro);
      return;
    }
    if (direcao === "saida") {
      aoMudar("");
      setAbriu(false);
    } else {
      setRecebida("");
      setModoRecebida(false);
    }
    aoRegistrado();
  };

  if (!numeroOk) {
    return (
      <Alerta tom="alerta" icone={ShieldAlert} titulo="Este contato não tem WhatsApp">
        Sem número não há para onde escrever — e um número sem DDD abriria conversa com outra
        pessoa. Preencha o WhatsApp na aba Geral.
      </Alerta>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {whatsapp?.pausado && (
        <Alerta tom="alerta" icone={ShieldAlert} titulo="Envio automático pausado">
          {whatsapp.motivo || "O envio por WhatsApp está pausado."} O envio pela mão continua
          funcionando: ele sai do seu WhatsApp, não do sistema.
        </Alerta>
      )}

      {podeApi && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Selo tom={janela.acabando ? "alerta" : "ok"} icone={Clock}>
            Janela aberta · faltam {descreverRestante(janela.restanteMs)}
          </Selo>
        </div>
      )}

      <AreaTexto
        rows={3}
        value={rascunho}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="Escreva a mensagem…"
        aria-label="Mensagem de WhatsApp"
        disabled={enviando || registrando}
      />

      {/* O motivo da recusa fica NA TELA, e o rascunho continua no textarea.
          Quase todo erro aqui é recuperável, e apagar o texto junto seria punir
          a pessoa por uma coisa que não foi ela que fez. */}
      {(erro || erroManual) && (
        <Alerta tom="risco" icone={ShieldAlert} titulo="A mensagem não foi enviada">
          {erro || erroManual}
        </Alerta>
      )}

      {textoLongoDemais && (
        <Alerta tom="alerta" titulo="Texto longo demais para abrir já preenchido">
          O WhatsApp recebe o texto pela URL, e esta ficou grande demais — o navegador cortaria a
          mensagem no meio sem avisar. Encurte um pouco, ou abra a conversa e cole lá.
        </Alerta>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BotaoSugerirHorarios
            desabilitado={enviando || registrando}
            aoSugerir={(texto) =>
              aoMudar(rascunho.trim() ? `${rascunho.trimEnd()}\n\n${texto}` : texto)
            }
          />
          <Botao
            tamanho="sm"
            variante="secundario"
            icone={ArrowDownLeft}
            disabled={registrando}
            onClick={() => setModoRecebida((v) => !v)}
            aria-expanded={modoRecebida}
          >
            Registrar resposta dele
          </Botao>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* O caminho PRINCIPAL, e de propósito: abrir o WhatsApp com o texto
              pronto é grátis; a API cobra ~R$ 0,32 por mensagem fria. */}
          <a
            href={link || "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!link}
            onClick={(e) => {
              if (!link) {
                e.preventDefault();
                return;
              }
              setAbriu(true);
            }}
            className={[
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-rotulo font-medium",
              "transition-colors duration-150 ease-out",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
              link
                ? "bg-acento text-white hover:bg-acento/90"
                : "bg-recuo text-tinta-fraca pointer-events-none",
            ].join(" ")}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir no WhatsApp
          </a>
          {podeApi && (
            <Botao
              variante="secundario"
              tamanho="sm"
              icone={Send}
              disabled={!rascunho.trim() || enviando || registrando}
              onClick={aoEnviar}
              title="Sai pela API da Meta — esta mensagem é cobrada."
            >
              {enviando ? "Enviando…" : "Enviar pela API"}
            </Botao>
          )}
        </div>
      </div>

      {/* PERGUNTA, não marca sozinho. Abrir o WhatsApp não é prova de que a
          mensagem saiu: a pessoa pode fechar a aba, mudar de ideia, ou o número
          pode estar errado. Um registro automático encheria o histórico de
          mensagens que nunca existiram — e a cadência confiaria nele. */}
      {abriu && (
        <div className="rounded-2xl border border-acento/40 bg-acento-fraco p-3 flex flex-wrap items-center gap-2">
          <p className="text-rotulo text-tinta flex-1 min-w-0">
            Abri o WhatsApp com este texto. Você enviou?
          </p>
          <Botao
            variante="primario"
            tamanho="sm"
            icone={Check}
            carregando={registrando}
            disabled={!rascunho.trim()}
            onClick={() => void registrar("saida", rascunho)}
          >
            Registrar como enviada
          </Botao>
          <Botao tamanho="sm" variante="secundario" onClick={() => setAbriu(false)}>
            Não enviei
          </Botao>
        </div>
      )}

      {/* O outro lado da conversa. É este registro que acende o selo azul no
          Kanban e faz a cadência PARAR — sem ele, o robô continuaria mandando
          e-mail para alguém que já está falando com você no WhatsApp. */}
      {modoRecebida && (
        <div className="rounded-2xl border border-fio bg-recuo p-3 flex flex-col gap-2">
          <p className="text-rotulo text-tinta-suave">
            Cole aqui o que o cliente respondeu. Isso marca o lead como respondido no Kanban e
            interrompe a cadência de e-mails.
          </p>
          <AreaTexto
            rows={2}
            value={recebida}
            onChange={(e) => setRecebida(e.target.value)}
            placeholder="O que ele escreveu…"
            aria-label="Resposta recebida do cliente"
            disabled={registrando}
          />
          <div className="flex justify-end gap-2">
            <Botao tamanho="sm" variante="secundario" onClick={() => setModoRecebida(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              tamanho="sm"
              icone={Check}
              carregando={registrando}
              disabled={!recebida.trim()}
              onClick={() => void registrar("entrada", recebida)}
            >
              Registrar resposta
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
