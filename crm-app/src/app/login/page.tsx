"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traduzirErroDeAcesso } from "@/lib/erros";
import { Loader2, Lock, Mail, TrendingUp } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [recuperado, setRecuperado] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    const supabase = createClient();

    if (modoRecuperar) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      setLoading(false);
      if (error) {
        // A frase do Supabase vem em ingles ("For security purposes, you can
        // only request this after 51 seconds.") e caia inteira dentro de um
        // aviso em portugues, na PRIMEIRA tela que qualquer pessoa ve.
        setErro(traduzirErroDeAcesso(error.message));
        return;
      }
      setRecuperado(true);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      setErro("E-mail ou senha inválidos.");
      return;
    }
    router.push(searchParams.get("next") || "/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-recuo px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-acento-solido p-0.5 flex items-center justify-center mb-3">
            {/* 10px NAO e valor arbitrario solto: e o raio CONCENTRICO do
                quadrado interno — 12px do `rounded-xl` de fora menos os 2px do
                `p-0.5`. Usar `rounded-lg` (8px) aqui abriria uma meia-lua de
                folga em cada canto. */}
            <div className="h-full w-full bg-superficie rounded-[10px] flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-acento" />
            </div>
          </div>
          <h1 className="text-titulo font-semibold text-tinta tracking-tight">
            CRM Softeum
          </h1>
          <p className="text-rotulo text-tinta-suave mt-1">
            Gestão comercial &amp; funil de vendas
          </p>
        </div>

        <div className="surge bg-superficie rounded-2xl border border-fio shadow-cartao p-6">
          {recuperado ? (
            <div className="text-center space-y-3">
              <p className="text-corpo text-tinta-suave">
                Enviamos um link de redefinição de senha para <strong>{email}</strong>.
              </p>
              <button
                onClick={() => {
                  setRecuperado(false);
                  setModoRecuperar(false);
                }}
                className="foco text-rotulo font-semibold text-acento hover:underline"
              >
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="text-rotulo font-medium text-tinta-suave block mb-1">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-tinta-fraca" />
                  <input id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="você@softeum.com.br"
                    className="w-full pl-9 pr-3 py-2.5 text-corpo bg-recuo border border-fio foco rounded-xl text-tinta placeholder:text-tinta-fraca hover:border-fio-forte transition-[border-color] duration-150 ease-out"
                  />
                </div>
              </div>

              {!modoRecuperar && (
                <div>
                  <label htmlFor="login-senha" className="text-rotulo font-medium text-tinta-suave block mb-1">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-tinta-fraca" />
                    <input id="login-senha"
                      type="password"
                      required
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-corpo bg-recuo border border-fio foco rounded-xl text-tinta placeholder:text-tinta-fraca hover:border-fio-forte transition-[border-color] duration-150 ease-out"
                    />
                  </div>
                </div>
              )}

              {erro && (
                <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">
                  {erro}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="foco w-full py-2.5 text-corpo font-semibold text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl transition-colors duration-150 ease-out disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {modoRecuperar ? "Enviar link de redefinição" : "Entrar"}
              </button>

              {/* Era outro controle de LARGURA TOTAL logo embaixo do "Entrar", no
                  acento — duas barras da mesma cor, uma sobre a outra, no unico
                  ponto de decisao da tela. Entrar e a acao; recuperar a senha e
                  a saida de emergencia, e saida de emergencia nao disputa
                  atencao com a porta da frente. Vira um link discreto, do
                  tamanho do proprio texto e centralizado. */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setModoRecuperar((v) => !v)}
                  className="foco rounded-lg px-2 py-1 text-rotulo font-medium text-tinta-suave hover:text-tinta hover:underline"
                >
                  {modoRecuperar ? "Voltar ao login" : "Esqueci minha senha"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
