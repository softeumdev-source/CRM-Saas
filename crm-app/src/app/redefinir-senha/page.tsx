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
    <div className="min-h-screen flex items-center justify-center bg-recuo px-4">
      <div className="w-full max-w-md bg-superficie rounded-2xl border border-fio shadow-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-acento" />
          <h1 className="text-titulo font-semibold text-tinta">
            Defina sua nova senha
          </h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="page-1" className="text-rotulo font-semibold text-tinta-suave block mb-1">
              Nova senha
            </label>
            <input id="page-1"
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full px-3 py-2.5 text-corpo bg-recuo border border-fio rounded-xl"
            />
          </div>
          <div>
            <label htmlFor="page-2" className="text-rotulo font-semibold text-tinta-suave block mb-1">
              Confirmar senha
            </label>
            <input id="page-2"
              type="password"
              required
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="w-full px-3 py-2.5 text-corpo bg-recuo border border-fio rounded-xl"
            />
          </div>
          {erro && (
            <p className="text-rotulo font-medium text-risco bg-risco-fraco rounded-lg px-3 py-2">
              {erro}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-corpo font-semibold text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar nova senha
          </button>
        </form>
      </div>
    </div>
  );
}
