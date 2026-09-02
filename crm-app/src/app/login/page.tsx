"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Portao } from "@/components/shell/Portao";
import { Alerta, Button, Field, Input } from "@/components/ui";

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
      setErro("E-mail ou senha inválidos.");
      return;
    }
    router.push(searchParams.get("next") || "/");
    router.refresh();
  };

  return (
    <Portao titulo="CRM Softeum" descricao="Gestão comercial e funil de vendas">
      {recuperado ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-corpo-lg text-tinta-suave">
            Enviamos um link de redefinição de senha para{" "}
            <strong className="font-medium text-tinta">{email}</strong>.
          </p>
          <Button
            variante="sutil"
            onClick={() => {
              setRecuperado(false);
              setModoRecuperar(false);
            }}
          >
            Voltar ao login
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field rotulo="E-mail">
            {(p) => (
              <Input
                {...p}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@softeum.com.br"
              />
            )}
          </Field>

          {!modoRecuperar && (
            <Field rotulo="Senha">
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  required
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              )}
            </Field>
          )}

          {erro && <Alerta>{erro}</Alerta>}

          <Button type="submit" variante="primario" carregando={loading} className="w-full">
            {modoRecuperar ? "Enviar link de redefinição" : "Entrar"}
          </Button>

          <Button
            variante="sutil"
            tamanho="sm"
            onClick={() => setModoRecuperar((v) => !v)}
            className="w-full"
          >
            {modoRecuperar ? "Voltar ao login" : "Esqueci minha senha"}
          </Button>
        </form>
      )}
    </Portao>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
