"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Ban, Clock, MessageCircle, Send, ShieldAlert } from "lucide-react";
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
  janela,
  whatsapp,
  rascunho,
  aoMudar,
  enviando,
  erro,
  aoEnviar,
}: {
  janela: ReturnType<typeof janelaDeResposta>;
  whatsapp: { configurado: boolean; pausado: boolean; motivo: string | null } | null;
  rascunho: string;
  aoMudar: (v: string) => void;
  enviando: boolean;
  erro: string | null;
  aoEnviar: () => void;
}) {
  // Precedência deliberada: o canal desligado ganha da janela. Mostrar "janela
  // aberta, escreva aqui" com o número pausado seria mentir.
  if (whatsapp && !whatsapp.configurado) {
    return (
      <Alerta tom="neutro" icone={Ban} titulo="WhatsApp ainda não conectado">
        Falta concluir a conta na Meta (número, verificação do negócio e templates aprovados).
        Enquanto isso a conversa fica só de leitura.
      </Alerta>
    );
  }

  if (whatsapp?.pausado) {
    return (
      <Alerta tom="alerta" icone={ShieldAlert} titulo="Canal pausado">
        {whatsapp.motivo || "O envio por WhatsApp está pausado."} Nada sai daqui enquanto isso.
      </Alerta>
    );
  }

  // Dois estados diferentes, e tratá-los como um só manda a pessoa esperar uma
  // coisa que não vai acontecer. `expiraEm` nulo é o caso "nunca houve
  // conversa": ninguém vai "responder de volta" porque ninguém escreveu ainda.
  if (!janela.aberta) {
    return janela.expiraEm === null ? (
      <Alerta tom="neutro" icone={Clock} titulo="Este cliente ainda não escreveu">
        A caixa de texto só abre depois que ele mandar a primeira mensagem — é a regra da Meta, e é
        o que separa conversa de abordagem. Para dar o primeiro toque, use um modelo aprovado pela
        cadência.
      </Alerta>
    ) : (
      <Alerta tom="alerta" icone={Clock} titulo="A janela de 24 horas está fechada">
        Fora dela a Meta só aceita um modelo aprovado — texto livre aqui derrubaria a nota de
        qualidade do número. Assim que o cliente responder, a caixa de texto volta.
      </Alerta>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Selo tom={janela.acabando ? "alerta" : "ok"} icone={Clock}>
          Janela aberta · faltam {descreverRestante(janela.restanteMs)}
        </Selo>
      </div>
      <AreaTexto
        rows={3}
        value={rascunho}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="Escreva a resposta…"
        aria-label="Resposta por WhatsApp"
        disabled={enviando}
      />
      {/* O motivo da recusa fica NA TELA, e o rascunho continua no textarea.
          Quase todo erro aqui é recuperável — a janela fechou, o canal pausou,
          o teto da hora encheu — e apagar o texto junto seria punir a pessoa
          por uma coisa que não foi ela que fez. */}
      {erro && (
        <Alerta tom="risco" icone={ShieldAlert} titulo="A mensagem não foi enviada">
          {erro}
        </Alerta>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Passa pelo MESMO `aoMudar` do textarea, e não por um setState
            próprio: é esse handler que zera a chave de idempotência. Texto
            diferente é outra mensagem, e a sugestão muda o texto. */}
        <BotaoSugerirHorarios
          desabilitado={enviando}
          aoSugerir={(texto) =>
            aoMudar(rascunho.trim() ? `${rascunho.trimEnd()}\n\n${texto}` : texto)
          }
        />
        <Botao
          variante="primario"
          icone={Send}
          disabled={!rascunho.trim() || enviando}
          onClick={aoEnviar}
        >
          {enviando ? "Enviando…" : "Enviar"}
        </Botao>
      </div>
    </div>
  );
}
