"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traduzirErroDeAcesso } from "@/lib/erros";
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
      // Sem sessao o `updateUser` devolve "Auth session missing!", que e
      // exatamente o que a pessoa ve quando o link do e-mail venceu ou ja foi
      // usado — o caso mais comum desta tela, e o mais mudo em ingles.
      setErro(traduzirErroDeAcesso(error.message));
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-recuo px-4">
      <div className="surge w-full max-w-md bg-superficie rounded-2xl border border-fio shadow-cartao p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-acento" />
          <h1 className="text-titulo font-semibold text-tinta">
            Defina sua nova senha
          </h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nova-senha" className="text-rotulo font-medium text-tinta-suave block mb-1">
              Nova senha
            </label>
            <input id="nova-senha"
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="foco w-full px-3 py-2.5 text-corpo bg-recuo border border-fio rounded-xl text-tinta placeholder:text-tinta-fraca hover:border-fio-forte transition-[border-color] duration-150 ease-out"
            />
          </div>
          <div>
            <label htmlFor="confirmar-senha" className="text-rotulo font-medium text-tinta-suave block mb-1">
              Confirmar senha
            </label>
            <input id="confirmar-senha"
              type="password"
              required
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="foco w-full px-3 py-2.5 text-corpo bg-recuo border border-fio rounded-xl text-tinta placeholder:text-tinta-fraca hover:border-fio-forte transition-[border-color] duration-150 ease-out"
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
            className="foco w-full py-2.5 text-corpo font-semibold text-acento-tinta bg-acento-solido hover:bg-acento-solido-hover rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar nova senha
          </button>
        </form>
      </div>
    </div>
  );
}
