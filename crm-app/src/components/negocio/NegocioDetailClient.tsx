"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Undo2 } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useSincronizacao } from "@/lib/supabase/realtime";
import type { EtapaPipeline, NegocioComRelacoes, Plano, Usuario } from "@/lib/types";
import { SELECT_NEGOCIO_COMPLETO, formatarMoeda, resultadoDaEtapa, type Aba } from "@/lib/types";
import { estaAtrasada, proximaAtividade, type AtividadeComUsuario } from "@/lib/atividades";
import { fecharNegocio, moverEtapa } from "@/lib/negocios";
import { Alerta, Badge, Button, Rotulo, Select } from "@/components/ui";
import { FilaDaEtapa } from "@/components/negocio/FilaDaEtapa";
import { EncerrarNegocioModal } from "@/components/negocio/EncerrarNegocioModal";
import { ContatoTab } from "@/components/negocio/ContatoTab";
import { CadenciaTab } from "@/components/negocio/CadenciaTab";
import { PropostaTab } from "@/components/negocio/PropostaTab";
import { MensagensTab } from "@/components/negocio/MensagensTab";

type PropostaComRelacoes = Record<string, unknown>;

/** Cadência primeiro: é o trabalho. O formulário de contato não é a porta. */
const ABAS: { id: Aba; label: string }[] = [
  { id: "cadencia", label: "Cadência" },
  { id: "contato", label: "Contato" },
  { id: "proposta", label: "Proposta" },
  { id: "mensagens", label: "Mensagens" },
];

const SELECT_PROPOSTA = "*, plano:planos(*), envelopes(*, signatarios(*))";

