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
    <div className="min-h-screen flex items-center justify-center bg-slate-100/70 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 p-0.5 flex items-center justify-center shadow-md shadow-indigo-500/20 mb-3">
            <div className="h-full w-full bg-white dark:bg-slate-900 rounded-[10px] flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            CRM Softeum
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gestao comercial &amp; funil de vendas
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl p-6">
          {recuperado ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Enviamos um link de redefinicao de senha para <strong>{email}</strong>.
              </p>
              <button
                onClick={() => {
                  setRecuperado(false);
                  setModoRecuperar(false);
                }}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="você@softeum.com.br"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
              </div>

              {!modoRecuperar && (
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="********"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </div>
                </div>
              )}

              {erro && (
                <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">
                  {erro}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {modoRecuperar ? "Enviar link de redefinicao" : "Entrar"}
              </button>

              <button
                type="button"
                onClick={() => setModoRecuperar((v) => !v)}
                className="w-full text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
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
