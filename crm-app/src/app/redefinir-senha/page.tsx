"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Portao } from "@/components/shell/Portao";
import { Alerta, Button, Field, Input } from "@/components/ui";

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
    <Portao titulo="Nova senha" descricao="Defina a senha que você vai usar para entrar.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field rotulo="Nova senha" dica="Ao menos 8 caracteres.">
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
          Salvar nova senha
        </Button>
      </form>
    </Portao>
  );
}
