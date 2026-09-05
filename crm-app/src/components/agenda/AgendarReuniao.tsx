"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, CalendarPlus, Video } from "lucide-react";
import { Alerta, AreaTexto, Botao, Campo, Entrada, Modal, Recuo, Selecao } from "@/components/ui";
import { PRESETS_AGENDAMENTO, dataDoPreset, paraInputDataHora } from "@/lib/atividades";
// Os tipos vivem num arquivo SEM `"use client"` — ver o cabeçalho de `tipos.ts`.
import {
  descricaoSugerida,
  duracaoLegivel,
  tituloSugerido,
  type NegocioAgendavel,
  type ReuniaoAgendada,
  type ReuniaoParaEditar,
} from "@/components/agenda/tipos";
export type { NegocioAgendavel, ReuniaoAgendada, ReuniaoParaEditar };

/**
 * Agendar uma reunião com o cliente, pelo Google, em um lugar só.
 *
 * UM componente com um seletor opcional, e não dois arquivos — o card já sabe
 * com quem é a reunião, a Agenda não. Duas cópias divergiriam: neste projeto já
 * aconteceu com `moverEtapa` e com `ItemNav`, e é o mesmo motivo pelo qual o
 * `LeadCard` tem duas variantes num arquivo só.
 *
 * A decisão que molda a tela é o CONVITE. Ele é uma caixa marcável, não um
 * efeito colateral invisível: marcada, a Google manda o e-mail para o cliente e
 * cria o Meet; desmarcada, a reunião fica só no CRM. Deixar isso implícito
 * produziria os dois piores desfechos possíveis — o cliente ser avisado sem
 * ninguém querer, ou a reunião "existir" sem ele nunca ter sabido.
 *
 * Sem e-mail no cadastro a caixa se desmarca sozinha e explica por quê, em vez
 * de deixar a pessoa preencher tudo e descobrir no envio.
 */

const DURACOES = [15, 30, 45, 60, 90, 120];

/** Rótulo humano do negócio na lista e no resumo. */
function nomeDe(n: NegocioAgendavel): string {
  return n.contato?.empresa || n.contato?.nome || n.titulo;
}

