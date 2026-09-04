"use client";

import { useState } from "react";
import { CalendarClock, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alerta, Botao, Campo, Cartao, Entrada, Rotulo } from "@/components/ui";
import type { Tables } from "@/lib/supabase/types";

type Preferencias = Tables<"preferencias_agenda">;

/**
 * O horário de atendimento — o que o botão "Sugerir horários" usa.
 *
 * Isto existe porque a agenda do Google sabe o que está OCUPADO e não sabe o
 * que é ATENDIMENTO. Sem esta tela, "das 9h às 18h, de segunda a sexta" seria
 * um número dentro do código, e mudar o expediente da empresa exigiria um
 * deploy.
 *
 * A validação de verdade está no BANCO (fim depois do início, dia entre 1 e 7,
 * meia pausa de almoço recusada). Aqui a tela só traduz a recusa: uma regra
 * escrita só no JavaScript é uma regra que o próximo cliente da API ignora.
 */

const DIAS = [
  { valor: 1, curto: "seg" },
  { valor: 2, curto: "ter" },
  { valor: 3, curto: "qua" },
  { valor: 4, curto: "qui" },
  { valor: 5, curto: "sex" },
  { valor: 6, curto: "sáb" },
  { valor: 7, curto: "dom" },
];

/** `"09:00:00"` do Postgres vira `"09:00"` do `<input type="time">`. */
const paraCampo = (t: string | null) => (t ? t.slice(0, 5) : "");

/**
 * A preferência chega PRONTA do servidor (`admin/page.tsx` já busca nove coisas
 * na mesma rodada; esta é a décima e não custa viagem nenhuma). Buscar aqui
 * dentro custaria um efeito, um spinner e um pisca — para um dado que a página
 * podia trazer de graça.
 */
