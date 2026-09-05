import { Resend } from "resend";
import { escaparHtml } from "@/lib/gmail/corpo";

export function temResendConfigurado(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function usandoRemetenteTest(): boolean {
  return !process.env.RESEND_FROM_EMAIL;
}

export interface EmailResult {
  sent: boolean;
  skipped: boolean;
  id?: string;
  error?: string;
  remetenteTest?: boolean;
}

/**
 * Endereco para onde a RESPOSTA do cliente deve ir.
 *
 * Sem isto, o cliente responde para `RESEND_FROM_EMAIL` — um endereco de
 * sistema — e a resposta nunca chega na caixa de ninguem. A sincronizacao do
 * Gmail entao "funciona" e nao traz nada, o que e indistinguivel de "ninguem
 * respondeu". Era o buraco silencioso mais caro da entrada de mensagens.
 *
 * Endereco nao entregavel e recusado aqui em vez de virar um Reply-To que
 * devolve bounce: o dono do lead pode ser o robo SDR IA, cujo e-mail usa o TLD
 * `.invalid` justamente para nao receber nada.
 */
export function podeReceberResposta(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) return false;
  return !e.endsWith(".invalid") && !e.endsWith(".local") && !e.endsWith(".example");
}

export async function enviarEmail(params: {
  to: string;
  subject: string;
  html: string;
  /** Ignorado quando nao e entregavel — ver `podeReceberResposta`. */
  replyTo?: string | null;
}): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY não configurada - e-mail não enviado:", params.subject, "->", params.to);
    return { sent: false, skipped: true, error: "RESEND_API_KEY não configurada no servidor." };
  }

  const from = process.env.RESEND_FROM_EMAIL || "Softeum <onboarding@resend.dev>";
  const remetenteTest = from.includes("onboarding@resend.dev");

  if (remetenteTest) {
    console.warn("[resend] Usando remetente de teste onboarding@resend.dev — e-mails so chegam no dono da conta Resend. Configure RESEND_FROM_EMAIL com um dominio verificado.");
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(podeReceberResposta(params.replyTo) ? { replyTo: params.replyTo! } : {}),
    });

    if (error) {
      console.error("[resend] Erro ao enviar e-mail:", error.message, "-> ", params.to);
      return { sent: false, skipped: false, error: error.message, remetenteTest };
    }

    return { sent: true, skipped: false, id: data?.id, remetenteTest };
  } catch (e: any) {
    console.error("[resend] Excecao ao enviar e-mail:", e);
    return { sent: false, skipped: false, error: e?.message || String(e), remetenteTest };
  }
}

/**
 * Quem assina o e-mail, como o cliente lê no fim da mensagem.
 *
 * O NOME vem de fora, do chamador, e ele sempre o tira da CAIXA
 * (`tenants.caixa_email_nome`) — a mesma fonte do `From:`. Isso não é firula:
 * até esta manhã o cabeçalho e o corpo assinavam por caminhos diferentes e
 * chegavam a discordar dentro do mesmo e-mail (um saiu como "SDR IA", outro
 * como "Softeum, da Softeum"). Escrever "William Machado" num literal aqui
 * recriaria exatamente o defeito que acabamos de fechar.
 *
 * O RESTO é literal, e isso é decisão, não descuido: cargo, site e WhatsApp são
 * de uma pessoa só porque a caixa comercial é uma só. No dia em que existir uma
 * segunda caixa, estes três descem para `tenants` junto com o nome — e não
 * antes, porque coluna sem um segundo valor é peso morto no schema.
 */
const CARGO_DE_QUEM_ASSINA = "Executivo de vendas";
const SITE = "https://www.softeum.com.br/";
const SITE_LEGIVEL = "www.softeum.com.br";
/** Com DDI: sem o `55` o link do WhatsApp não abre conversa nenhuma. */
const WHATSAPP_E164 = "5547996592551";
const WHATSAPP_LEGIVEL = "(47) 99659-2551";

/**
 * Um arquivo de `public/`, ou nada.
 *
 * Devolve `null` quando não dá para montar uma URL ABSOLUTA e https. Um `src`
 * relativo num e-mail não resolve contra nada — o cliente mostra o ícone de
 * imagem quebrada, que é pior do que assinatura sem logo. Melhor faltar do que
 * chegar torto.
 *
 * O arquivo mora em `public/`, e ele só é servido porque o `config.matcher` do
 * proxy passou a excluir estático por extensão. Sem aquela linha isto aqui é um
 * 307 para `/login`, e o proxy de imagens do Gmail recebe HTML.
 */
function urlPublica(arquivo: string): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  return base.startsWith("https://") ? `${base}/${arquivo}` : null;
}

/**
 * A assinatura em HTML, montada em TABELA e com `style` em cada célula.
 *
 * O separador é o caractere `·` literal, e não `&middot;`: a versão em TEXTO
 * PURO é derivada deste HTML por `textoDoHtml`, que decodifica cinco entidades e
 * não inclui essa. Com a entidade, quem lê em texto puro recebia
 * "Executivo de vendas &middot; Softeum" — medido, não suposto.
 *
 * UM azul só, e ele é o do site. As duas linhas saíam em `#4f46e5`, e duas
 * linhas azuis seguidas viram um bloco: o azul deixa de dizer "isto é um link"
 * e vira cor de fundo do rodapé. O WhatsApp continua clicável, na cor do texto.
 *
 * Tabela e não flex porque o Outlook desktop renderiza com o motor do Word:
 * `display:flex` vira uma pilha vertical e a logo cai em cima do texto. A
 * largura vai duas vezes — no atributo `width` e no `style` — pela mesma razão.
 *
 * E ela fica DENTRO do card branco, nunca no `div` de fora: aquele não declara
 * `background`, e no tema escuro do Gmail o texto escuro some no fundo escuro.
 */
