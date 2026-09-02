"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, KeyRound } from "lucide-react";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) {
      setErro("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (senha !== confirmar) {
      setErro("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) {
      setErro(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100/70 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-indigo-600" />
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            Defina sua nova senha
          </h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Nova senha
            </label>
            <input
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Confirmar senha
            </label>
            <input
              type="password"
              required
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          {erro && (
            <p className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar nova senha
          </button>
        </form>
      </div>
    </div>
  );
}