export function NegocioDetailClient({
  negocioInicial,
  filaInicial,
  etapas,
  vendedores,
  atividadesIniciais,
  usuarioAtual,
  abaInicial = "cadencia",
}: {
  negocioInicial: NegocioComRelacoes;
  filaInicial: NegocioComRelacoes[];
  etapas: EtapaPipeline[];
  vendedores: Usuario[];
  atividadesIniciais: AtividadeComUsuario[];
  usuarioAtual: Usuario;
  /** Vem de `?tab=` — as notificações do sino abrem direto na cadência. */
  abaInicial?: Aba;
}) {
  const router = useRouter();
  const [negocio, setNegocio] = useState(negocioInicial);
  const [atividades, setAtividades] = useState(atividadesIniciais);
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState(false);
  /** Guarda o estado anterior de etapa/responsável para o "desfazer". */
  const [desfazer, setDesfazer] = useState<{ texto: string; acao: () => Promise<void> } | null>(null);

  // Proposta e planos só chegam quando a aba abre: é o join mais pesado da
  // tela (proposta → plano → envelope → signatários) e a maioria das visitas
  // nem passa por lá.
  const [propostas, setPropostas] = useState<PropostaComRelacoes[] | null>(null);
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [erroProposta, setErroProposta] = useState<string | null>(null);

  const negocioId = negocioInicial.id;

  const carregarProposta = useCallback(async () => {
    setErroProposta(null);
    const supabase = createClient();

    // Carregar sob demanda tem um custo que o carregamento pelo servidor não
    // tinha: se a consulta falha, ou simplesmente pendura, a aba fica em
    // "carregando" para sempre. Rede ruim não rejeita — ela demora — então
    // não basta try/catch: precisa de prazo.
    const prazo = new Promise<"prazo">((r) => setTimeout(() => r("prazo"), 12_000));
    const carga = Promise.all([
      supabase.from("propostas").select(SELECT_PROPOSTA).eq("negocio_id", negocioId).order("criado_em", { ascending: false }),
      supabase.from("planos").select("*").eq("ativo", true).order("valor_plataforma_base"),
    ]);

    try {
      const r = await Promise.race([carga, prazo]);
      if (r === "prazo") {
        setErroProposta("A consulta demorou demais.");
        return;
      }
      const [props, pl] = r;
      if (props.error || pl.error) {
        setErroProposta(props.error?.message ?? pl.error?.message ?? "Falha ao carregar.");
        return;
      }
      setPropostas((props.data as PropostaComRelacoes[]) ?? []);
      setPlanos((pl.data as Plano[]) ?? []);
    } catch (e) {
      setErroProposta(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, [negocioId]);

  useEffect(() => {
    if (aba === "proposta" && propostas === null && !erroProposta) void carregarProposta();
  }, [aba, propostas, erroProposta, carregarProposta]);

  const recarregar = useCallback(async () => {
    const supabase = createClient();
    const [neg, ativ] = await Promise.all([
      supabase.from("negocios").select(SELECT_NEGOCIO_COMPLETO).eq("id", negocioId).single(),
      supabase.from("atividades").select("*, usuario:usuarios(*)").eq("negocio_id", negocioId).order("criado_em", { ascending: false }),
    ]);
    if (neg.data) setNegocio(neg.data as unknown as NegocioComRelacoes);
    if (ativ.data) setAtividades(ativ.data as unknown as AtividadeComUsuario[]);
    // A proposta só se atualiza se a aba dela já tiver sido aberta.
    if (propostas !== null) {
      const { data } = await supabase.from("propostas").select(SELECT_PROPOSTA).eq("negocio_id", negocioId).order("criado_em", { ascending: false });
      if (data) setPropostas(data as PropostaComRelacoes[]);
    }
  }, [negocioId, propostas]);

  useSincronizacao(recarregar, {
    canal: `negocio-${negocioId}`,
    tabelas: [
      { tabela: "negocios", filtro: `id=eq.${negocioId}` },
      { tabela: "contatos" },
      { tabela: "atividades", filtro: `negocio_id=eq.${negocioId}` },
      { tabela: "propostas", filtro: `negocio_id=eq.${negocioId}` },
      { tabela: "envelopes" },
      { tabela: "signatarios" },
    ],
  });

  const salvarCampos = async (campos: Partial<NegocioComRelacoes>) => {
    setNegocio((prev) => ({ ...prev, ...campos }));
    const { etapa, contato, responsavel, atividades_pendentes, ...camposDb } = campos as Record<string, unknown> & {
      etapa?: unknown;
      contato?: unknown;
      responsavel?: unknown;
      atividades_pendentes?: unknown;
    };
    const { error } = await createClient()
      .from("negocios")
      .update({ ...camposDb, atualizado_em: new Date().toISOString() })
      .eq("id", negocio.id);
    if (error) setErro(`Não foi possível salvar: ${error.message}`);
  };

  const aplicarEtapa = useCallback(
    async (etapaId: string) => {
      const nova = etapas.find((et) => et.id === etapaId);
      if (!nova || etapaId === negocio.etapa_id) return;
      const anterior = negocio.etapa;

      setNegocio((prev) => ({
        ...prev,
        etapa_id: etapaId,
        etapa: nova,
        probabilidade: nova.probabilidade ?? prev.probabilidade,
        ganho: resultadoDaEtapa(nova),
      }));
      setErro(null);

      const r = await moverEtapa({
        negocioId: negocio.id,
        etapa: nova,
        nomeEtapaAnterior: anterior?.nome,
        probabilidadeAtual: negocio.probabilidade,
        usuarioId: usuarioAtual.id,
      });
      if (!r.ok) {
        setNegocio((prev) => ({ ...prev, etapa_id: anterior?.id ?? null, etapa: anterior }));
        setErro(`Não foi possível mover o negócio: ${r.erro}`);
        return;
      }

      // Trocar etapa aqui não tem o gesto do arrastar para dar contexto, então
      // o caminho de volta fica explícito em vez de exigir confirmação antes.
      if (anterior) {
        setDesfazer({
          texto: `Movido para "${nova.nome}".`,
          acao: async () => {
            setDesfazer(null);
            await aplicarEtapa(anterior.id);
          },
        });
      }
      // A fila à esquerda passou a ser a da etapa antiga; quem a monta é o servidor.
      router.refresh();
      void recarregar();
    },
    [etapas, negocio.etapa, negocio.etapa_id, negocio.id, negocio.probabilidade, usuarioAtual.id, recarregar, router],
  );

  const aplicarResponsavel = async (id: string) => {
    const anterior = negocio.responsavel;
    const novo = vendedores.find((v) => v.id === id) ?? null;
    await salvarCampos({ responsavel_id: id || null, responsavel: novo });
    setDesfazer({
      texto: novo ? `Responsável agora é ${novo.nome}.` : "Negócio devolvido ao pool.",
      acao: async () => {
        setDesfazer(null);
        await salvarCampos({ responsavel_id: anterior?.id ?? null, responsavel: anterior ?? null });
      },
    });
  };

  const encerrar = async (ganho: boolean, motivo: string | null) => {
    const etapaAlvo = etapas.find((e) => resultadoDaEtapa(e) === ganho);
    if (!etapaAlvo) {
      setErro(`Não encontrei a etapa de ${ganho ? "ganho" : "perda"} no funil.`);
      setEncerrando(false);
      return;
    }
    const r = await fecharNegocio({
      negocioId: negocio.id,
      etapaAlvo,
      ganho,
      motivo,
      usuarioId: usuarioAtual.id,
    });
    if (!r.ok) {
      setErro(`Não foi possível encerrar o negócio: ${r.erro}`);
      setEncerrando(false);
      return;
    }
    router.push("/");
    router.refresh();
  };

  const empresa = negocio.contato?.empresa || negocio.contato?.nome || negocio.titulo;
  const linhaContato = [negocio.contato?.nome, negocio.contato?.cargo, negocio.contato?.estado]
    .filter(Boolean)
    .join(" · ");
  const fechado = negocio.ganho !== null && negocio.ganho !== undefined;
  const proximaAtrasada = estaAtrasada(proximaAtividade(negocio.atividades_pendentes)?.data_agendada);
  const whatsapp = (negocio.contato?.whatsapp || negocio.contato?.telefone || "").replace(/\D/g, "");

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* A fila só aparece onde cabe sem espremer o detalhe. */}
      <div className="hidden lg:flex lg:min-h-0">
        <FilaDaEtapa etapa={negocio.etapa} negocios={filaInicial} negocioAbertoId={negocio.id} />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-5 px-5 pt-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-serif text-[30px] leading-[1.1] tracking-[-0.015em] text-tinta">
                  {empresa}
                </h1>
                {fechado && (
                  <Badge tom={negocio.ganho ? "sucesso" : "perigo"}>
                    {negocio.ganho ? "Ganho" : "Perdido"}
                  </Badge>
                )}
              </div>
              <p className="text-corpo-lg text-tinta-suave">{linhaContato || negocio.titulo}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {negocio.contato?.email && (
                <Button
                  variante="secundario"
                  icone={Mail}
                  onClick={() => window.open(`mailto:${negocio.contato!.email}`, "_blank", "noopener")}
                >
                  E-mail
                </Button>
              )}
              {whatsapp.length >= 10 && (
                <Button
                  variante="secundario"
                  icone={MessageCircle}
                  onClick={() => window.open(`https://wa.me/55${whatsapp}`, "_blank", "noopener")}
                >
                  WhatsApp
                </Button>
              )}
              <Button variante="primario" onClick={() => setAba("cadencia")}>
                Registrar atividade
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
            <div className="flex flex-col gap-1">
              <Rotulo>Etapa</Rotulo>
              {/* Antes era um <select> transparente sem borda que gravava no
                  change: a troca de etapa acidental mais fácil do app. */}
              <div className="w-56">
                <Select
                  value={negocio.etapa_id || ""}
                  onChange={(e) => void aplicarEtapa(e.target.value)}
                  aria-label="Etapa do negócio"
                >
                  {etapas.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.nome}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Rotulo>Responsável</Rotulo>
              <div className="w-52">
                <Select
                  value={negocio.responsavel_id || ""}
                  onChange={(e) => void aplicarResponsavel(e.target.value)}
                  aria-label="Vendedor responsável"
                >
                  <option value="">Sem dono (pool)</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              <Rotulo>Valor mensal</Rotulo>
              <span className="font-serif text-[26px] leading-[1.15] tracking-[-0.01em] tabular-nums text-tinta">
                {formatarMoeda(negocio.valor)}
              </span>
            </div>

            {/* Fora do eixo principal: era o par "Ganhei/Perdi" no topo à
                direita, sempre habilitado mesmo com o negócio já fechado. */}
            <div className="ml-auto">
              <Button
                variante="secundario"
                onClick={() => setEncerrando(true)}
                disabled={fechado}
                title={
                  fechado
                    ? "Este negócio já está encerrado. Para reabrir, mude a etapa acima."
                    : undefined
                }
              >
                Encerrar negócio
              </Button>
            </div>
          </div>

          {desfazer && (
            <div className="flex items-center gap-3 rounded-lg bg-recuo px-3 py-2">
              <span className="text-corpo-lg text-tinta-suave">{desfazer.texto}</span>
              <Button variante="sutil" tamanho="sm" icone={Undo2} onClick={() => void desfazer.acao()}>
                Desfazer
              </Button>
              <button
                type="button"
                onClick={() => setDesfazer(null)}
                className="text-corpo ml-auto text-tinta-fraca hover:text-tinta"
              >
                dispensar
              </button>
            </div>
          )}

          {erro && <Alerta>{erro}</Alerta>}

          <div className="flex items-center gap-7 border-b border-fio">
            {ABAS.map((t) => {
              const ativo = aba === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAba(t.id)}
                  aria-current={ativo ? "page" : undefined}
                  className={clsx(
                    "text-corpo-lg -mb-px flex items-center gap-1.5 border-b-[1.5px] py-3.5 whitespace-nowrap",
                    "transition-[color,border-color] duration-150 ease-out",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
                    ativo
                      ? "border-tinta font-medium text-tinta"
                      : "border-transparent text-tinta-suave hover:text-tinta",
                  )}
                >
                  {t.label}
                  {t.id === "cadencia" && proximaAtrasada && (
                    <span
                      aria-label="há passo atrasado"
                      className="h-1.5 w-1.5 rounded-full bg-rose-500"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
          {aba === "cadencia" && (
            <CadenciaTab
              negocio={negocio}
              atividadesIniciais={atividades}
              usuarioAtual={usuarioAtual}
              onRegistrouAtividade={() => {
                setNegocio((prev) => ({ ...prev, ultima_atividade_em: new Date().toISOString() }));
                void recarregar();
              }}
            />
          )}
          {aba === "contato" && (
            <ContatoTab
              negocio={negocio}
              onAtualizarContato={(campos) =>
                setNegocio((prev) => ({ ...prev, contato: { ...prev.contato!, ...campos } }))
              }
              onAtualizarNegocio={salvarCampos}
            />
          )}
          {aba === "proposta" &&
            (erroProposta ? (
              <Alerta className="flex flex-wrap items-center gap-3">
                <span>Não consegui carregar as propostas: {erroProposta}</span>
                <Button variante="secundario" tamanho="sm" onClick={() => void carregarProposta()}>
                  Tentar de novo
                </Button>
              </Alerta>
            ) : propostas === null || planos === null ? (
              <p className="text-corpo-lg text-tinta-fraca">Carregando propostas…</p>
            ) : (
              <PropostaTab
                negocio={negocio}
                planos={planos}
                propostasIniciais={propostas}
                usuarioAtual={usuarioAtual}
                onAtualizarContato={(campos) =>
                  setNegocio((prev) => ({ ...prev, contato: { ...prev.contato!, ...campos } }))
                }
              />
            ))}
          {aba === "mensagens" && <MensagensTab negocio={negocio} usuarioAtual={usuarioAtual} />}
        </div>
      </div>

      <EncerrarNegocioModal
        aberto={encerrando}
        aoFechar={() => setEncerrando(false)}
        aoConfirmar={encerrar}
        empresa={empresa}
      />
    </div>
  );
}
