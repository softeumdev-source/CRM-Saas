"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
        setErro(error.message);
        return;
      }
      setRecuperado(true);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      setErro("E-mail ou senha invalidos.");
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
            Gestao comercial &amp; funil de vendas
          </p>
        </div>

        <div className="bg-superficie rounded-2xl border border-fio shadow-cartao p-6">
          {recuperado ? (
            <div className="text-center space-y-3">
              <p className="text-corpo text-tinta-suave">
                Enviamos um link de redefinicao de senha para <strong>{email}</strong>.
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
                <label htmlFor="page-1" className="text-rotulo font-medium text-tinta-suave block mb-1">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-tinta-fraca" />
                  <input id="page-1"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="você@softeum.com.br"
                    className="w-full pl-9 pr-3 py-2.5 text-corpo bg-recuo border border-fio foco rounded-xl"
                  />
                </div>
              </div>

              {!modoRecuperar && (
                <div>
                  <label htmlFor="page-2" className="text-rotulo font-medium text-tinta-suave block mb-1">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-tinta-fraca" />
                    <input id="page-2"
                      type="password"
                      required
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="********"
                      className="w-full pl-9 pr-3 py-2.5 text-corpo bg-recuo border border-fio foco rounded-xl"
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
                {modoRecuperar ? "Enviar link de redefinicao" : "Entrar"}
              </button>

              <button
                type="button"
                onClick={() => setModoRecuperar((v) => !v)}
                className="foco w-full text-rotulo font-medium text-acento hover:underline"
              >
                {modoRecuperar ? "Voltar ao login" : "Esqueci minha senha"}
              </button>
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
