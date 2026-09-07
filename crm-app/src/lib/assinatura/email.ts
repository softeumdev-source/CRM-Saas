import { emailBase } from "@/lib/resend";
import { escaparHtml } from "@/lib/gmail/corpo";

/**
 * O e-mail que leva o link de assinatura.
 *
 * Ele existe como função, e não solto dentro da rota de envio, porque agora tem
 * DOIS chamadores: o primeiro envio (`api/propostas/[id]/enviar`) e o reenvio
 * (`api/envelopes/[id]/reenviar`). Duplicar o HTML faria as duas versões
 * divergirem no primeiro ajuste de texto — e a que ia divergir em silêncio é
 * justamente a do reenvio, que só aparece quando algo já deu errado.
 *
 * O `link` é a ÚNICA coisa que muda entre um signatário e outro, e ele nunca
 * volta para a tela: é montado no servidor, entra aqui e sai no corpo do
 * e-mail, para o endereço cadastrado daquele signatário.
 *
 * Tudo que vem de fora é escapado aqui dentro. O nome e a empresa vêm do
 * formulário de envio e o número da proposta vem do banco — nenhum dos três é
 * confiável o suficiente para entrar cru num HTML que vai para o cliente.
 */
export function emailDeAssinatura(p: {
  /** Nome do signatário, como ele foi cadastrado. */
  nome: string;
  /** Número da proposta, ex.: `2026-014`. */
  numero: string;
  /** Empresa (ou nome) do contato do negócio. */
  empresa: string;
  /** URL absoluta de `/assinar/<token>`. */
  link: string;
  /** Nome de quem assina o rodapé — vem da caixa comercial. */
  assinatura: string;
  /** Segundo envio do MESMO link: muda uma frase, não o documento. */
  reenvio?: boolean;
}): string {
  const titulo = p.reenvio
    ? "Reenvio: proposta comercial pronta para assinatura"
    : "Proposta comercial pronta para assinatura";

  return emailBase(
    `
      <h2 style="margin-top:0;">${escaparHtml(titulo)}</h2>
      <p>Olá ${escaparHtml(p.nome)},</p>
      <p>${
        p.reenvio
          ? `Reenviamos o link de assinatura da proposta comercial e técnica (${escaparHtml(p.numero)}) para ${escaparHtml(p.empresa)}. É o mesmo documento — se você já tinha recebido, pode usar qualquer um dos dois e-mails.`
          : `A Softeum preparou a proposta comercial e técnica (${escaparHtml(p.numero)}) para ${escaparHtml(p.empresa)}. Revise os documentos e assine eletronicamente pelo link abaixo.`
      }</p>
      <p style="text-align:center; margin: 28px 0;">
        <a href="${p.link}" style="background:#4f46e5; color:#fff; padding:12px 24px; border-radius:12px; text-decoration:none; font-weight:700;">Revisar e assinar</a>
      </p>
      <p style="font-size:12px; color:#64748b;">Se o botão não funcionar, copie e cole este link no navegador: ${p.link}</p>
    `,
    { assinatura: p.assinatura },
  );
}
