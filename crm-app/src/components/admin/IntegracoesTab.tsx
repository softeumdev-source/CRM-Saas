"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Calendar, Check, Inbox, Link2, Loader2, Send, Unlink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { comPrazo } from "@/lib/prazo";
import { Alerta, Botao, Campo, Cartao, Confirmar, Entrada, Rotulo, Selecao, Selo } from "@/components/ui";
import { CaixaDeEntradaGoogle } from "@/components/admin/CaixaDeEntradaGoogle";
import { HorarioDeAtendimento } from "@/components/admin/HorarioDeAtendimento";
import { formatarDataHora } from "@/lib/atividades";
import { temEnvioGmail, temGmail } from "@/lib/google/escopos";
import type { Tables } from "@/lib/supabase/types";

type Integracao = Tables<"integracoes_google"> & { usuario: { nome: string } | null };

export function IntegracoesTab({
  usuarioAtual,
  preferenciasAgenda,
}: {
  usuarioAtual: Tables<"usuarios">;
  preferenciasAgenda: Tables<"preferencias_agenda"> | null;
}) {
  const [conexoes, setConexoes] = useState<Integracao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // DERIVADO da URL, e não estado: a volta do consentimento traz
  // `?google_erro=...`, e ler isso durante o render resolve de vez o problema
  // que o estado separado existia para contornar — o `setErro(null)` do
  // carregamento resolvia DEPOIS e engolia a mensagem (medido no navegador: a
  // faixa não aparecia). O que não é estado ninguém apaga por engano.
  const parametros = useSearchParams();
  const falhaDaVolta = parametros.get("google_erro");
  const erroDaVolta = falhaDaVolta ? `A conexão com a Google não foi concluída: ${falhaDaVolta}` : null;
  const [desconectando, setDesconectando] = useState<Integracao | null>(null);
  // A caixa por onde o CRM MANDA e-mail para o cliente. É do tenant, não da
  // pessoa: a cadência e a proposta saem sempre do mesmo endereço, senão a
  // resposta do cliente cai numa caixa diferente a cada toque e a conversa se
  // parte em várias.
  const [caixaDoTenant, setCaixaDoTenant] = useState<string>("");
  const [salvandoCaixa, setSalvandoCaixa] = useState(false);
  /**
   * O nome que o cliente vê no remetente.
   *
   * É da CAIXA, e não de quem conectou o Google nem de quem clicou em enviar.
   * Antes ele era derivado do responsável pelo negócio, e por isso um lead sem
   * dono — o estado normal de todo lead novo em prospecção — saía assinado com
   * um literal, e um usuário de semente chegou a assinar dois e-mails.
   */
  const [nomeDaCaixa, setNomeDaCaixa] = useState<string>("");
  const [salvandoNome, setSalvandoNome] = useState(false);

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
      const { data: tenant } = await createClient()
        .from("tenants")
        .select("caixa_email_usuario_id, caixa_email_nome")
        .eq("id", usuarioAtual.tenant_id || "")
        .maybeSingle();
      setCaixaDoTenant(tenant?.caixa_email_usuario_id || "");
      setNomeDaCaixa(tenant?.caixa_email_nome || "");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, [usuarioAtual.tenant_id]);

  // A regra `set-state-in-effect` acusa qualquer efeito que chame função que
  // mexe em estado, mesmo quando TODO `setState` acontece depois de um `await`
  // — medido com uma sonda: a busca assíncrona é acusada igual à atribuição
  // síncrona. Aqui não há `setState` síncrono nenhum: `carregar` só escreve
  // depois da resposta do banco. Buscar dado ao montar é o que efeito serve
  // para fazer, e contorcer isso para calar a regra sairia mais caro.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  const minha = conexoes.find((c) => c.usuario_id === usuarioAtual.id);
  // Só entra na lista quem PODE mandar. Oferecer uma conexão sem `gmail.send`
  // trocaria um erro de configuração legível por um 403 da Google no primeiro
  // envio da cadência.
  const podemEnviar = conexoes.filter((c) => temEnvioGmail(c.escopos) && !c.ultimo_erro);

  const salvarCaixa = async (usuarioId: string) => {
    setCaixaDoTenant(usuarioId);
    setSalvandoCaixa(true);
    const { error } = await createClient()
      .from("tenants")
      .update({ caixa_email_usuario_id: usuarioId || null })
      .eq("id", usuarioAtual.tenant_id || "");
    setSalvandoCaixa(false);
    if (error) setErro(`Não foi possível salvar a caixa de envio: ${error.message}`);
  };

  /**
   * Grava no `blur`, e não a cada tecla: são ~15 caracteres, e um `update` por
   * letra digitada encheria o banco de escrita por nada.
   *
   * `await`, e não `void`: o builder do PostgREST é um thenable preguiçoso e
   * sem consumir a promise a requisição nunca sai — foi assim que o selo de
   * "respondeu" ficou aceso por horas.
   */
  const salvarNome = async () => {
    setSalvandoNome(true);
    const { error } = await createClient()
      .from("tenants")
      .update({ caixa_email_nome: nomeDaCaixa.trim() || null })
      .eq("id", usuarioAtual.tenant_id || "");
    setSalvandoNome(false);
    if (error) setErro(`Não foi possível salvar o nome do remetente: ${error.message}`);
  };

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
      <Cartao className="p-8 flex items-center justify-center gap-2 text-corpo text-tinta-suave">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando integrações…
      </Cartao>
    );
  }

  return (
    <div className="space-y-5">
      {(erroDaVolta || erro) && (
        <Alerta tom="risco">{erroDaVolta || erro}</Alerta>
      )}

      <Cartao className="space-y-4">
        <div>
          <Rotulo className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-acento" /> Google Agenda
          </Rotulo>
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
                    {temEnvioGmail(c.escopos) && (
                      <Selo tom="ok" icone={Send}>
                        envio
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
      </Cartao>

      <CaixaDeEntradaGoogle integracao={minha ?? null} />

      <Cartao className="space-y-4">
        <div>
          <Rotulo className="flex items-center gap-2">
            <Send className="h-4 w-4 text-acento" /> Caixa de envio do time
          </Rotulo>
          <p className="text-rotulo text-tinta-suave mt-1">
            Por qual conta o CRM manda e-mail para o cliente — a cadência, a proposta e as
            respostas. É uma só para o time inteiro, e de propósito: a resposta do cliente volta
            para a mesma caixa que a sincronização lê, dentro da mesma conversa. O nome e o
            endereço são os dois da caixa — o cliente conhece uma pessoa só, e ela não muda
            conforme quem clicou em enviar.
          </p>
        </div>

        {podemEnviar.length === 0 ? (
          <Alerta tom="alerta">
            Nenhuma conta conectada tem permissão de envio ainda. Conecte a conta comercial pelo
            botão do inbox acima — o consentimento agora pede leitura <strong>e</strong> envio.
            Enquanto isso, nada de e-mail sai para o cliente.
          </Alerta>
        ) : (
          <Campo rotulo="Conta que envia">
            {(props) => (
              <Selecao
                {...props}
                value={caixaDoTenant}
                disabled={salvandoCaixa}
                onChange={(e) => void salvarCaixa(e.target.value)}
              >
                <option value="">Nenhuma — o CRM não manda e-mail para o cliente</option>
                {podemEnviar.map((c) => (
                  <option key={c.id} value={c.usuario_id}>
                    {c.email_google} ({c.usuario?.nome || "—"})
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        )}

        {podemEnviar.length > 0 && (
          <Campo
            rotulo="Nome que o cliente vê"
            dica="Vai no remetente e na assinatura do corpo. Sai igual em cadência, resposta e proposta."
          >
            {(props) => (
              <Entrada
                {...props}
                value={nomeDaCaixa}
                disabled={salvandoNome}
                placeholder="William Machado"
                onChange={(e) => setNomeDaCaixa(e.target.value)}
                onBlur={() => void salvarNome()}
              />
            )}
          </Campo>
        )}

        {/* Convite de usuário do CRM não passa por aqui: é e-mail de sistema e
            continua saindo pelo Resend, para dar para convidar alguém mesmo com
            a conta Google fora do ar. */}
        <p className="text-rotulo text-tinta-fraca">
          O convite para entrar no CRM não usa esta caixa — ele continua saindo pelo remetente de
          sistema, para você conseguir convidar alguém mesmo se a conta Google cair.
        </p>
      </Cartao>

      {/* Logo abaixo do cartão da agenda, e não numa aba nova: é a MESMA
          conexão do Google que alimenta as duas coisas, e quem acabou de
          conectar a agenda é exatamente quem precisa dizer qual é o
          expediente. */}
      <HorarioDeAtendimento inicial={preferenciasAgenda} />

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