/**
 * O ícone de uma linha de contato, ou string vazia.
 *
 * `alt=""` NÃO é descuido: o ícone é decorativo e o texto ao lado já diz o que
 * ele é. Com um `alt` de verdade, o leitor de tela anunciaria "globo,
 * www.softeum.com.br" e o cliente de e-mail que bloqueia imagem — que é a
 * maioria, por padrão — mostraria a palavra "globo" grudada no link.
 *
 * Largura e altura vão no ATRIBUTO e no `style`: o Outlook desktop ignora o
 * `style` e usa o atributo; o resto faz o contrário. Com os dois, a imagem
 * bloqueada deixa um vão de 14px e a linha não se desalinha.
 */
function iconeDaLinha(arquivo: string): string {
  const url = urlPublica(arquivo);
  return url
    ? `<img src="${url}" alt="" width="14" height="14" style="width:14px; height:14px; border:0; vertical-align:-2px; margin-right:7px;" />`
    : "";
}

/**
 * O bloco de assinatura: logo à esquerda, quatro linhas à direita.
 *
 * As duas células vão em `middle` porque o texto ocupa quase o dobro da altura
 * da logo (44×42). Com `top`, a logo encostava no topo e ficava 21px acima do
 * meio das quatro linhas — pendurada, com um vão embaixo dela.
 *
 * O `valign="middle"` no atributo NÃO é redundância do `vertical-align` do
 * `style`: o Outlook desktop renderiza com o motor do Word, que ignora o
 * alinhamento vertical vindo do CSS de `<td>` mas obedece o atributo. É o mesmo
 * motivo de `width` aparecer duas vezes nas imagens daqui.
 *
 * O `padding` fica assimétrico de propósito (20px só em cima): ele é o respiro
 * abaixo da linha que separa a assinatura do corpo, não parte da centralização
 * — com `middle`, o alinhamento sai exato mesmo assim.
 */
function assinaturaEmHtml(nome: string): string {
  const logo = urlPublica("logo-softeum.png");
  const celulaDaLogo = logo
    ? `<td width="58" valign="middle" style="width:58px; padding:20px 14px 0 0; vertical-align:middle;"><img src="${logo}" alt="Softeum" width="44" height="42" style="display:block; width:44px; height:42px; border:0;" /></td>`
    : "";
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; margin-top:28px; border-top:1px solid #e2e8f0;">
        <tr>${celulaDaLogo}
          <td valign="middle" style="padding-top:20px; vertical-align:middle; font-family: -apple-system, Segoe UI, Roboto, sans-serif; font-size:13px; line-height:1.6; color:#475569;">
            <strong style="color:#0f172a; font-size:14px;">${escaparHtml(nome)}</strong><br />
            ${CARGO_DE_QUEM_ASSINA} · Softeum<br />
            ${iconeDaLinha("icone-site.png")}<a href="${SITE}" style="color:#4f46e5; text-decoration:none;">${SITE_LEGIVEL}</a><br />
            ${iconeDaLinha("icone-whatsapp.png")}<a href="https://wa.me/${WHATSAPP_E164}" style="color:#475569; text-decoration:none;">WhatsApp ${WHATSAPP_LEGIVEL}</a>
          </td>
        </tr>
      </table>`;
}

/**
 * A MESMA assinatura em texto puro, para quem manda `texto` à mão.
 *
 * Quem não manda não precisa disto: `montarMime` deriva a parte de texto do
 * próprio HTML, e a assinatura vem junto — por isso o texto dos links é o
 * endereço legível, e não "clique aqui". Já `/api/email/responder` passa o
 * `texto` que a pessoa digitou, e sem esta função a versão em texto puro sairia
 * sem assinatura nenhuma.
 *
 * O `-- ` (traço, traço, espaço) é o separador do RFC 3676: é por ele que o
 * cliente do outro lado sabe recolher a assinatura ao citar a mensagem.
 */
export function assinaturaEmTexto(nome: string): string {
  return `\n\n-- \n${nome}\n${CARGO_DE_QUEM_ASSINA} \u00b7 Softeum\n${SITE_LEGIVEL}\nWhatsApp ${WHATSAPP_LEGIVEL}`;
}

export type OpcoesDoEmail = {
  /**
   * Nome de quem assina. Sem ele, NÃO há assinatura — e o padrão é esse de
   * propósito: e-mail interno (convite de usuário do CRM) não leva assinatura
   * comercial, e um e-mail interno escrito amanhã não deve vazar uma por
   * esquecimento. Quem manda para CLIENTE opta por dentro, passando o nome.
   */
  assinatura?: string | null;
};

export function emailBase(conteudo: string, opcoes?: OpcoesDoEmail): string {
  const nome = (opcoes?.assinatura || "").trim();
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
    <div style="background-color:#312e81; background-image: linear-gradient(135deg, #0f172a, #312e81); padding: 20px 24px; border-radius: 16px 16px 0 0;">
      <span style="color:#fff; font-weight:800; font-size:18px; letter-spacing: 0.5px;">SOFTEUM</span>
    </div>
    <div style="background:#fff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px; padding: 24px; color:#1e293b;">
      ${conteudo}${nome ? assinaturaEmHtml(nome) : ""}
    </div>
    <p style="text-align:center; color:#94a3b8; font-size:11px; margin-top:16px;">
      Softeum Tecnologia
    </p>
  </div>`;
}
