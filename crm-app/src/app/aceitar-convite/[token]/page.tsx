"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traduzirErroDeAcesso } from "@/lib/erros";
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
      // O `raise exception` do `aceitar_convite` chega aqui como frase de
      // banco: minuscula, sem acento e sem dizer o que fazer. Quem escreve
      // para a pessoa e esta linha, nao a funcao do Postgres.
      setErro(
        error?.message
          ? traduzirErroDeAcesso(error.message)
          : "Convite inválido ou expirado.",
      );
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
    <div className="min-h-screen flex items-center justify-center bg-recuo px-4">
      <div className="surge w-full max-w-md bg-superficie rounded-2xl border border-fio shadow-cartao p-6">
        <div className="flex items-center gap-2 mb-2">
          <UserPlus className="h-5 w-5 text-acento" />
          <h1 className="text-titulo font-semibold text-tinta">
            Bem-vindo ao CRM Softeum
          </h1>
        </div>
        <p className="text-rotulo text-tinta-suave mb-4">
          {email ? `Conta ${email} ativada!` : "Defina uma senha para ativar sua conta de vendedor."}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="convite-senha" className="text-rotulo font-medium text-tinta-suave block mb-1">
              Senha
            </label>
            <input id="convite-senha"
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="foco w-full px-3 py-2.5 text-corpo bg-recuo border border-fio rounded-xl text-tinta placeholder:text-tinta-fraca hover:border-fio-forte transition-[border-color] duration-150 ease-out"
            />
          </div>
          <div>
            <label htmlFor="convite-confirmar" className="text-rotulo font-medium text-tinta-suave block mb-1">
              Confirmar senha
            </label>
            <input id="convite-confirmar"
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
            Ativar minha conta
          </button>
        </form>
      </div>
    </div>
  );
}
