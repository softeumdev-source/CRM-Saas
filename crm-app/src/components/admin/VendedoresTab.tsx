"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail, RefreshCw, UserCheck, UserX } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import type { Convite, NegocioComRelacoes, Usuario } from "@/lib/types";
import { PAPEIS, ROTULO_PAPEL, formatarMoeda, iniciais } from "@/lib/types";
import {
  Alerta,
  Badge,
  Button,
  Cartao,
  Confirmar,
  Field,
  Input,
  Rotulo,
  Select,
} from "@/components/ui";

export function VendedoresTab({
  vendedores,
  convites: convitesIniciais,
  negocios,
  usuarioAtual,
}: {
  vendedores: Usuario[];
  convites: Convite[];
  negocios: NegocioComRelacoes[];
  usuarioAtual: Usuario;
}) {
  const [convites, setConvites] = useState(convitesIniciais);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<string>("vendedor");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [emailErro, setEmailErro] = useState<string | null>(null);
  const [remetenteTest, setRemetenteTest] = useState(false);
  const [time, setTime] = useState(vendedores);
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const [reenviado, setReenviado] = useState<string | null>(null);
  const [desativando, setDesativando] = useState<Usuario | null>(null);

  // Props chegam renovadas via Realtime + router.refresh() do AdminClient.
  useEffect(() => setTime(vendedores), [vendedores]);
  useEffect(() => setConvites(convitesIniciais), [convitesIniciais]);

  const handleConvidar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const resp = await fetch("/api/vendedores/convidar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), email: email.trim(), role: papel }),
    });
    const data = await resp.json();
    setEnviando(false);
    if (!resp.ok) {
      setErro(data.error || "Erro ao enviar o convite.");
      return;
    }
    setLinkGerado(data.link);
    setEmailEnviado(data.emailEnviado);
    setEmailErro(data.emailErro || null);
    setRemetenteTest(data.remetenteTest || false);
    setConvites((prev) => [
      {
        id: data.convite_id,
        token: data.token,
        email,
        nome,
        role: papel,
        status: "pendente",
        tenant_id: usuarioAtual.tenant_id,
        convidado_por: usuarioAtual.id,
        criado_em: new Date().toISOString(),
        expira_em: "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      ...prev,
    ]);
    setNome("");
    setEmail("");
  };

  const copiarLink = () => {
    if (!linkGerado) return;
    navigator.clipboard.writeText(linkGerado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleReenviar = async (conviteId: string) => {
    setReenviandoId(conviteId);
    const resp = await fetch("/api/vendedores/reenviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conviteId }),
    });
    setReenviandoId(null);
    if (resp.ok) {
      setReenviado(conviteId);
      setTimeout(() => setReenviado(null), 2500);
    }
  };

  const definirAtivo = async (v: Usuario, ativo: boolean): Promise<string | void> => {
    const antes = time;
    setTime((prev) => prev.map((u) => (u.id === v.id ? { ...u, ativo } : u)));
    const { error } = await createClient().from("usuarios").update({ ativo }).eq("id", v.id);
    if (error) {
      setTime(antes);
      return error.message;
    }
  };

  const ativos = time.filter((v) => v.ativo !== false);
  const inativos = time.filter((v) => v.ativo === false);
  const totalMeta = ativos.reduce((acc, v) => acc + (v.meta_mensal || 0), 0);
  const pendentes = convites.filter((c) => c.status === "pendente");

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className="flex h-fit flex-col gap-4">
        <Cartao className="flex flex-col gap-4 p-5">
          <Rotulo>Convidar para o time</Rotulo>

          <form onSubmit={handleConvidar} className="flex flex-col gap-3">
            <Field rotulo="Nome" obrigatorio>
              {(p) => (
                <Input
                  {...p}
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome completo"
                />
              )}
            </Field>
            <Field rotulo="E-mail" obrigatorio>
              {(p) => (
                <Input
                  {...p}
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@softeum.com.br"
                />
              )}
            </Field>
            {/* O papel vinha cravado em "vendedor" na rota, embora a RPC já o
                aceitasse. Agora é escolha — e é por aqui que o SDR vai entrar. */}
            <Field rotulo="Papel" dica="Administrador vê o painel inteiro e aprova descontos.">
              {(p) => (
                <Select {...p} value={papel} onChange={(e) => setPapel(e.target.value)}>
                  {PAPEIS.map((r) => (
                    <option key={r} value={r}>
                      {ROTULO_PAPEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {erro && <Alerta>{erro}</Alerta>}

            <Button type="submit" variante="primario" carregando={enviando} className="w-full">
              Enviar convite
            </Button>
          </form>

          {linkGerado && (
            <div
              className={clsx(
                "flex flex-col gap-2 rounded-lg p-3",
                emailEnviado ? "bg-indigo-50" : "bg-amber-50",
              )}
            >
              <p
                className={clsx(
                  "text-corpo font-medium",
                  emailEnviado ? "text-indigo-800" : "text-amber-800",
                )}
              >
                {emailEnviado
                  ? remetenteTest
                    ? "E-mail enviado (remetente de teste — só chega no e-mail da conta Resend). Link de apoio:"
                    : "E-mail de convite enviado. Link de apoio:"
                  : emailErro
                    ? `Falha ao enviar e-mail: ${emailErro}`
                    : "RESEND_API_KEY não configurada — envie este link manualmente:"}
              </p>
              {!emailEnviado && (
                <p className="text-corpo text-amber-800">
                  Configure RESEND_API_KEY e RESEND_FROM_EMAIL (com domínio verificado no Resend)
                  nas variáveis de ambiente do Vercel.
                </p>
              )}
              <div className="flex items-center gap-2">
                <code className="text-corpo min-w-0 flex-1 truncate rounded-lg bg-cartao px-2 py-1">
                  {linkGerado}
                </code>
                <Button
                  variante="sutil"
                  tamanho="sm"
                  icone={copiado ? Check : Copy}
                  aria-label="Copiar link"
                  onClick={copiarLink}
                />
              </div>
            </div>
          )}
        </Cartao>

        {pendentes.length > 0 && (
          <div className="flex flex-col gap-2">
            <Rotulo>Convites pendentes · {pendentes.length}</Rotulo>
            <Cartao className="flex flex-col p-0">
              {pendentes.map((c, i) => (
                <div
                  key={c.id}
                  className={clsx(
                    "flex items-center justify-between gap-2 px-4 py-3",
                    i > 0 && "border-t border-fio",
                  )}
                >
                  <span className="text-corpo-lg flex min-w-0 items-center gap-1.5 text-tinta">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-tinta-fraca" aria-hidden />
                    <span className="truncate">{c.email}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tom="atencao">{ROTULO_PAPEL[c.role] ?? c.role}</Badge>
                    <Button
                      variante="sutil"
                      tamanho="sm"
                      disabled={reenviandoId === c.id}
                      icone={
                        reenviandoId === c.id ? Loader2 : reenviado === c.id ? Check : RefreshCw
                      }
                      onClick={() => handleReenviar(c.id)}
                    >
                      Reenviar
                    </Button>
                  </div>
                </div>
              ))}
            </Cartao>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Resumo rotulo="No time" valor={String(ativos.length)} />
          <Resumo rotulo="Meta somada" valor={formatarMoeda(totalMeta)} />
          <Resumo
            rotulo="Negócios abertos"
            valor={String(negocios.filter((n) => !n.ganho).length)}
          />
        </div>

        <Cartao className="flex flex-col p-0">
          {ativos.map((v, i) => (
            <LinhaPessoa
              key={v.id}
              usuario={v}
              negocios={negocios}
              primeira={i === 0}
              aoDesativar={() => setDesativando(v)}
            />
          ))}
          {ativos.length === 0 && (
            <p className="text-corpo-lg px-5 py-6 text-tinta-fraca">Ninguém no time ainda.</p>
          )}
        </Cartao>

        {inativos.length > 0 && (
          <div className="flex flex-col gap-2">
            <Rotulo>Removidos · {inativos.length}</Rotulo>
            <Cartao className="flex flex-col p-0">
              {inativos.map((v, i) => (
                <div
                  key={v.id}
                  className={clsx(
                    "flex items-center justify-between gap-3 px-5 py-3",
                    i > 0 && "border-t border-fio",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar nome={v.nome} apagado />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-corpo-lg truncate text-tinta-suave">{v.nome}</span>
                      <span className="text-corpo truncate text-tinta-fraca">{v.email}</span>
                    </div>
                  </div>
                  <Button
                    variante="sutil"
                    tamanho="sm"
                    icone={UserCheck}
                    onClick={() => void definirAtivo(v, true)}
                  >
                    Reativar
                  </Button>
                </div>
              ))}
            </Cartao>
          </div>
        )}
      </div>

      <Confirmar
        aberto={!!desativando}
        titulo="Remover do time"
        rotuloConfirmar="Remover do time"
        aoFechar={() => setDesativando(null)}
        aoConfirmar={() => definirAtivo(desativando!, false)}
        descricao={
          <>
            <strong className="font-medium text-tinta">{desativando?.nome}</strong> deixa de acessar
            o sistema e some das listas de quem pode receber lead. Os negócios já atribuídos
            continuam com essa pessoa — reatribua antes se for o caso.
          </>
        }
      />
    </div>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Cartao className="flex flex-col gap-1 p-4">
      <Rotulo>{rotulo}</Rotulo>
      <span className="font-serif text-2xl leading-none tabular-nums text-tinta">{valor}</span>
    </Cartao>
  );
}

function Avatar({ nome, apagado }: { nome: string; apagado?: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-corpo font-semibold",
        apagado ? "bg-recuo text-tinta-fraca" : "bg-recuo text-tinta-suave",
      )}
    >
      {iniciais(nome)}
    </span>
  );
}

/**
 * A meta mensal era somada no topo mas não havia onde defini-la — só dava para
 * mudar direto no banco. Agora ela se edita na própria linha da pessoa.
 */
function LinhaPessoa({
  usuario,
  negocios,
  primeira,
  aoDesativar,
}: {
  usuario: Usuario;
  negocios: NegocioComRelacoes[];
  primeira: boolean;
  aoDesativar: () => void;
}) {
  const [meta, setMeta] = useState(String(usuario.meta_mensal ?? 0));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setMeta(String(usuario.meta_mensal ?? 0)), [usuario.meta_mensal]);

  const deles = negocios.filter((n) => n.responsavel_id === usuario.id);
  const emAberto = deles.filter((n) => !n.ganho).reduce((acc, n) => acc + (n.valor || 0), 0);
  const alterada = Number(meta) !== (usuario.meta_mensal ?? 0);

  const salvarMeta = async () => {
    const valor = Number(meta);
    if (!Number.isFinite(valor) || valor < 0) {
      setErro("Informe um valor válido.");
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
    <div className={clsx("flex flex-col gap-3 px-5 py-4", !primeira && "border-t border-fio")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nome={usuario.nome} />
          <div className="flex min-w-0 flex-col">
            <span className="text-titulo truncate text-tinta">{usuario.nome}</span>
            <span className="text-corpo truncate text-tinta-suave">{usuario.email}</span>
          </div>
          <Badge>{ROTULO_PAPEL[usuario.role] ?? usuario.role}</Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="font-serif text-lg leading-none tabular-nums text-tinta">
              {formatarMoeda(emAberto)}
            </span>
            <p className="text-corpo text-tinta-fraca">{deles.length} negócios</p>
          </div>
          <Button
            variante="sutil"
            tamanho="sm"
            icone={UserX}
            aria-label={`Remover ${usuario.nome} do time`}
            title="Remover do time"
            onClick={aoDesativar}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Rotulo>Meta mensal</Rotulo>
        <div className="w-40">
          <Input
            type="number"
            min={0}
            step={100}
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            aria-label={`Meta mensal de ${usuario.nome}`}
          />
        </div>
        <Button
          variante="secundario"
          tamanho="sm"
          disabled={!alterada}
          carregando={salvando}
          onClick={salvarMeta}
        >
          Salvar meta
        </Button>
        {erro && <span className="text-corpo text-rose-700">{erro}</span>}
      </div>
    </div>
  );
}
