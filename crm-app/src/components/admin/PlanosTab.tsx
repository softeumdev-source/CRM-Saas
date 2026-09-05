"use client";

import { useState } from "react";
import { Plus, Edit3, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Plano } from "@/lib/types";
import { formatarMoeda } from "@/lib/types";
import { Alerta, AreaTexto, Botao, Campo, Confirmar, Entrada, Modal, Surge } from "@/components/ui";
import { useEstadoDaProp } from "@/lib/estadoDaProp";

/**
 * O formulário do plano: o que o modal edita, e não a linha da tabela.
 *
 * Não é `Plano` porque um plano NOVO ainda não tem `id`, `tenant_id` nem
 * `criado_em`; e não é `Partial<Plano>` porque os campos que o formulário edita
 * estão todos preenchidos desde o começo, por `PLANO_VAZIO`.
 */
type FormularioDePlano = typeof PLANO_VAZIO & Partial<Plano>;

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
  // `useEstadoDaProp` e nao `useEffect`: e o padrao oficial do React de
  // ajustar estado durante o render. Com o efeito, o navegador chegava a
  // PINTAR a lista velha antes de o efeito rodar — um piscar de dado
  // desatualizado a cada `router.refresh()`.
  const [planos, setPlanos] = useEstadoDaProp(planosIniciais);
  const [modalAberto, setModalAberto] = useState(false);

  const [editando, setEditando] = useState<Plano | null>(null);
  const [form, setForm] = useState<FormularioDePlano>(PLANO_VAZIO);
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
    // `descricao` é anulável na tabela, e o `<AreaTexto>` abaixo é controlado:
    // com `value={null}` o React troca o campo de controlado para NÃO
    // controlado no meio da edição — o texto digitado para de ser lido pelo
    // estado e some ao salvar. O `?? ""` era o que faltava, e o `any` era o que
    // impedia de ver.
    setForm({
      ...p,
      descricao: p.descricao ?? "",
      valor_plataforma_base: (p.valor_plataforma_base || 0) + (p.valor_uso_base || 0),
      valor_uso_base: 0,
    });
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

      {/* MEDIDO NO BANCO: o tenant tem ONZE planos ativos, do Starter (R$ 229)
          ao Enterprise 4 (R$ 17.990) — nao quatro. Nenhuma contagem de coluna
          divide onze, entao "fechar a fileira" nao e o criterio aqui.
          O criterio e a largura do conteudo. Em `lg:grid-cols-3` cada cartao
          ganhava 537px a 1700px para guardar um preco e tres linhas curtas: o
          cartao ficava vazio por dentro. Em quatro, 398px — que ainda cabe
          "R$ 17.990,00 /mes min." numa linha so, conferido no navegador — e a
          escada inteira de preco cabe em tres fileiras em vez de quatro. Numa
          tabela de precos e a escada que se le. */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
        {planos.map((p, i) => (
          <Surge
            key={p.id}
            indice={i}
            className="bg-superficie rounded-2xl p-6 border border-fio shadow-cartao flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-rotulo font-semibold text-tinta-suave">{p.nome}</h4>
                {/* MEDIDO NO BANCO: os ONZE planos tem `descricao` vazia. O
                    `<p>` saia mesmo assim e reservava uma linha em branco
                    embaixo de cada nome, onze vezes. */}
                {p.descricao ? (
                  <p className="text-rotulo text-tinta-suave mt-0.5">{p.descricao}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Botao variante="sutil" tamanho="sm" onClick={() => abrirEdicao(p)} aria-label={`Editar o plano ${p.nome}`} icone={Edit3} />
                <Botao variante="sutil" tamanho="sm" onClick={() => setExcluindo(p)} aria-label={`Excluir o plano ${p.nome}`} icone={Trash2} />
              </div>
            </div>

            {/* A MENSALIDADE ERA A UNICA LINHA TINGIDA DE ACENTO no cartao, e o
                acento neste sistema quer dizer ACAO — algo acontece quando voce
                clica. Nada acontece: e um numero.
                Ela sobe para o topo em vez de perder a cor, porque e o numero
                que o vendedor procura: "Starter" nao diz preco nenhum. Nenhuma
                informacao saiu — a mensalidade continua na tela, so que grande
                em vez de pintada, e as outras tres linhas seguem embaixo. */}
            <p className="text-titulo font-semibold text-tinta tabular leading-none">
              {formatarMoeda((p.valor_plataforma_base || 0) + (p.valor_uso_base || 0))}
              <span className="text-rotulo font-medium text-tinta-fraca"> /mês mín.</span>
            </p>

            <div className="py-2 border-t border-fio text-rotulo space-y-1 mt-auto">
              <div className="flex justify-between gap-2"><span className="text-tinta-suave">Franquia</span><strong className="tabular">{p.franquia_pedidos.toLocaleString("pt-BR")} pedidos/mês</strong></div>
              <div className="flex justify-between gap-2"><span className="text-tinta-suave">Excedente/pedido</span><strong className="tabular">{formatarMoeda(p.valor_excedente_pedido)}</strong></div>
              <div className="flex justify-between gap-2"><span className="text-tinta-suave">Setup</span><strong className="tabular">{formatarMoeda((p.valor_setup_plataforma || 0) + (p.valor_setup_erp || 0) + (p.valor_setup_catalogo || 0))}</strong></div>
            </div>
          </Surge>
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
