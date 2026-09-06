"use client";

import { useState } from "react";
import { UserPlus, Loader2, Copy, Check, Mail, Clock, RefreshCw, UserX, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { comPrazo } from "@/lib/prazo";
import { mensagemDeFalha } from "@/lib/erros";
import type { Convite, NegocioComRelacoes, Papel, Usuario } from "@/lib/types";
import { DESCRICAO_PAPEL, PAPEIS, ROTULO_PAPEL, ehDoTime, formatarMoeda, iniciais } from "@/lib/types";
import { Alerta, Botao, Cartao, Confirmar, Rotulo, Selecao } from "@/components/ui";
import { useEstadoDaProp } from "@/lib/estadoDaProp";

export function VendedoresTab({
  membros,
  convites: convitesIniciais,
  negocios,
  usuarioAtual,
}: {
  /** Todo mundo que opera negocio: vendedores e SDRs. */
  membros: Usuario[];
  convites: Convite[];
  negocios: NegocioComRelacoes[];
  usuarioAtual: Usuario;
}) {
  // `useEstadoDaProp` e nao `useEffect`: e o padrao oficial do React de
  // ajustar estado durante o render. Com o efeito, o navegador chegava a
  // PINTAR a lista velha antes de o efeito rodar — um piscar de dado
  // desatualizado a cada `router.refresh()`.
  const [convites, setConvites] = useEstadoDaProp(convitesIniciais);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("vendedor");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [emailErro, setEmailErro] = useState<string | null>(null);
  const [remetenteTest, setRemetenteTest] = useState(false);
  const [membrosState, setMembrosState] = useEstadoDaProp(membros);
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const [reenviado, setReenviado] = useState<string | null>(null);
  /** Erro por convite. Antes o reenvio falhava sem deixar rastro nenhum. */
  const [erroPorConvite, setErroPorConvite] = useState<Record<string, string>>({});


  const handleConvidar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resp = await comPrazo(
        fetch("/api/vendedores/convidar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: nome.trim(), email: email.trim(), role: papel }),
        }),
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErro(data.error || "Erro ao enviar o convite.");
        return;
      }
      setLinkGerado(data.link);
      setEmailEnviado(data.emailEnviado);
      setEmailErro(data.emailErro || null);
      setRemetenteTest(data.remetenteTest || false);
      setConvites((prev) => [
        // A linha otimista é um `Convite` de verdade, e não um objeto com `as any`.
        // Duas coisas que o cast escondia: `convites` NÃO tem coluna `nome` (o campo
        // ia junto e nunca era lido — a lista de pendentes mostra e-mail e papel), e
        // `expira_em` é NOT NULL sem valor aqui, porque `convidar_usuario` devolve só
        // `convite_id` e `token`. Fica vazio até o Realtime trazer a linha do banco,
        // o que é seguro porque nada na tela lê essa data.
        {
          id: data.convite_id,
          token: data.token,
          email,
          role: papel,
          status: "pendente",
          tenant_id: usuarioAtual.tenant_id,
          convidado_por: usuarioAtual.id,
          criado_em: new Date().toISOString(),
          expira_em: "",
        },
        ...prev,
      ]);
      setNome("");
      setEmail("");
      setPapel("vendedor");
    } catch (e) {
      // Sem isto, rede caindo deixava `enviando` preso: o formulario ficava
      // desabilitado para sempre, com o icone parado, e nem dava para tentar
      // de novo. O `<Alerta tom="risco">` logo acima do botao ja estava pronto
      // para receber a frase.
      setErro(mensagemDeFalha(e, "Sem conexão. O convite não foi enviado."));
    } finally {
      setEnviando(false);
    }
  };

  const copiarLink = () => {
    if (!linkGerado) return;
    navigator.clipboard.writeText(linkGerado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  /**
   * O REENVIO FALHAVA EM SILENCIO.
   *
   * Era `if (resp.ok) { … }` sem `else` e sem `try`. Quando o reenvio dava
   * errado — Resend sem chave, dominio nao verificado, convite expirado, 500 —
   * o spinner sumia, nenhum ✓ aparecia, nenhuma mensagem aparecia: a linha
   * voltava a mostrar "Reenviar" exatamente como antes do clique. O admin
   * ficava esperando alguem que nunca ia receber o convite. E com a rede
   * caindo, `setReenviandoId(null)` nem rodava — o spinner daquela linha
   * girava para sempre.
   */
  const handleReenviar = async (conviteId: string) => {
    setReenviandoId(conviteId);
    setErroPorConvite((prev) => {
      const { [conviteId]: _fora, ...resto } = prev;
      return resto;
    });
    try {
      const resp = await comPrazo(
        fetch("/api/vendedores/reenviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conviteId }),
        }),
      );
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErroPorConvite((prev) => ({
          ...prev,
          [conviteId]: dados.error || "Não foi possível reenviar o convite.",
        }));
        return;
      }
      setReenviado(conviteId);
      setTimeout(() => setReenviado(null), 2500);
    } catch (e) {
      setErroPorConvite((prev) => ({
        ...prev,
        [conviteId]: mensagemDeFalha(e, "Sem conexão. O convite não foi reenviado."),
      }));
    } finally {
      setReenviandoId(null);
    }
  };

  const [desativando, setDesativando] = useState<Usuario | null>(null);

  const definirAtivo = async (v: Usuario, ativo: boolean): Promise<string | void> => {
    const antes = membrosState;
    setMembrosState((prev) => prev.map((u) => (u.id === v.id ? { ...u, ativo } : u)));
    const { error } = await createClient().from("usuarios").update({ ativo }).eq("id", v.id);
    if (error) {
      setMembrosState(antes);
      return error.message;
    }
  };

  const totalMeta = membrosState.filter((v) => ehDoTime(v) && v.ativo !== false).reduce((acc, v) => acc + (v.meta_mensal || 0), 0);
  const pendentes = convites.filter((c) => c.status === "pendente");
  const ativos = membrosState.filter((v) => v.ativo !== false);
  const inativos = membrosState.filter((v) => v.ativo === false);
  const vendedoresAtivos = ativos.filter(ehDoTime);

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        <Cartao className="space-y-4 h-fit">
          <Rotulo className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-acento" /> Convidar para o time
          </Rotulo>
          <form onSubmit={handleConvidar} className="space-y-3">
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              className="foco w-full px-3 py-2 text-corpo bg-recuo border border-fio rounded-xl"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@softeum.com.br"
              className="foco w-full px-3 py-2 text-corpo bg-recuo border border-fio rounded-xl"
            />
            <div>
              <Selecao
                aria-label="Papel de quem esta sendo convidado"
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PAPEL[p]}
                  </option>
                ))}
              </Selecao>
              <p className="mt-1 px-1 text-rotulo text-tinta-fraca">{DESCRICAO_PAPEL[papel]}</p>
            </div>
            {erro && <Alerta tom="risco">{erro}</Alerta>}
            {/* `carregando` e nao `disabled` + `icone`: o `Botao` so poe
                `animate-spin` no caminho de `carregando`. Passando o `Loader2`
                por `icone`, o spinner saia PARADO — que le como travamento, nao
                como progresso. O primitivo ja desabilita sozinho. */}
            <Botao type="submit" variante="primario" larguraTotal carregando={enviando}>
              Enviar convite
            </Botao>
          </form>

          {linkGerado && (
            <div className={`rounded-xl p-3 text-rotulo ${emailEnviado ? "bg-acento-fraco border border-fio" : "bg-alerta-fraco border border-alerta/40"}`}>
              <p className={`font-medium mb-1.5 ${emailEnviado ? "text-acento" : "text-alerta"}`}>
                {emailEnviado
                  ? remetenteTest
                    ? "E-mail enviado (remetente de teste — só chega no e-mail da conta Resend). Link de apoio:"
                    : "E-mail de convite enviado! Link de apoio:"
                  : emailErro
                    ? `Falha ao enviar e-mail: ${emailErro}`
                    : "RESEND_API_KEY não configurada — envie este link manualmente:"}
              </p>
              {!emailEnviado && (
                <p className="text-alerta mb-2">
                  Configure as variáveis RESEND_API_KEY e RESEND_FROM_EMAIL (com domínio verificado no Resend) nas variáveis de ambiente do Vercel.
                </p>
              )}
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate bg-superficie px-2 py-1 rounded-lg border border-fio">{linkGerado}</code>
                <Botao variante="sutil" tamanho="sm" onClick={copiarLink} aria-label="Copiar o link do convite" icone={copiado ? Check : Copy} />
              </div>
            </div>
          )}

          {pendentes.length > 0 && (
            <div>
              <p className="text-rotulo font-medium uppercase text-tinta-fraca mb-2">Convites pendentes</p>
              <div className="space-y-1.5">
                {pendentes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-rotulo bg-alerta-fraco px-3 py-2 rounded-lg">
                    <span className="flex items-center gap-1.5 font-medium text-alerta truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{c.email}</span>
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full text-rotulo font-medium bg-alerta-fraco text-alerta">
                        {ROTULO_PAPEL[c.role || ""] || c.role}
                      </span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1 text-alerta"><Clock className="h-3 w-3" /> pendente</span>
                      <button
                        type="button"
                        onClick={() => handleReenviar(c.id)}
                        disabled={reenviandoId === c.id}
                        className="foco flex items-center gap-1 font-medium text-acento hover:text-tinta rounded disabled:opacity-50"
                      >
                        {reenviandoId === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : reenviado === c.id ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Reenviar
                      </button>
                    </div>
                    {erroPorConvite[c.id] && (
                      <p className="text-rotulo font-medium text-risco mt-1" role="alert">
                        {erroPorConvite[c.id]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Cartao>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 content-start">
          {/* Eram TRÊS cartões iguais, os três com o número a 28px, e logo
              abaixo vem a lista de pessoas do time — que é o assunto desta
              aba. Três destaques competindo acima do conteúdo real é a mesma
              monotonia do craft R4.

              Um resumo só, numa faixa: quantas pessoas, quanto de meta somada
              e quantos negócios ativos. É informação de contexto, e informação
              de contexto não precisa de três molduras. */}
          <div className="sm:col-span-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-2xl border border-fio bg-superficie px-4 py-3 shadow-cartao">
            <p className="text-corpo text-tinta-suave">
              <span className="text-titulo font-medium text-tinta tabular">{ativos.length}</span>{" "}
              no time —{" "}
              {vendedoresAtivos.length} {vendedoresAtivos.length === 1 ? "vendedor" : "vendedores"}
              {ativos.length - vendedoresAtivos.length > 0 &&
                ` · ${ativos.length - vendedoresAtivos.length} SDR`}
            </p>
            <p className="text-corpo text-tinta-suave">
              <span className="text-titulo font-medium text-acento tabular">{formatarMoeda(totalMeta)}</span>{" "}
              de meta somada
            </p>
            <p className="text-corpo text-tinta-suave">
              <span className="text-titulo font-medium text-ok tabular">
                {negocios.filter((n) => !n.ganho).length}
              </span>{" "}
              negócios ativos
            </p>
          </div>

          {ativos.map((v) => {
            const deles = negocios.filter((n) => n.responsavel_id === v.id);
            const valorAtivo = deles.reduce((acc, n) => acc + (n.valor || 0), 0);
            return (
              <div key={v.id} className="col-span-full sm:col-span-3 bg-superficie p-4 rounded-2xl border border-fio shadow-cartao flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-acento-fraco text-acento flex items-center justify-center text-rotulo font-medium shrink-0">
                    {iniciais(v.nome)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-corpo text-tinta truncate">{v.nome}</p>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-rotulo font-medium bg-recuo text-tinta-suave">
                        {ROTULO_PAPEL[v.role || ""] || v.role}
                      </span>
                    </div>
                    <p className="text-rotulo text-tinta-suave truncate">{v.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Meta e valor em carteira sao medida de vendedor. Para o
                      SDR nao querem dizer nada: ele entrega reuniao, nao
                      receita — mostrar R$ 0,00 ao lado do nome dele seria so
                      um numero errado. */}
                  {ehDoTime(v) ? (
                    <>
                      <MetaMensal usuario={v} />
                      <div className="text-right">
                        <p className="text-corpo font-medium text-acento">{formatarMoeda(valorAtivo)}</p>
                        <p className="text-rotulo text-tinta-fraca">{deles.length} negócios</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-right">
                      <p className="text-corpo font-medium text-tinta-suave">{deles.length}</p>
                      <p className="text-rotulo text-tinta-fraca">leads em mãos</p>
                    </div>
                  )}
                  <Botao
                    variante="sutil"
                    tamanho="sm"
                    onClick={() => setDesativando(v)}
                    title={`Remover ${ROTULO_PAPEL[v.role || ""] || "membro"} do time`}
                    aria-label={`Remover ${v.nome} do time`}
                    icone={UserX}
                  />
                </div>
              </div>
            );
          })}

          {inativos.length > 0 && (
            <div className="col-span-full">
              <p className="text-rotulo font-medium uppercase text-tinta-fraca mb-2 mt-2">Removidos do time ({inativos.length})</p>
              <div className="space-y-2">
                {inativos.map((v) => (
                  <div key={v.id} className="bg-recuo p-3 rounded-2xl border border-fio flex items-center justify-between gap-3 opacity-70">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-xl bg-fio text-tinta-suave flex items-center justify-center text-rotulo font-medium shrink-0">
                        {iniciais(v.nome)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-rotulo text-tinta-suave truncate">{v.nome}</p>
                        <p className="text-rotulo text-tinta-fraca truncate">{v.email}</p>
                      </div>
                    </div>
                    <Botao variante="sutil" tamanho="sm" onClick={() => void definirAtivo(v, true)} icone={UserCheck}>
                      Reativar
                    </Botao>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Confirmar
        aberto={!!desativando}
        titulo="Remover do time"
        rotuloConfirmar="Remover do time"
        aoFechar={() => setDesativando(null)}
        aoConfirmar={() => definirAtivo(desativando!, false)}
        descricao={
          <>
            <strong className="font-medium text-tinta">{desativando?.nome}</strong>{" "}
            deixa de acessar o sistema e some das listas de quem pode receber lead. Os negócios já
            atribuídos continuam com essa pessoa — reatribua antes se for o caso.
          </>
        }
      />
    </div>
  );
}

/** Edicao da meta mensal na propria linha da pessoa. */
function MetaMensal({ usuario }: { usuario: Usuario }) {
  // Espelho de prop, e nao efeito: quando o admin salva a meta de outra
  // pessoa, a lista volta do servidor e este campo tem de acompanhar. Pelo
  // efeito, ele chegava a PINTAR o valor velho antes de corrigir.
  const [meta, setMeta] = useEstadoDaProp(String(usuario.meta_mensal ?? 0));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);


  const alterada = Number(meta) !== (usuario.meta_mensal ?? 0);

  const salvar = async () => {
    const valor = Number(meta);
    if (!Number.isFinite(valor) || valor < 0) {
      setErro("Valor inválido");
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await createClient()
      .from("usuarios")
      .update({ meta_mensal: valor })
      .eq("id", usuario.id);
    setSalvando(false);
    if (error) setErro(error.message);
  };

  return (
    <div className="flex items-center gap-1.5">
      <label
        htmlFor={`meta-${usuario.id}`}
        className="text-rotulo font-medium uppercase text-tinta-fraca"
      >
        Meta
      </label>
      <input
        id={`meta-${usuario.id}`}
        type="number"
        min={0}
        step={1000}
        value={meta}
        onChange={(e) => setMeta(e.target.value)}
        className="foco w-28 rounded-lg border border-fio bg-recuo px-2 py-1.5 text-rotulo font-medium text-tinta transition-[border-color] duration-150 ease-out hover:border-fio-forte"
      />
      {alterada && (
        <Botao tamanho="sm" variante="primario" carregando={salvando} onClick={salvar}>
          Salvar
        </Botao>
      )}
      {erro && <span className="text-rotulo font-medium text-risco">{erro}</span>}
    </div>
  );
}
