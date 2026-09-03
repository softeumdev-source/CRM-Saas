"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Ban, Clock, Mail, MessageCircle, Send, ShieldAlert } from "lucide-react";
import { formatarDataHora } from "@/lib/atividades";
import { descreverRestante, janelaDeResposta } from "@/lib/whatsapp/janela";
import type { Mensagem } from "@/lib/cadencia";
import type { NegocioComRelacoes } from "@/lib/types";
import { Abas, Alerta, AreaTexto, Botao, Selo, Vazio, type Aba } from "@/components/ui";

/**
 * A conversa com o cliente, dentro do card: o chat de WhatsApp e a caixa de
 * e-mail, com o histórico preservado quando o negócio passa do SDR para o
 * vendedor — o que é de graça, porque a transferência não toca
 * `mensagens.negocio_id`.
 *
 * O compositor NÃO é uma caixa de texto comum. Fora da janela de 24h a Meta só
 * aceita template aprovado, e um textarea ali seria um convite a violar a
 * política — que custa a nota de qualidade do número. Então a caixa de texto
 * simplesmente NÃO É RENDERIZADA quando a janela está fechada; no lugar dela
 * aparece o motivo e o caminho válido.
 */

type CanalConversa = "whatsapp" | "email";

const ABAS: readonly Aba<CanalConversa>[] = [
  { chave: "whatsapp", rotulo: "WhatsApp" },
  { chave: "email", rotulo: "E-mail" },
];

/**
 * Quando a mensagem ACONTECEU para o cliente — que não é quando a linha foi
 * criada. Uma mensagem pode ficar horas ou dias na fila de aprovação antes de
 * sair, então ordenar por `criado_em` colocaria uma resposta de ontem depois de
 * um envio aprovado hoje de manhã. A ordem e a data exibida têm que sair da
 * MESMA regra, senão a conversa mostra um horário e ordena por outro.
 */
function quandoAconteceu(m: Mensagem): number {
  return new Date(m.recebida_em || m.enviada_em || m.criado_em || 0).getTime();
}

