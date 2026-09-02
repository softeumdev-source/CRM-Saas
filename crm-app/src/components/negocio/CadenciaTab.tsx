"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  CheckCircle2,
  FileText,
  Mail,
  MessageSquare,
  PhoneCall,
  RotateCcw,
  Search,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import clsx from "clsx";
import { useEstadoDaProp } from "@/lib/estadoDaProp";
import { createClient } from "@/lib/supabase/client";
import type { NegocioComRelacoes, TipoAtividade, Usuario } from "@/lib/types";
import type { TablesInsert } from "@/lib/supabase/types";
import { TIPOS_ATIVIDADE } from "@/lib/types";
import {
  PRESETS_AGENDAMENTO,
  ROTULOS_ATIVIDADE,
  resumirTexto,
  dataDoPreset,
  descreverPrazo,
  estaAtrasada,
  formatarDataHora,
  paraInputDataHora,
  type AtividadeComUsuario,
} from "@/lib/atividades";
import {
  Alerta,
  Badge,
  Button,
  Cartao,
  Field,
  Input,
  Recuo,
  Rotulo,
  Segmentado,
  Select,
  Textarea,
} from "@/components/ui";

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  ligacao: PhoneCall,
  email: Mail,
  demo: Video,
  proposta: FileText,
  nota: MessageSquare,
  whatsapp: MessageSquare,
  reuniao: Users,
  mudanca_etapa: ArrowLeftRight,
};

const TIPOS_REGISTRAVEIS = TIPOS_ATIVIDADE.filter((t) => t !== "mudanca_etapa");