export function HorarioDeAtendimento({ inicial }: { inicial: Preferencias | null }) {
  const [prefs, setPrefs] = useState<Preferencias | null>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const mexer = (patch: Partial<Preferencias>) => {
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    setSalvo(false);
  };

  const alternarDia = (dia: number) => {
    if (!prefs) return;
    const tem = prefs.dias_semana.includes(dia);
    // Ordenado para a linha "seg, ter, qua" nunca sair embaralhada depois de
    // desmarcar e remarcar um dia.
    const dias = tem
      ? prefs.dias_semana.filter((d) => d !== dia)
      : [...prefs.dias_semana, dia].sort((a, b) => a - b);
    mexer({ dias_semana: dias });
  };

  const salvar = async () => {
    if (!prefs) return;
    setSalvando(true);
    setErro(null);
    const { data, error } = await createClient()
      .from("preferencias_agenda")
      .update({
        dias_semana: prefs.dias_semana,
        hora_inicio: prefs.hora_inicio,
        hora_fim: prefs.hora_fim,
        almoco_inicio: prefs.almoco_inicio,
        almoco_fim: prefs.almoco_fim,
        duracao_minutos: prefs.duracao_minutos,
        antecedencia_horas: prefs.antecedencia_horas,
        intervalo_minutos: prefs.intervalo_minutos,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", prefs.id)
      // `select()` na volta para a tela mostrar o que o BANCO gravou, e não o
      // que ela achou que mandou. É como se descobre um `time` normalizado ou
      // um valor recusado em silêncio.
      .select()
      .maybeSingle();
    setSalvando(false);
    if (error) {
      // A mensagem do Postgres cita o nome da restrição, que não diz nada a
      // ninguém. Traduzir as três que dá para prever é a diferença entre
      // "corrija isto" e "deu erro".
      setErro(traduzir(error.message));
      return;
    }
    setSalvo(true);
    if (data) setPrefs(data);
  };

  if (!prefs) {
    return (
      <Cartao className="space-y-2">
        <Rotulo className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-acento" /> Horário de atendimento
        </Rotulo>
        <Alerta tom="alerta" titulo="Sem configuração para esta empresa">
          Nenhuma linha de preferências foi encontrada. As sugestões de horário vão usar o padrão:
          seg–sex, 9h–18h, com pausa das 12h às 13h.
        </Alerta>
      </Cartao>
    );
  }

  return (
    <Cartao className="space-y-4">
      <div>
        <Rotulo className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-acento" /> Horário de atendimento
        </Rotulo>
        <p className="text-rotulo text-tinta-suave mt-1">
          É o que o botão <strong>Sugerir horários</strong> usa no card. A agenda do Google sabe o
          que está ocupado; só isto aqui diz o que é horário de trabalho — sem ele, domingo às 3h da
          manhã seria um horário livre como qualquer outro.
        </p>
      </div>

      <div>
        <span className="text-rotulo font-medium text-tinta">Dias de atendimento</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {DIAS.map((d) => {
            const ativo = prefs.dias_semana.includes(d.valor);
            return (
              <button
                key={d.valor}
                type="button"
                aria-pressed={ativo}
                onClick={() => alternarDia(d.valor)}
                className={[
                  "rounded-lg px-3 py-1.5 text-rotulo font-medium border",
                  "transition-colors duration-150 ease-out",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
                  ativo
                    ? "border-acento bg-acento-fraco text-acento"
                    : "border-fio bg-superficie text-tinta-suave hover:bg-recuo",
                ].join(" ")}
              >
                {d.curto}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Começa às">
          {(p) => (
            <Entrada
              {...p}
              type="time"
              value={paraCampo(prefs.hora_inicio)}
              onChange={(e) => mexer({ hora_inicio: e.target.value })}
            />
          )}
        </Campo>
        <Campo rotulo="Termina às">
          {(p) => (
            <Entrada
              {...p}
              type="time"
              value={paraCampo(prefs.hora_fim)}
              onChange={(e) => mexer({ hora_fim: e.target.value })}
            />
          )}
        </Campo>

        <Campo rotulo="Pausa começa às" dica="Deixe os dois vazios para não ter pausa.">
          {(p) => (
            <Entrada
              {...p}
              type="time"
              value={paraCampo(prefs.almoco_inicio)}
              onChange={(e) => mexer({ almoco_inicio: e.target.value || null })}
            />
          )}
        </Campo>
        <Campo rotulo="Pausa termina às">
          {(p) => (
            <Entrada
              {...p}
              type="time"
              value={paraCampo(prefs.almoco_fim)}
              onChange={(e) => mexer({ almoco_fim: e.target.value || null })}
            />
          )}
        </Campo>

        <Campo rotulo="Duração da reunião (min)">
          {(p) => (
            <Entrada
              {...p}
              type="number"
              min={5}
              max={480}
              value={prefs.duracao_minutos}
              onChange={(e) => mexer({ duracao_minutos: Number(e.target.value) })}
            />
          )}
        </Campo>
        <Campo
          rotulo="Antecedência mínima (h)"
          dica="Nada é sugerido antes disso a partir de agora."
        >
          {(p) => (
            <Entrada
              {...p}
              type="number"
              min={0}
              max={168}
              value={prefs.antecedencia_horas}
              onChange={(e) => mexer({ antecedencia_horas: Number(e.target.value) })}
            />
          )}
        </Campo>
        <Campo
          rotulo="Folga entre compromissos (min)"
          dica="Respiro antes e depois do que já está na agenda."
        >
          {(p) => (
            <Entrada
              {...p}
              type="number"
              min={0}
              max={120}
              value={prefs.intervalo_minutos}
              onChange={(e) => mexer({ intervalo_minutos: Number(e.target.value) })}
            />
          )}
        </Campo>
      </div>

      {erro && (
        <Alerta tom="risco" titulo="A configuração não foi salva">
          {erro}
        </Alerta>
      )}

      <div className="flex items-center gap-3">
        <Botao variante="primario" carregando={salvando} onClick={() => void salvar()}>
          Salvar horário
        </Botao>
        {salvo && !erro && (
          <span className="text-rotulo text-ok flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Salvo
          </span>
        )}
      </div>
    </Cartao>
  );
}

function traduzir(mensagem: string): string {
  if (mensagem.includes("preferencias_agenda_expediente")) {
    return "O fim do expediente precisa ser depois do começo.";
  }
  if (mensagem.includes("preferencias_agenda_almoco")) {
    return "A pausa precisa dos dois horários preenchidos, com o fim depois do começo — ou dos dois vazios.";
  }
  if (mensagem.includes("preferencias_agenda_dias")) {
    return "Marque pelo menos um dia de atendimento.";
  }
  if (mensagem.includes("preferencias_agenda_duracao")) {
    return "A duração da reunião precisa ficar entre 5 e 480 minutos.";
  }
  if (mensagem.includes("preferencias_agenda_antecedencia")) {
    return "A antecedência precisa ficar entre 0 e 168 horas.";
  }
  if (mensagem.includes("preferencias_agenda_intervalo")) {
    return "A folga entre compromissos precisa ficar entre 0 e 120 minutos.";
  }
  return mensagem;
}
