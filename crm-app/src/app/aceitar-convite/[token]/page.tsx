"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Portao } from "@/components/shell/Portao";
import { Alerta, Button, Field, Input } from "@/components/ui";

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
    <Portao
      titulo="Bem-vindo ao CRM Softeum"
      descricao={
        email ? `Conta ${email} ativada!` : "Defina uma senha para ativar sua conta."
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field rotulo="Senha" dica="Ao menos 8 caracteres.">
          {(p) => (
            <Input
              {...p}
              type="password"
              required
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          )}
        </Field>

        <Field rotulo="Confirmar senha">
          {(p) => (
            <Input
              {...p}
              type="password"
              required
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
          )}
        </Field>

        {erro && <Alerta>{erro}</Alerta>}

        <Button type="submit" variante="primario" carregando={loading} className="w-full">
          Ativar minha conta
        </Button>
      </form>
    </Portao>
  );
}
