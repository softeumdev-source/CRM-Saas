"use client";

import { useEffect, useState } from "react";
import { Plus, Edit3, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Plano } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { Alerta, AreaTexto, Botao, Campo, Entrada, Modal } from "@/components/ui";
import { Confirmar } from "@/components/ui";

const PLANO_VAZIO = {
  nome: "",
  descricao: "",
  franquia_pedidos: 1000,
  valor_setup_plataforma: 0,
  valor_setup_erp: 0,
  valor_setup_catalogo: 0,
  valor_plataforma_base: 690,
  valor_uso_base: 0,
  valor_excedente_pedido: 2,
};

export function PlanosTab({ planosIniciais, tenantId }: { planosIniciais: Plano[]; tenantId: string | null }) {
  const [planos, setPlanos] = useState(planosIniciais);
  const [modalAberto, setModalAberto] = useState(false);

  // Props chegam renovadas via Realtime + router.refresh() do AdminClient.
  useEffect(() => setPlanos(planosIniciais), [planosIniciais]);
  const [editando, setEditando] = useState<Plano | null>(null);
  const [form, setForm] = useState<any>(PLANO_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const abrirNovo = () => {
    setEditando(null);
    setForm(PLANO_VAZIO);
    setErro(null);
    setModalAberto(true);
  };

  const abrirEdicao = (p: Plano) => {
    setEditando(p);
    setForm({ ...p, valor_plataforma_base: (p.valor_plataforma_base || 0) + (p.valor_uso_base || 0), valor_uso_base: 0 });
    setErro(null);
    setModalAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const supabase = createClient();
    if (editando) {
      // Não sobrescreve tenant_id nem id na atualização
      const { id: _id, tenant_id: _tid, criado_em: _ce, ...campos } = form;
      const payload = { ...campos, valor_uso_base: 0 };
      const { data, error } = await supabase.from("planos").update(payload).eq("id", editando.id).select().single();
      setSalvando(false);
      if (error) {
        setErro("Falha ao salvar plano: " + error.message);
        return;
      }
      if (data) setPlanos((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } else {
      const { id: _id, tenant_id: _tid, criado_em: _ce, ...campos } = form;
      const payload = { ...campos, valor_uso_base: 0, tenant_id: tenantId };
      const { data, error } = await supabase.from("planos").insert(payload).select().single();
      setSalvando(false);
      if (error) {
        setErro("Falha ao criar plano: " + error.message);
        return;
      }
      if (data) setPlanos((prev) => [...prev, data]);
    }
    setModalAberto(false);
  };

  // Era confirm() + alert(): o erro da exclusao chegava num dialogo separado,
  // depois de o primeiro ja ter fechado. Agora volta para dentro do proprio.
  const [excluindo, setExcluindo] = useState<Plano | null>(null);

  const excluir = async (): Promise<string | void> => {
    if (!excluindo) return;
    const { error } = await createClient().from("planos").delete().eq("id", excluindo.id);
    if (error) return `Falha ao excluir: ${error.message}`;
    setPlanos((prev) => prev.filter((p) => p.id !== excluindo.id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-titulo font-medium text-tinta">Planos usados nas propostas</h3>
          <p className="text-rotulo text-tinta-suave">Os vendedores só podem cobrar igual ou acima destes valores base.</p>
        </div>
        <Botao variante="primario" onClick={abrirNovo} icone={Plus}>
          Novo plano
        </Botao>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {planos.map((p) => (
          <div key={p.id} className="bg-superficie rounded-2xl p-6 border border-fio shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-titulo font-medium text-tinta">{p.nome}</h4>
                <p className="text-rotulo text-tinta-suave mt-0.5">{p.descricao}</p>
              </div>
              <div className="flex items-center gap-1">
                <Botao variante="sutil" tamanho="sm" onClick={() => abrirEdicao(p)} aria-label={`Editar o plano ${p.nome}`} icone={Edit3} />
                <Botao variante="sutil" tamanho="sm" onClick={() => setExcluindo(p)} aria-label={`Excluir o plano ${p.nome}`} icone={Trash2} />
              </div>
            </div>
            <div className="py-2 border-y border-fio text-rotulo space-y-1">
              <div className="flex justify-between"><span className="text-tinta-suave">Franquia</span><strong>{p.franquia_pedidos.toLocaleString("pt-BR")} pedidos/mês</strong></div>
              <div className="flex justify-between"><span className="text-tinta-suave">Mensalidade (mín)</span><strong className="text-acento">{formatarMoeda((p.valor_plataforma_base || 0) + (p.valor_uso_base || 0))}</strong></div>
              <div className="flex justify-between"><span className="text-tinta-suave">Excedente/pedido</span><strong>{formatarMoeda(p.valor_excedente_pedido)}</strong></div>
              <div className="flex justify-between"><span className="text-tinta-suave">Setup</span><strong>{formatarMoeda((p.valor_setup_plataforma || 0) + (p.valor_setup_erp || 0) + (p.valor_setup_catalogo || 0))}</strong></div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        titulo={editando ? "Editar plano" : "Novo plano"}
      >
        {/* Era um `fixed inset-0` a mao: sem role="dialog", sem aria-modal, sem
            Escape, sem foco preso e sem portal — para leitor de tela, um monte
            de conteudo solto por cima da pagina. */}
        <form onSubmit={salvar} className="flex flex-col gap-3">
              <Entrada required aria-label="Nome do plano" placeholder="Nome do plano" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              <AreaTexto rows={3} aria-label="Descrição do plano" placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <CampoNumero label="Franquia de pedidos/mês" value={form.franquia_pedidos} onChange={(v) => setForm({ ...form, franquia_pedidos: v })} />
                <CampoNumero label="Excedente por pedido (R$)" value={form.valor_excedente_pedido} onChange={(v) => setForm({ ...form, valor_excedente_pedido: v })} step="0.01" />
                <CampoNumero label="Mensalidade base (R$/mês)" value={form.valor_plataforma_base} onChange={(v) => setForm({ ...form, valor_plataforma_base: v })} />
                <CampoNumero label="Setup (R$)" value={form.valor_setup_plataforma} onChange={(v) => setForm({ ...form, valor_setup_plataforma: v })} />
              </div>
              {erro && <Alerta tom="risco">{erro}</Alerta>}
              <div className="pt-3 border-t border-fio flex justify-end gap-2">
                <Botao type="button" variante="sutil" onClick={() => setModalAberto(false)}>Cancelar</Botao>
                <Botao type="submit" variante="primario" disabled={salvando}>{salvando ? "Salvando…" : "Salvar plano"}</Botao>
              </div>
            </form>
      </Modal>

      <Confirmar
        aberto={!!excluindo}
        titulo="Excluir plano"
        rotuloConfirmar="Excluir plano"
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={excluir}
        descricao={
          <>
            O plano <strong className="font-medium text-tinta">{excluindo?.nome}</strong>{" "}
            deixa de aparecer na geração de propostas. As propostas já emitidas com ele não mudam.
          </>
        }
      />
    </div>
  );
}

/**
 * O campo numerico do plano. Era um `Campo` LOCAL com `id="planostab-1"` fixo,
 * renderizado quatro vezes no mesmo formulario — quatro `<label htmlFor>`
 * apontando para o mesmo input, entao clicar em tres deles focava o campo
 * errado. Agora envolve o `Campo` de ui/, que gera o id com `useId()`.
 */
function CampoNumero({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <Campo rotulo={label}>
      {(p) => (
        <Entrada
          {...p}
          type="number"
          step={step || "1"}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
      )}
    </Campo>
  );
}
