"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { NegocioComRelacoes } from "@/lib/types";
import { PRIORIDADES } from "@/lib/types";
import { Alerta, Badge, Button, Cartao, Field, Input, Rotulo, Select } from "@/components/ui";
import { ROTULO_PRIORIDADE } from "@/components/ui";

type CamposContato = Partial<NonNullable<NegocioComRelacoes["contato"]>>;

/**
 * Era a aba "Visão Geral", e tinha DOIS modelos de salvamento na mesma tela:
 * os campos do contato exigiam "Salvar alterações", mas a prioridade — que
 * ficava num cartão de gradiente ao lado — gravava sozinha no change, sem
 * aviso nenhum.
 *
 * Agora há um modelo só: tudo é rascunho até "Salvar", o botão só acorda
 * quando algo mudou de verdade, e "Descartar" volta ao que está no banco.
 */
export function ContatoTab({
  negocio,
  onAtualizarContato,
  onAtualizarNegocio,
}: {
  negocio: NegocioComRelacoes;
  onAtualizarContato: (campos: CamposContato) => void;
  onAtualizarNegocio: (campos: Partial<NegocioComRelacoes>) => Promise<void>;
}) {
  const salvos = useMemo(
    () => ({
      nome: negocio.contato?.nome || "",
      empresa: negocio.contato?.empresa || "",
      email: negocio.contato?.email || "",
      telefone: negocio.contato?.telefone || "",
      whatsapp: negocio.contato?.whatsapp || "",
      cnpj: negocio.contato?.cnpj || "",
      cargo: negocio.contato?.cargo || "",
      estado: negocio.contato?.estado || "",
      prioridade: negocio.prioridade || "media",
    }),
    [negocio.contato, negocio.prioridade],
  );

  const [form, setForm] = useState(salvos);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O Realtime pode trazer uma versão nova enquanto a aba está aberta. Só
  // aceita se não houver rascunho, para não apagar o que a pessoa digitou.
  const sujo = useMemo(
    () => (Object.keys(salvos) as (keyof typeof salvos)[]).some((k) => form[k] !== salvos[k]),
    [form, salvos],
  );
  useEffect(() => {
    if (!sujo) setForm(salvos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salvos]);

  const salvar = async () => {
    if (!negocio.contato || !form.nome.trim()) return;
    setSalvando(true);
    setErro(null);

    const camposContato = {
      nome: form.nome.trim(),
      empresa: form.empresa.trim() || null,
      email: form.email.trim() || null,
      telefone: form.telefone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      cnpj: form.cnpj.trim() || null,
      cargo: form.cargo.trim() || null,
      estado: form.estado.trim() || null,
    };

    const { error } = await createClient()
      .from("contatos")
      .update({ ...camposContato, atualizado_em: new Date().toISOString() })
      .eq("id", negocio.contato.id);

    if (error) {
      setSalvando(false);
      setErro(
        error.message.includes("dominio") || error.message.includes("concorrentes")
          ? "Não é permitido cadastrar e-mails deste domínio."
          : error.message.includes("duplicate") || error.code === "23505"
            ? "Já existe um contato com este e-mail."
            : error.message,
      );
      return;
    }
    onAtualizarContato(camposContato);

    if (form.prioridade !== salvos.prioridade) {
      await onAtualizarNegocio({ prioridade: form.prioridade });
    }

    setSalvando(false);
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  };

  const campo = (chave: keyof typeof form) => ({
    value: form[chave],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [chave]: e.target.value })),
  });

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Cartao className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <Rotulo>Dados do contato</Rotulo>
          {ok && (
            <span className="text-corpo flex items-center gap-1 font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" aria-hidden /> Salvo
            </span>
          )}
        </div>

        {erro && <Alerta>{erro}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field rotulo="Nome" obrigatorio>
            {(p) => <Input {...p} {...campo("nome")} />}
          </Field>
          <Field rotulo="Empresa">{(p) => <Input {...p} {...campo("empresa")} />}</Field>
          <Field rotulo="Cargo">{(p) => <Input {...p} {...campo("cargo")} />}</Field>
          <Field rotulo="Estado (UF)">{(p) => <Input {...p} {...campo("estado")} maxLength={2} />}</Field>
          <Field rotulo="E-mail">{(p) => <Input {...p} type="email" {...campo("email")} />}</Field>
          <Field rotulo="Telefone">{(p) => <Input {...p} {...campo("telefone")} />}</Field>
          <Field rotulo="WhatsApp">
            {(p) => <Input {...p} {...campo("whatsapp")} placeholder="(00) 00000-0000" />}
          </Field>
          <Field
            rotulo="CNPJ"
            dica={form.cnpj.trim() ? undefined : "Sem CNPJ a proposta não pode ser gerada."}
            erro={undefined}
          >
            {(p) => <Input {...p} {...campo("cnpj")} placeholder="00.000.000/0000-00" />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field rotulo="Prioridade" dica="Aparece como selo no card do pipeline.">
            {(p) => (
              <Select {...p} {...campo("prioridade")}>
                {PRIORIDADES.map((pr) => (
                  <option key={pr} value={pr}>
                    {ROTULO_PRIORIDADE[pr]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <Rotulo>Origem</Rotulo>
            <span className="text-corpo-lg capitalize text-tinta-suave">
              {negocio.contato?.origem || "manual"}
            </span>
            {negocio.contato?.tags && negocio.contato.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {negocio.contato.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-fio pt-4">
          <Button
            variante="primario"
            carregando={salvando}
            disabled={!sujo || !form.nome.trim()}
            onClick={salvar}
          >
            Salvar alterações
          </Button>
          <Button variante="sutil" disabled={!sujo} onClick={() => setForm(salvos)}>
            Descartar
          </Button>
          {sujo && <span className="text-corpo text-tinta-fraca">alterações não salvas</span>}
        </div>
      </Cartao>

      {/* O título do negócio não tem outro lugar na tela; a prioridade saiu
          daqui porque já é um campo do formulário logo acima. */}
      <div className="flex items-center gap-2 px-1">
        <Rotulo>Título do negócio</Rotulo>
        <span className="text-corpo-lg text-tinta-suave">{negocio.titulo}</span>
      </div>
    </div>
  );
}