export function Conversa({
  negocio,
  mensagens,
  whatsapp,
  idBase,
  aoEnviar,
}: {
  negocio: NegocioComRelacoes;
  mensagens: Mensagem[];
  /** Estado real do canal. `null` = ainda carregando. */
  whatsapp: { configurado: boolean; pausado: boolean; motivo: string | null } | null;
  idBase: string;
  /** Chamado depois de um envio que deu certo, para o pai recarregar a lista. */
  aoEnviar?: () => void;
}) {
  const [canal, setCanal] = useState<CanalConversa>("whatsapp");
  const [rascunho, setRascunho] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const doCanal = useMemo(
    () =>
      mensagens
        .filter((m) => m.canal === canal)
        // A conversa lê de cima para baixo, ao contrário da fila de aprovação.
        .sort((a, b) => quandoAconteceu(a) - quandoAconteceu(b)),
    [mensagens, canal],
  );

  const contagem = useMemo(
    () => ({
      whatsapp: mensagens.filter((m) => m.canal === "whatsapp").length,
      email: mensagens.filter((m) => m.canal === "email").length,
    }),
    [mensagens],
  );

  // A janela ANDA. Sem este relógio, `acabando` é calculado uma vez e nunca
  // mais: a pessoa vê "faltam 12min", digita, e clica cinco minutos depois de
  // a janela ter fechado — recebendo um 409 que a interface poderia ter
  // evitado. Um minuto de granularidade basta para uma contagem em horas.
  //
  // `useSyncExternalStore` porque o relógio é exatamente o que ele resolve: um
  // valor que **só existe no cliente**. O terceiro argumento é o retrato do
  // SERVIDOR, e devolver `null` ali é o que impede a falha de hidratação —
  // medida no navegador com `useState(() => new Date())`: o servidor
  // renderizava "faltam 5h59" e o cliente hidratava "faltam 5h58" sempre que os
  // dois caíam em minutos diferentes. Intermitente, que é o pior tipo.
  //
  // O retrato é o MINUTO inteiro, não o instante: precisa ser estável entre
  // chamadas (`===`) ou o React entra em laço, e um contador em horas não
  // precisa de mais que isso.
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
  //
  // Criada dentro do handler, e não durante o render: mexer em `ref` no corpo
  // do componente quebra com renderização concorrente, e `randomUUID()` ali
  // daria um valor no servidor e outro na hidratação.
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
      aoEnviar?.();
    } catch {
      setErro("Sem conexão. O texto continua aqui.");
    } finally {
      setEnviando(false);
    }
  }, [negocio.id, rascunho, aoEnviar]);

  return (
    <div className="flex flex-col gap-3">
      <Abas
        abas={ABAS.map((a) => ({ ...a, contagem: contagem[a.chave] }))}
        valor={canal}
        aoTrocar={setCanal}
        idBase={idBase}
      />

      <div className="flex flex-col gap-2 rounded-xl bg-recuo p-3 max-h-[26rem] overflow-y-auto">
        {doCanal.length === 0 ? (
          <Vazio
            icone={canal === "whatsapp" ? MessageCircle : Mail}
            titulo={canal === "whatsapp" ? "Nenhuma mensagem de WhatsApp" : "Nenhum e-mail"}
          >
            {canal === "whatsapp"
              ? "As mensagens trocadas com este contato aparecem aqui assim que o WhatsApp estiver conectado."
              : "Os e-mails trocados com este contato aparecem aqui assim que a caixa do vendedor estiver conectada."}
          </Vazio>
        ) : (
          doCanal.map((m) => <Balao key={m.id} mensagem={m} />)
        )}
      </div>

      {canal === "whatsapp" ? (
        // `janela` é nula até a montagem — ver o comentário do relógio acima.
        janela && (
        <CompositorWhatsapp
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
        )
      ) : (
        <Alerta tom="info" icone={Mail} titulo="Responder por e-mail">
          A resposta por e-mail sai pela cadência, com revisão antes de enviar. O inbox aqui é a
          leitura da conversa.
        </Alerta>
      )}
    </div>
  );
}

function Balao({ mensagem }: { mensagem: Mensagem }) {
  const entrada = mensagem.direcao === "entrada";

  return (
    <div className={`flex ${entrada ? "justify-start" : "justify-end"}`}>
      <div
        className={[
          "max-w-[85%] rounded-xl px-3 py-2",
          entrada ? "bg-superficie border border-fio" : "bg-acento-fraco",
        ].join(" ")}
      >
        {mensagem.assunto ? (
          <p className="mb-1 text-rotulo font-medium text-tinta">{mensagem.assunto}</p>
        ) : null}

        {/* `corpo_formato` decide o render, e isso e uma fronteira de seguranca,
            nao um detalhe de estilo: 'html' so existe para o que NOS escrevemos
            (template, IA, humano). Conteudo que vem de fora entra sempre como
            'texto' e e escapado pelo React. */}
        {mensagem.corpo_formato === "html" ? (
          <div
            className="text-corpo text-tinta [&_a]:text-acento [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: mensagem.corpo }}
          />
        ) : (
          <p className="whitespace-pre-wrap text-corpo text-tinta">{mensagem.corpo}</p>
        )}

        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-rotulo text-tinta-fraca">
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

function CompositorWhatsapp({
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
  // Precedencia deliberada: o canal desligado ganha da janela. Mostrar
  // "janela aberta, escreva aqui" com o numero pausado seria mentir.
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
        A caixa de texto só abre depois que ele mandar a primeira mensagem — é a regra da Meta, e
        é o que separa conversa de abordagem. Para dar o primeiro toque, use um modelo aprovado
        pela cadência.
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
      <div className="flex justify-end">
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
