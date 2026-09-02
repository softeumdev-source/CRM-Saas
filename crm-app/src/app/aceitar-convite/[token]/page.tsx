"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, UserPlus } from "lucide-react";

export default function AceitarConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

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
    const { data, error } = await supabase.rpc("aceitar_convite", {
      p_token: token,
      p_nova_senha: senha,
    });
    if (error || !data || data.length === 0) {
      setLoading(false);
      setErro(error?.message || "Convite inválido ou expirado.");
      return;
    }
    const emailAceito = data[0].email;
    setEmail(emailAceito);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: emailAceito,
      password: senha,
    });
    setLoading(false);
    if (loginError) {
      router.push("/login");
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100/70 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <UserPlus className="h-5 w-5 text-indigo-600" />
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            Bem-vindo ao CRM Softeum
          </h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {email ? `Conta ${email} ativada!` : "Defina uma senha para ativar sua conta de vendedor."}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="page-1" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Senha
            </label>
            <input id="page-1"
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>
          <div>
            <label htmlFor="page-2" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Confirmar senha
            </label>
            <input id="page-2"
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
            Ativar minha conta
          </button>
        </form>
      </div>
    </div>
  );
}
