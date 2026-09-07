import { NextResponse } from "next/server";
import { createAdminClient, temServiceRole } from "@/lib/supabase/admin";

/**
 * Os PDFs de assinatura, servidos por quem confere o token.
 *
 * O bucket `assinatura-publica` ERA público — o nome ficou, o comportamento
 * não. Público ali significava: a URL do contrato assinado não expira, não pede
 * nada e vale para sempre. Quem a tivesse (um encaminhamento de e-mail, um
 * histórico de navegador, um print) lia o contrato de outra empresa.
 *
 * Esta rota já existia e já era o caminho por onde a página de assinatura pedia
 * os arquivos — só que ela buscava a MESMA URL pública e repassava. Era um
 * proxy que não protegia nada. Agora ela baixa com service role, que é o que
 * torna o fechamento do bucket possível sem quebrar quem tem o link legítimo.
 *
 * A conferência é o formato do token e o nome do arquivo, e o token é o que
 * amarra tudo: os arquivos moram em `<token>/`, então quem não tem o token não
 * alcança pasta nenhuma. Não há verificação de sessão porque não pode haver —
 * quem assina é o cliente, que não tem conta no CRM.
 */
export const dynamic = "force-dynamic";

/**
 * Os quatro nomes que existem, escritos um a um.
 *
 * Era `^(comercial|tecnica)\.pdf$` e passou a aceitar também os `-assinado`,
 * que antes só eram alcançáveis pela URL pública do bucket. A lista é fechada
 * de propósito: com o service role do outro lado, um padrão frouxo aqui vira
 * leitura de qualquer objeto do bucket.
 */
const ARQUIVOS = new Set([
  "comercial.pdf",
  "tecnica.pdf",
  "comercial-assinado.pdf",
  "tecnica-assinado.pdf",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; arquivo: string }> }
) {
  const { token, arquivo } = await params;

  if (!/^[a-f0-9]+$/.test(token) || !ARQUIVOS.has(arquivo)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  if (!temServiceRole()) {
    return NextResponse.json({ error: "Servidor sem credencial para ler o documento." }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("assinatura-publica").download(`${token}/${arquivo}`);

  if (error || !data) {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  }

  const buffer = await data.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      // `private`: o cache era `public, max-age=3600`, e com o bucket fechado um
      // cache compartilhado guardando contrato assinado desfaz o que a mudança
      // acabou de fazer. O navegador de quem tem o link continua guardando.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
