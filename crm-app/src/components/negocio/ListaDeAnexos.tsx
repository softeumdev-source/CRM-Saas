"use client";

import { useState } from "react";
import { AlertTriangle, Download, FileText, Image as Icone, Loader2, Music, Video } from "lucide-react";
import { tamanhoLegivel } from "@/lib/anexos";
import { urlAssinada } from "@/lib/storage";
import type { Tables } from "@/lib/supabase/types";

/**
 * Os arquivos trocados com o cliente.
 *
 * Duas coisas que esta lista precisa dizer, e a segunda é a que costuma faltar:
 * o que existe, e o que **não deu para baixar**. Uma linha de `anexos` sem
 * `caminho` não é um bug a esconder — é a mídia cujo download falhou, com o
 * `externo_id` guardado para tentar de novo. Mostrar isso como um link quebrado
 * seria pior do que dizer a verdade.
 *
 * A URL é assinada na hora do clique, e não no render: o bucket é privado, as
 * URLs valem 5 minutos, e gerar uma para cada anexo de cada mensagem ao abrir a
 * aba gastaria uma ida ao Storage por arquivo que ninguém vai abrir.
 */

type Anexo = Tables<"anexos">;

/**
 * O ícone do tipo de arquivo, já como elemento.
 *
 * Devolve JSX, e não o componente, de propósito: `const Icon = escolher(...)`
 * dentro do render é criação de componente aos olhos do lint — e ele está
 * certo em princípio, mesmo que aqui o componente venha pronto da lucide.
 */
function iconeDoTipo(mime: string | null, className: string) {
  const m = mime || "";
  if (m.startsWith("image/")) return <Icone className={className} aria-hidden />;
  if (m.startsWith("audio/")) return <Music className={className} aria-hidden />;
  if (m.startsWith("video/")) return <Video className={className} aria-hidden />;
  return <FileText className={className} aria-hidden />;
}

export function ListaDeAnexos({ anexos, className = "" }: { anexos: Anexo[]; className?: string }) {
  if (anexos.length === 0) return null;

  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {anexos.map((a) => (
        <li key={a.id}>
          <ItemDeAnexo anexo={a} />
        </li>
      ))}
    </ul>
  );
}

function ItemDeAnexo({ anexo }: { anexo: Anexo }) {
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const tamanho = tamanhoLegivel(anexo.tamanho);

  // Sem `caminho` o arquivo não chegou ao bucket. `anexo.erro` diz por quê.
  if (!anexo.caminho) {
    return (
      <span
        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-dashed border-alerta/50 px-2.5 py-1.5 text-rotulo text-alerta"
        title={anexo.erro || "O arquivo não foi baixado do provedor."}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{anexo.nome}</span>
        <span className="shrink-0 text-tinta-fraca">não baixado</span>
      </span>
    );
  }

  const abrir = async () => {
    setAbrindo(true);
    setErro(null);
    const url = await urlAssinada(anexo.caminho!);
    setAbrindo(false);
    if (!url) {
      setErro("Não foi possível abrir este arquivo.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <button
        onClick={() => void abrir()}
        disabled={abrindo}
        className="foco inline-flex max-w-full items-center gap-1.5 rounded-lg border border-fio bg-recuo px-2.5 py-1.5 text-rotulo text-tinta transition-colors duration-150 ease-out hover:border-fio-forte disabled:opacity-60"
      >
        {abrindo ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        ) : (
          iconeDoTipo(anexo.mime, "h-3.5 w-3.5 shrink-0 text-tinta-suave")
        )}
        <span className="truncate">{anexo.nome}</span>
        {tamanho && <span className="shrink-0 text-tinta-fraca tabular">{tamanho}</span>}
        <Download className="h-3 w-3 shrink-0 text-tinta-fraca" aria-hidden />
      </button>
      {erro && <span className="ml-2 text-rotulo text-risco">{erro}</span>}
    </>
  );
}