export function AgendarReuniao({
  aoFechar,
  negocios,
  negocioIdInicial,
  vendedor,
  aoAgendado,
  edicao,
}: {
  aoFechar: () => void;
  /** Um só (a partir do card) ou vários (a partir da Agenda). */
  negocios: NegocioAgendavel[];
  negocioIdInicial?: string;
  /**
   * Quem assina o convite — o nome da CAIXA comercial, não o de quem clicou.
   * Ver `descricaoSugerida` em `tipos.ts`.
   */
  vendedor: string;
  aoAgendado?: (resultado: ReuniaoAgendada) => void;
  /**
   * Quando vem, o modal EDITA em vez de criar.
   *
   * Um componente com dois modos, e não um "EditarReuniao" ao lado: o
   * formulário é o mesmo — título, hora, duração e pauta —, e duas cópias
   * divergiriam, que é o motivo já escrito no cabeçalho para o seletor de
   * negócio opcional.
   */
  edicao?: ReuniaoParaEditar;
}) {
  const editando = !!edicao;
  const [negocioId, setNegocioId] = useState(negocioIdInicial || negocios[0]?.id || "");
  const [quando, setQuando] = useState(
    edicao ? paraInputDataHora(new Date(edicao.quando)) : "",
  );
  /**
   * String, e vazia significa "não mexer".
   *
   * Ao editar, a duração real está no Google e não aqui — mostrar "30 min" num
   * evento de uma hora seria a tela mentindo, e mandar 30 encolheria a reunião
   * sem ninguém pedir. Vazio faz a rota preservar a duração que o evento tem.
   */
  const [minutos, setMinutos] = useState(edicao ? "" : "30");
  /**
   * `null` significa "ninguém tocou", e é diferente de `""`.
   *
   * Com `""` como sentinela, apagar o campo o repopularia sob o cursor no render
   * seguinte — a pessoa não conseguiria deixá-lo vazio. Com `null`, o primeiro
   * caractere digitado (ou o primeiro apagar) transfere a posse do campo para
   * ela, e a sugestão não volta mais.
   *
   * E derivado no render, não copiado por efeito: trocar de negócio no seletor
   * da Agenda re-sugere na hora enquanto ninguém editou, sem um render
   * intermediário mostrando o texto do negócio anterior. É a mesma doutrina do
   * `convite` logo abaixo.
   */
  const [tituloEditado, setTituloEditado] = useState<string | null>(edicao?.titulo ?? null);
  const [descricaoEditada, setDescricaoEditada] = useState<string | null>(edicao?.descricao ?? null);
  const [querConvite, setQuerConvite] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const escolhido = useMemo(
    () => negocios.find((n) => n.id === negocioId) || null,
    [negocios, negocioId],
  );
  const email = escolhido?.contato?.email?.trim() || null;

  const titulo = tituloEditado ?? (escolhido ? tituloSugerido(escolhido) : "");
  const minutosEscolhidos = minutos ? Number(minutos) : null;
  const descricao =
    descricaoEditada ?? (escolhido ? descricaoSugerida(escolhido, minutosEscolhidos ?? 30, vendedor) : "");

  /**
   * Sem e-mail não há convite possível, e isso é DERIVADO — não um estado que
   * um efeito corrige depois.
   *
   * A primeira versão guardava `convite` em estado e usava um `useEffect` para
   * desmarcá-lo quando o contato não tinha e-mail. Isso rende um render inteiro
   * com a caixa marcada mentindo, e o próprio lint do React aponta o padrão
   * (setState síncrono dentro de efeito, que encadeia renders). Calculado no
   * render não existe esse instante intermediário.
   *
   * `querConvite` continua sendo a escolha da PESSOA: trocar para um negócio
   * sem e-mail desmarca, e voltar para um que tem e-mail remarca — sem perder
   * o que ela tinha decidido.
   */
  const convite = querConvite && !!email;

  // Este componente só é montado com o modal aberto (os dois chamadores fazem
  // `{aberto && <AgendarReuniao/>}`), então cada abertura começa com estado
  // limpo por construção. A versão anterior zerava tudo num efeito, e bastava
  // alguém montá-lo sempre para a data da reunião anterior reaparecer no campo
  // — e sair um convite com a hora errada.

  const enviar = async () => {
    if (!negocioId) {
      setErro("Escolha o negócio da reunião.");
      return;
    }
    if (!quando) {
      setErro("Escolha a data e a hora.");
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      // `datetime-local` não tem fuso; `new Date` o lê como hora local, que é o
      // que a pessoa digitou. O ISO leva o fuso embutido daí em diante.
      const quandoIso = new Date(quando).toISOString();
      const resp = await fetch("/api/google/reuniao", {
        method: edicao ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          edicao
            ? {
                atividadeId: edicao.atividadeId,
                quando: quandoIso,
                // Só vai quando a pessoa escolheu outra: sem isso, a rota
                // preserva a duração real que o evento tem na Google.
                ...(minutosEscolhidos ? { minutos: minutosEscolhidos } : {}),
                titulo: titulo.trim() || undefined,
                descricao: descricao.trim() || undefined,
              }
            : {
                negocioId,
                quando: quandoIso,
                minutos: minutosEscolhidos ?? 30,
                titulo: titulo.trim() || undefined,
                descricao: descricao.trim() || undefined,
                convite,
              },
        ),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.error || (edicao ? "Não foi possível salvar." : "Não foi possível agendar."));
        return;
      }
      aoAgendado?.(dados as ReuniaoAgendada);
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  };

  const semNegocios = negocios.length === 0;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={editando ? "Editar reunião" : "Agendar reunião"}
      rodape={
        <>
          <Botao variante="sutil" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            icone={editando ? CalendarCheck : CalendarPlus}
            carregando={enviando}
            disabled={semNegocios || !quando}
            onClick={() => void enviar()}
          >
            {editando
              ? edicao.temConvite
                ? "Salvar e avisar o cliente"
                : "Salvar"
              : convite
                ? "Agendar e convidar"
                : "Agendar no CRM"}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {semNegocios ? (
          <Alerta tom="alerta" titulo="Nenhum negócio para agendar">
            Abra um negócio e volte aqui — a reunião precisa estar ligada a um cliente para o
            convite saber para quem ir.
          </Alerta>
        ) : negocios.length === 1 ? (
          <Recuo>
            <p className="text-rotulo text-tinta-suave">Reunião com</p>
            <p className="text-corpo font-semibold text-tinta">{nomeDe(negocios[0])}</p>
            <p className="text-rotulo text-tinta-fraca">{email || "sem e-mail cadastrado"}</p>
          </Recuo>
        ) : (
          <Campo rotulo="Negócio" obrigatorio dica={email ? `Convite para ${email}` : undefined}>
            {(props) => (
              <Selecao {...props} value={negocioId} onChange={(e) => setNegocioId(e.target.value)}>
                {negocios.map((n) => (
                  <option key={n.id} value={n.id}>
                    {nomeDe(n)}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        )}

        <Campo rotulo="Título" dica="É o que o cliente vê na agenda dele. Edite à vontade.">
          {(props) => (
            <Entrada
              {...props}
              value={titulo}
              onChange={(e) => setTituloEditado(e.target.value)}
              placeholder="Apresentação da proposta"
              maxLength={120}
            />
          )}
        </Campo>

        {/* O campo e os atalhos são UMA coisa. Soltos com o mesmo respiro do
            resto do formulário, os botões ficavam equidistantes de "Quando" e
            de "Duração" e não pareciam pertencer a nenhum dos dois. */}
        <div className="flex flex-col gap-1.5">
          <Campo rotulo="Quando" obrigatorio>
            {(props) => (
              <Entrada
                {...props}
                type="datetime-local"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
              />
            )}
          </Campo>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS_AGENDAMENTO.slice(0, 4).map((p) => (
              <button
                key={p.rotulo}
                type="button"
                onClick={() => setQuando(paraInputDataHora(dataDoPreset(p)))}
                className="foco rounded-lg border border-fio bg-superficie px-2.5 py-1.5 text-rotulo font-medium text-acento transition-colors duration-150 ease-out hover:border-fio-forte pointer-coarse:min-h-11"
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>

        <Campo rotulo="Duração">
          {(props) => (
            <Selecao {...props} value={minutos} onChange={(e) => setMinutos(e.target.value)}>
              {editando && <option value="">Manter a duração atual</option>}
              {DURACOES.map((m) => (
                <option key={m} value={m}>
                  {duracaoLegivel(m)}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>

        <Campo rotulo="Pauta" dica="Vai no corpo do convite que o cliente recebe.">
          {(props) => (
            <AreaTexto
              {...props}
              rows={8}
              value={descricao}
              onChange={(e) => setDescricaoEditada(e.target.value)}
              placeholder="O que será tratado na reunião"
            />
          )}
        </Campo>

        {/* Ao EDITAR, o convite não é escolha: ou ele já existe (e alterar avisa
            o cliente), ou a reunião nasceu só no CRM e criar convite agora é
            outro caminho — o botão "Criar convite no Google" da aba Cadência.
            Oferecer a caixa aqui prometeria algo que este verbo não faz. */}
        {editando ? (
          <Recuo>
            <p className="text-corpo font-medium text-tinta">
              {edicao.temConvite ? "O cliente será avisado" : "Reunião só no CRM"}
            </p>
            <p className="mt-0.5 text-rotulo text-tinta-suave">
              {edicao.temConvite
                ? "A Google manda o e-mail de alteração e o evento muda na agenda dele. O link do Meet continua o mesmo."
                : "Esta reunião não tem convite. Para criar um, use \u201cCriar convite no Google\u201d na lista de próximos passos."}
            </p>
          </Recuo>
        ) : (
        <label
          className={`flex items-start gap-2.5 rounded-xl border border-fio bg-recuo p-3 pointer-coarse:min-h-11 ${
            email ? "cursor-pointer" : "cursor-not-allowed opacity-70"
          }`}
        >
          <input
            type="checkbox"
            checked={convite}
            disabled={!email}
            onChange={(e) => setQuerConvite(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--cor-acento-solido)]"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-corpo font-medium text-tinta">
              <Video className="h-3.5 w-3.5 text-tinta-suave" aria-hidden /> Enviar convite pelo
              Google, com Meet
            </span>
            <span className="mt-0.5 block text-rotulo text-tinta-suave">
              {!email
                ? "Este contato não tem e-mail cadastrado — sem ele a Google não consegue convidar ninguém."
                : convite
                  ? `O cliente recebe o convite em ${email} e o link do Meet entra no evento.`
                  : "A reunião fica só no CRM. O cliente não é avisado."}
            </span>
          </span>
        </label>
        )}

        {erro && (
          <Alerta tom="risco" urgente>
            {erro}
          </Alerta>
        )}
      </div>
    </Modal>
  );
}
