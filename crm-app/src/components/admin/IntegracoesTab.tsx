"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calendar, Check, Inbox, Link2, Loader2, Unlink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { comPrazo } from "@/lib/prazo";
import { Botao, Confirmar, Selo } from "@/components/ui";
import { CaixaDeEntradaGoogle } from "@/components/admin/CaixaDeEntradaGoogle";
import { formatarDataHora } from "@/lib/atividades";
import { temGmail } from "@/lib/google/escopos";
import type { Tables } from "@/lib/supabase/types";

type Integracao = Tables<"integracoes_google"> & { usuario: { nome: string } | null };

export function IntegracoesTab({ usuarioAtual }: { usuarioAtual: Tables<"usuarios"> }) {
  const [conexoes, setConexoes] = useState<Integracao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Estado separado de propósito: o erro que volta do consentimento não pode
  // ser apagado pelo `setErro(null)` do carregamento, que resolve DEPOIS do
  // efeito e engolia a mensagem. Medido no navegador: a faixa não aparecia.
  const [erroDaVolta, setErroDaVolta] = useState<string | null>(null);
  const [desconectando, setDesconectando] = useState<Integracao | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { data, error } = await comPrazo(
        createClient()
          .from("integracoes_google")
          .select("*, usuario:usuarios(nome)")
          .order("conectado_em", { ascending: false }),
      );
      if (error) {
        setErro(`Não foi possível carregar: ${error.message}`);
        return;
      }
      setErro(null);
      setConexoes((data || []) as unknown as Integracao[]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    // A volta do consentimento traz ?google=conectado ou ?google_erro=...
    const p = new URLSearchParams(window.location.search);
    const falha = p.get("google_erro");
    if (falha) setErroDaVolta(`A conexão com a Google não foi concluída: ${falha}`);
  }, [carregar]);

  const minha = conexoes.find((c) => c.usuario_id === usuarioAtual.id);

  const desconectar = async (): Promise<string | void> => {
    if (!desconectando) return;
    const { error } = await createClient()
      .from("integracoes_google")
      .delete()
      .eq("id", desconectando.id);
    if (error) return error.message;
    void carregar();
  };

  if (carregando) {
    return (
      <div className="bg-superficie rounded-2xl border border-fio shadow-xs p-8 flex items-center justify-center gap-2 text-corpo text-tinta-suave">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando integrações…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(erroDaVolta || erro) && (
        <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">
          {erroDaVolta || erro}
        </p>
      )}

      <div className="bg-superficie rounded-2xl border border-fio shadow-xs p-5 space-y-4">
        <div>
          <h3 className="font-medium text-corpo text-tinta flex items-center gap-2">
            <Calendar className="h-4 w-4 text-acento" /> Google Agenda
          </h3>
          <p className="text-rotulo text-tinta-suave mt-1">
            Conectando sua conta, o CRM cria o evento na <strong>sua</strong> agenda, com link do
            Meet, e manda o convite para o cliente. Cada pessoa conecta a própria conta — o convite
            sai no nome de quem vai à reunião.
          </p>
        </div>

        {minha ? (
          <div className="rounded-2xl border border-ok/40 bg-ok-fraco p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-corpo font-medium text-ok flex items-center gap-2">
                <Check className="h-4 w-4" /> {minha.email_google}
              </p>
              <p className="text-rotulo text-ok mt-0.5">
                Conectada em {formatarDataHora(minha.conectado_em)}
              </p>
              {minha.ultimo_erro && (
                <p className="text-rotulo font-medium text-risco mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {minha.ultimo_erro} — reconecte.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Botao variante="secundario" tamanho="sm" onClick={() => { window.location.href = "/api/google/conectar"; }}>
                <Link2 className="h-3.5 w-3.5" /> Reconectar
              </Botao>
              <Botao variante="perigo" tamanho="sm" onClick={() => setDesconectando(minha)}>
                <Unlink className="h-3.5 w-3.5" /> Desconectar
              </Botao>
            </div>
          </div>
        ) : (
          <Botao variante="primario" onClick={() => { window.location.href = "/api/google/conectar"; }}>
            <Link2 className="h-4 w-4" /> Conectar minha conta Google
          </Botao>
        )}

        {conexoes.length > 0 && (
          <div>
            <p className="text-rotulo font-medium uppercase text-tinta-fraca mb-2">
              Contas conectadas no time ({conexoes.length})
            </p>
            <div className="space-y-2">
              {conexoes.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-fio p-3"
                >
                  <div className="min-w-0">
                    <p className="text-corpo font-medium text-tinta truncate">
                      {c.usuario?.nome || "—"}
                    </p>
                    <p className="text-rotulo text-tinta-suave truncate">{c.email_google}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {temGmail(c.escopos) && (
                      <Selo tom="acento" icone={Inbox}>
                        inbox
                      </Selo>
                    )}
                    {c.ultimo_erro ? (
                      <span className="text-rotulo font-medium text-risco">precisa reconectar</span>
                    ) : (
                      <span className="text-rotulo font-medium text-ok">ativa</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <CaixaDeEntradaGoogle integracao={minha ?? null} />

      <Confirmar
        aberto={desconectando !== null}
        titulo="Desconectar a conta Google?"
        descricao="O CRM deixa de criar convites nesta agenda. Os eventos já criados continuam lá — desconectar aqui não apaga nada na Google."
        rotuloConfirmar="Desconectar"
        aoFechar={() => setDesconectando(null)}
        aoConfirmar={desconectar}
      />
    </div>
  );
}