export function CadenciaTab({
  negocio,
  atividadesIniciais,
  usuarioAtual,
  onRegistrouAtividade,
}: {
  negocio: NegocioComRelacoes;
  atividadesIniciais: AtividadeComUsuario[];
  usuarioAtual: Usuario;
  /** Avisa o pai para atualizar a situação do negócio na hora. */
  onRegistrouAtividade?: () => void;
}) {
  // O pai assina o Realtime de atividades e repassa a lista viva por props.
  const [atividades, setAtividades] = useEstadoDaProp(atividadesIniciais);

  const [tipo, setTipo] = useState<TipoAtividade>("ligacao");
  const [descricao, setDescricao] = useState("");
  const [realizadaEm, setRealizadaEm] = useState(() => paraInputDataHora(new Date()));

  const [agendarProximo, setAgendarProximo] = useState(true);
  const [tipoProximo, setTipoProximo] = useState<TipoAtividade>("ligacao");
  const [tituloProximo, setTituloProximo] = useState("");
  const [dataAgendada, setDataAgendada] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tocouTexto, setTocouTexto] = useState(false);
  const [ok, setOk] = useState(false);

  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [reagendando, setReagendando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");

  const empresa = negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo;

  const proximosPassos = useMemo(
    () =>
      atividades
        .filter((a) => !a.concluida && a.data_agendada)
        .sort((a, b) => new Date(a.data_agendada!).getTime() - new Date(b.data_agendada!).getTime()),
    [atividades],
  );

  const historico = useMemo(() => {
    const termo = buscaHistorico.trim().toLowerCase();
    return atividades
      .filter((a) => a.concluida || !a.data_agendada)
      .filter((a) => filtroTipo === "todos" || a.tipo === filtroTipo)
      .filter(
        (a) =>
          !termo ||
          (a.titulo || "").toLowerCase().includes(termo) ||
          (a.descricao || "").toLowerCase().includes(termo),
      );
  }, [atividades, filtroTipo, buscaHistorico]);

  const textoInvalido = descricao.trim().length === 0;
  const proximoInvalido = agendarProximo && !dataAgendada;

  const limparFormulario = () => {
    setDescricao("");
    setRealizadaEm(paraInputDataHora(new Date()));
    setTituloProximo("");
    setDataAgendada("");
    setTocouTexto(false);
  };

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setTocouTexto(true);
    setErro(null);
    if (textoInvalido) return;
    if (proximoInvalido) {
      setErro("Escolha a data do próximo passo ou desmarque o agendamento.");
      return;
    }

    setSalvando(true);
    const supabase = createClient();
    const realizada = realizadaEm ? new Date(realizadaEm) : new Date();

    const registros: TablesInsert<"atividades">[] = [
      {
        negocio_id: negocio.id,
        usuario_id: usuarioAtual.id,
        tipo,
        // O formulário tem só o texto; o título (obrigatório no banco) vem da
        // primeira linha da anotação e serve de resumo na timeline.
        titulo: resumirTexto(descricao, ROTULOS_ATIVIDADE[tipo] || "Atividade"),
        descricao: descricao.trim(),
        concluida: true,
        concluida_em: realizada.toISOString(),
      },
    ];

    if (agendarProximo && dataAgendada) {
      const quando = new Date(dataAgendada).toISOString();
      registros.push({
        negocio_id: negocio.id,
        usuario_id: usuarioAtual.id,
        tipo: tipoProximo,
        titulo: tituloProximo.trim() || `${ROTULOS_ATIVIDADE[tipoProximo]} — ${empresa}`,
        concluida: false,
        data_agendada: quando,
        lembrete_data: quando,
      });
    }

    const { data, error } = await supabase.from("atividades").insert(registros).select("*, usuario:usuarios(*)");
    setSalvando(false);

    if (error) {
      setErro(`Não foi possível registrar: ${error.message}`);
      return;
    }

    if (data) {
      const novas = data as AtividadeComUsuario[];
      setAtividades((prev) => [...novas, ...prev.filter((a) => !novas.some((n) => n.id === a.id))]);
    }
    limparFormulario();
    setOk(true);
    setTimeout(() => setOk(false), 2500);
    onRegistrouAtividade?.();
  };

  const marcarConcluida = async (id: string) => {
    const antes = atividades;
    const agora = new Date().toISOString();
    setAtividades((prev) => prev.map((a) => (a.id === id ? { ...a, concluida: true, concluida_em: agora } : a)));
    const { error } = await createClient().from("atividades").update({ concluida: true }).eq("id", id);
    if (error) {
      setAtividades(antes);
      setErro(`Não foi possível concluir: ${error.message}`);
      return;
    }
    onRegistrouAtividade?.();
  };

  const confirmarAgenda = async (id: string) => {
    const antes = atividades;
    setAtividades((prev) => prev.map((a) => (a.id === id ? { ...a, confirmada: true } : a)));
    const { error } = await createClient().from("atividades").update({ confirmada: true }).eq("id", id);
    if (error) {
      setAtividades(antes);
      setErro(`Não foi possível confirmar: ${error.message}`);
    }
  };

  const reagendar = async (id: string) => {
    if (!novaData) return;
    const quando = new Date(novaData).toISOString();
    const antes = atividades;
    setAtividades((prev) =>
      prev.map((a) => (a.id === id ? { ...a, data_agendada: quando, lembrete_data: quando, lembrete_enviado: false } : a)),
    );
    setReagendando(null);
    setNovaData("");
    const { error } = await createClient()
      .from("atividades")
      .update({ data_agendada: quando, lembrete_data: quando, lembrete_enviado: false })
      .eq("id", id);
    if (error) {
      setAtividades(antes);
      setErro(`Não foi possível reagendar: ${error.message}`);
    }
  };

  const excluirAtividade = async (id: string) => {
    if (!confirm("Excluir este passo da cadência?")) return;
    const antes = atividades;
    setAtividades((prev) => prev.filter((a) => a.id !== id));
    const { error } = await createClient().from("atividades").delete().eq("id", id);
    if (error) {
      setAtividades(antes);
      setErro(`Não foi possível excluir: ${error.message}`);
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {/* Próximos passos primeiro: é o que a tela responde ao abrir. */}
      <section className="flex flex-col gap-2">
        <Rotulo>Próximo passo</Rotulo>

        {proximosPassos.length === 0 ? (
          <Alerta tom="aviso">
            Nenhum próximo passo agendado — este negócio some do radar. Registre a atividade abaixo já
            agendando a próxima ação.
          </Alerta>
        ) : (
          <Cartao className="flex flex-col p-0">
            {proximosPassos.map((a, i) => {
              const Icone = ICONES[a.tipo] || MessageSquare;
              const atrasada = estaAtrasada(a.data_agendada);
              return (
                <div
                  key={a.id}
                  className={clsx("flex flex-wrap items-start gap-3 px-4 py-3.5", i > 0 && "border-t border-fio")}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      atrasada ? "bg-rose-50 text-rose-700" : "bg-recuo text-tinta-suave",
                    )}
                  >
                    <Icone className="h-3.5 w-3.5" />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-titulo text-tinta">{a.titulo}</span>
                    <p className="text-corpo flex flex-wrap items-center gap-x-1.5 text-tinta-suave">
                      <span className={atrasada ? "font-medium text-rose-700" : undefined}>
                        {formatarDataHora(a.data_agendada)} ({descreverPrazo(a.data_agendada)})
                      </span>
                      {a.confirmada && (
                        <span className="flex items-center gap-1 font-medium text-emerald-700">
                          <BadgeCheck className="h-3 w-3" aria-hidden /> confirmada pelo cliente
                        </span>
                      )}
                    </p>

                    {reagendando === a.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <div className="w-52">
                          <Input
                            type="datetime-local"
                            value={novaData}
                            onChange={(e) => setNovaData(e.target.value)}
                            aria-label="Nova data e hora"
                          />
                        </div>
                        {PRESETS_AGENDAMENTO.slice(0, 4).map((p) => (
                          <Button
                            key={p.rotulo}
                            tamanho="sm"
                            onClick={() => setNovaData(paraInputDataHora(dataDoPreset(p)))}
                          >
                            {p.rotulo}
                          </Button>
                        ))}
                        <Button
                          variante="primario"
                          tamanho="sm"
                          disabled={!novaData}
                          onClick={() => reagendar(a.id)}
                        >
                          Salvar
                        </Button>
                        <Button variante="sutil" tamanho="sm" onClick={() => setReagendando(null)}>
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!a.confirmada && (
                      <Button
                        variante="sutil"
                        tamanho="sm"
                        title="Cliente confirmou a agenda"
                        onClick={() => confirmarAgenda(a.id)}
                      >
                        Confirmar
                      </Button>
                    )}
                    <Button
                      variante="sutil"
                      tamanho="sm"
                      icone={RotateCcw}
                      aria-label="Reagendar"
                      title="Reagendar"
                      onClick={() => {
                        setReagendando(a.id);
                        setNovaData(a.data_agendada ? paraInputDataHora(new Date(a.data_agendada)) : "");
                      }}
                    />
                    <Button variante="secundario" tamanho="sm" onClick={() => marcarConcluida(a.id)}>
                      Concluir
                    </Button>
                    <Button
                      variante="sutil"
                      tamanho="sm"
                      icone={Trash2}
                      aria-label="Excluir passo"
                      title="Excluir"
                      onClick={() => excluirAtividade(a.id)}
                    />
                  </div>
                </div>
              );
            })}
          </Cartao>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Rotulo>Registrar atividade</Rotulo>
          {ok && (
            <span className="text-corpo flex items-center gap-1 font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Registrada
            </span>
          )}
        </div>

        <Cartao className="p-0">
          <form onSubmit={handleRegistrar} className="flex flex-col gap-4 p-5">
            <Segmentado
              rotulo="Tipo de contato"
              valor={tipo}
              aoTrocar={setTipo}
              opcoes={TIPOS_REGISTRAVEIS.map((t) => ({ chave: t, label: ROTULOS_ATIVIDADE[t] }))}
              className="flex-wrap"
            />

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="flex flex-col gap-3">
                <Field
                  rotulo="O que aconteceu"
                  obrigatorio
                  erro={tocouTexto && textoInvalido ? "Escreva o que aconteceu no contato." : null}
                  dica={
                    tocouTexto && textoInvalido
                      ? undefined
                      : `${descricao.length} caracteres · a primeira linha vira o resumo no histórico`
                  }
                >
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={12}
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      onBlur={() => setTocouTexto(true)}
                      className="min-h-56 leading-relaxed"
                      placeholder={
                        "Anote aqui tudo que importa:\n• Com quem falou e qual o cargo\n• Dores e prioridades levantadas\n• Objeções, concorrentes e preço discutido\n• O que ficou combinado e o prazo"
                      }
                    />
                  )}
                </Field>

                <Field rotulo="Realizada em">
                  {(p) => (
                    <Input
                      {...p}
                      type="datetime-local"
                      value={realizadaEm}
                      onChange={(e) => setRealizadaEm(e.target.value)}
                    />
                  )}
                </Field>
              </div>

              <Recuo className="flex h-fit flex-col gap-3 p-4">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={agendarProximo}
                    onChange={(e) => setAgendarProximo(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-indigo-600"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-corpo-lg font-medium text-tinta">Agendar próximo passo</span>
                    <span className="text-corpo text-tinta-suave">
                      Nunca deixe o negócio sem próxima ação. O alerta chega pelo sino na data.
                    </span>
                  </span>
                </label>

                {agendarProximo && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Rotulo>Quando</Rotulo>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESETS_AGENDAMENTO.map((p) => (
                          <Button
                            key={p.rotulo}
                            tamanho="sm"
                            onClick={() => setDataAgendada(paraInputDataHora(dataDoPreset(p)))}
                          >
                            {p.rotulo}
                          </Button>
                        ))}
                      </div>
                      <Input
                        type="datetime-local"
                        value={dataAgendada}
                        onChange={(e) => setDataAgendada(e.target.value)}
                        aria-label="Data e hora do próximo passo"
                      />
                      {dataAgendada && (
                        <span className="text-corpo font-medium text-emerald-700">
                          {descreverPrazo(new Date(dataAgendada).toISOString())} ·{" "}
                          {formatarDataHora(new Date(dataAgendada).toISOString())}
                        </span>
                      )}
                    </div>

                    <Field rotulo="Tipo do próximo passo">
                      {(p) => (
                        <Select
                          {...p}
                          value={tipoProximo}
                          onChange={(e) => setTipoProximo(e.target.value as TipoAtividade)}
                        >
                          {TIPOS_REGISTRAVEIS.map((t) => (
                            <option key={t} value={t}>
                              {ROTULOS_ATIVIDADE[t]}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>

                    <Field rotulo="Descrição do próximo passo" dica="Opcional.">
                      {(p) => (
                        <Input
                          {...p}
                          value={tituloProximo}
                          onChange={(e) => setTituloProximo(e.target.value)}
                          maxLength={120}
                          placeholder={`${ROTULOS_ATIVIDADE[tipoProximo]} — ${empresa}`}
                        />
                      )}
                    </Field>
                  </>
                )}
              </Recuo>
            </div>

            {erro && <Alerta>{erro}</Alerta>}

            <div className="flex items-center gap-2 border-t border-fio pt-4">
              <Button type="submit" variante="primario" carregando={salvando}>
                Registrar atividade
              </Button>
              <Button variante="sutil" onClick={limparFormulario}>
                Limpar
              </Button>
            </div>
          </form>
        </Cartao>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Rotulo>Histórico · {historico.length}</Rotulo>
          <div className="flex items-center gap-2">
            <div className="relative w-48">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta-fraca"
                aria-hidden
              />
              <Input
                value={buscaHistorico}
                onChange={(e) => setBuscaHistorico(e.target.value)}
                aria-label="Buscar no histórico"
                placeholder="Buscar…"
                className="pl-9"
              />
            </div>
            <div className="w-40">
              <Select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                aria-label="Filtrar por tipo"
              >
                <option value="todos">Todos os tipos</option>
                {TIPOS_ATIVIDADE.map((t) => (
                  <option key={t} value={t}>
                    {ROTULOS_ATIVIDADE[t]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {historico.length === 0 ? (
          <p className="text-corpo-lg px-1 py-4 text-tinta-fraca">Nenhum registro encontrado.</p>
        ) : (
          <ol className="flex flex-col gap-5 py-1">
            {historico.map((a) => {
              const Icone = ICONES[a.tipo] || MessageSquare;
              // Nos registros feitos aqui o título é o resumo do próprio texto —
              // repetir os dois deixaria a primeira linha duplicada na timeline.
              const tituloRedundante =
                !!a.descricao && a.descricao.trimStart().startsWith(a.titulo.replace(/…$/, ""));
              return (
                <li key={a.id} className="flex gap-3.5">
                  <span
                    aria-hidden
                    className="mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center text-tinta-fraca"
                  >
                    <Icone className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="text-corpo-lg font-medium text-tinta">
                        {tituloRedundante ? ROTULOS_ATIVIDADE[a.tipo] || a.tipo : a.titulo}
                      </span>
                      <span className="text-corpo tabular-nums text-tinta-fraca">
                        {formatarDataHora(a.concluida_em || a.criado_em)} · {a.usuario?.nome || "Sistema"}
                      </span>
                      {!a.concluida && <Badge tom="atencao">pendente</Badge>}
                    </div>
                    {a.descricao && (
                      <p className="text-corpo-lg max-w-[70ch] whitespace-pre-wrap text-tinta-suave">
                        {a.descricao}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
