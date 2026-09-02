"use client";

import { useState } from "react";
import { Send, MessageCircle, Copy, Check } from "lucide-react";
import type { NegocioComRelacoes, Usuario } from "@/lib/types";
import { Button, Cartao, Rotulo, Segmentado, Textarea } from "@/components/ui";

/**
 * O gerador de modelos de mensagem.
 *
 * Chamava-se CopilotoTab, na aba de id `ia` rotulada "Mensagens", e nao tinha
 * IA nenhuma dentro — sao modelos de texto com o nome do cliente e do vendedor
 * preenchidos. Agora o nome do arquivo, o id da aba e o rotulo dizem a mesma
 * coisa. Os textos dos modelos estao preservados palavra por palavra.
 */

interface Modelo {
  id: string;
  titulo: string;
  assunto?: string;
  corpo: string;
}

const EMAIL_MODELOS: Modelo[] = [
  {
    id: "primeiro",
    titulo: "Primeiro contato",
    assunto: "Automatize o recebimento de pedidos na {empresa}",
    corpo: `Olá, {cliente}! Tudo bem?
Meu nome é {vendedor} e faço parte da equipe da Softeum.

Sabemos que empresas como a {empresa} precisam de processos comerciais eficientes para garantir agilidade no recebimento e processamento dos pedidos, mantendo o controle das informações e proporcionando um atendimento cada vez melhor aos clientes.

Pensando nisso, gostaria de apresentar uma solução da Softeum que ajuda empresas a automatizar o recebimento e processamento de pedidos, reduzindo atividades manuais e aumentando a eficiência operacional.

Nossa plataforma centraliza pedidos recebidos por diferentes canais em um único ambiente e utiliza inteligência artificial para interpretar solicitações enviadas por e-mail, PDF, Excel, TXT e outros formatos.

Além disso, a solução permite que seus clientes realizem pedidos diretamente pelo WhatsApp. A IA conduz o atendimento, interpreta as informações do pedido, estrutura os dados e realiza o envio automático para o ERP da empresa.

Com essa automação, a {empresa} pode reduzir retrabalhos, minimizar erros de digitação, agilizar o processamento dos pedidos e aumentar a produtividade da equipe comercial.

Gostaria de agendar uma breve apresentação de 20 minutos para mostrar como a plataforma funciona e avaliar se essa solução pode contribuir com a operação de vocês?

Fico à disposição para combinarmos o melhor horário.

Atenciosamente,
{vendedor}
Softeum`,
  },
  {
    id: "cadencia",
    titulo: "Follow-up / aquecer lead",
    assunto: "Podemos conversar sobre a automação de pedidos, {cliente}?",
    corpo: `Olá, {cliente}, tudo bem?

Passando para retomar nosso contato sobre a solução da Softeum de automação de recebimento e processamento de pedidos.

Muitas empresas do porte da {empresa} têm conseguido reduzir o trabalho manual e os erros de digitação ao centralizar os pedidos que chegam por e-mail e WhatsApp em um só lugar, com envio automático para o ERP.

Consigo te mostrar em 20 minutos como isso funciona na prática. Qual seria o melhor dia e horário para você esta semana?

Fico no aguardo!

Abraço,
{vendedor}
Softeum`,
  },
  {
    id: "pos-demo",
    titulo: "Pós-demonstração",
    assunto: "Próximos passos após nossa conversa",
    corpo: `Olá, {cliente}!

Foi um prazer apresentar a plataforma da Softeum para a {empresa}. Como combinamos, estou te enviando os próximos passos para avançarmos.

Ficou alguma dúvida sobre a automação dos pedidos ou sobre a integração com o ERP de vocês? Posso preparar uma proposta comercial personalizada para o volume de pedidos da {empresa}.

Me avisa como prefere seguir que eu já encaminho tudo.

Abraço,
{vendedor}
Softeum`,
  },
];

const WHATS_MODELOS: Modelo[] = [
  {
    id: "primeiro",
    titulo: "Primeiro contato",
    corpo: `Olá, {cliente}! Tudo bem? Aqui é o {vendedor}, da Softeum. 😊

Ajudamos empresas como a {empresa} a automatizar o recebimento e o processamento de pedidos que chegam por e-mail e WhatsApp, com envio automático para o ERP.

Posso te mostrar em 20 minutinhos como funciona? Qual o melhor horário pra você?`,
  },
  {
    id: "cadencia",
    titulo: "Follow-up / aquecer lead",
    corpo: `Oi, {cliente}! Tudo certo? Aqui é o {vendedor}, da Softeum.

Passando pra retomar nosso contato sobre a automação de pedidos. Consigo te mostrar rapidinho como a {empresa} pode reduzir o trabalho manual e os erros de digitação. Qual dia fica melhor pra gente conversar?`,
  },
  {
    id: "lembrete",
    titulo: "Lembrete de reunião",
    corpo: `Olá, {cliente}! Passando só pra confirmar nossa conversa sobre a plataforma da Softeum. Continua de pé no horário combinado? Qualquer coisa, estou à disposição. Abraço, {vendedor}.`,
  },
];

function preencher(texto: string, vars: Record<string, string>): string {
  return texto
    .replaceAll("{cliente}", vars.cliente || "")
    .replaceAll("{empresa}", vars.empresa || "")
    .replaceAll("{vendedor}", vars.vendedor || "");
}

export function MensagensTab({ negocio, usuarioAtual }: { negocio: NegocioComRelacoes; usuarioAtual: Usuario }) {
  const [canal, setCanal] = useState<"email" | "whatsapp">("email");
  const [modeloId, setModeloId] = useState("primeiro");
  const [copiado, setCopiado] = useState(false);

  const primeiroNome = (negocio.contato?.nome || "").split(" ")[0] || "";
  const vars = {
    cliente: primeiroNome,
    empresa: negocio.contato?.empresa || negocio.contato?.nome || "sua empresa",
    vendedor: (usuarioAtual.nome || "").split(" ")[0] || usuarioAtual.nome || "",
  };

  const modelos = canal === "email" ? EMAIL_MODELOS : WHATS_MODELOS;
  const modelo = modelos.find((m) => m.id === modeloId) || modelos[0];
  const corpoFinal = preencher(modelo.corpo, vars);
  const assuntoFinal = modelo.assunto ? preencher(modelo.assunto, vars) : "";

  const copiar = () => {
    navigator.clipboard.writeText(
      canal === "email" && assuntoFinal ? `${assuntoFinal}\n\n${corpoFinal}` : corpoFinal,
    );
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  };

  const telefone = (negocio.contato?.whatsapp || negocio.contato?.telefone || "").replace(/\D/g, "");
  const linkWhats = telefone ? `https://wa.me/55${telefone}?text=${encodeURIComponent(corpoFinal)}` : null;
  const linkEmail = negocio.contato?.email
    ? `mailto:${negocio.contato.email}?subject=${encodeURIComponent(assuntoFinal)}&body=${encodeURIComponent(corpoFinal)}`
    : null;

  const trocarCanal = (novo: "email" | "whatsapp") => {
    setCanal(novo);
    const disponiveis = novo === "email" ? EMAIL_MODELOS : WHATS_MODELOS;
    if (!disponiveis.some((m) => m.id === modeloId)) setModeloId(disponiveis[0].id);
  };

  return (
    <Cartao className="flex max-w-3xl flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <Rotulo>Modelo de mensagem</Rotulo>
        <p className="text-corpo text-tinta-suave">
          Nome do cliente e do vendedor ja preenchidos. Escolha, revise e envie.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmentado
          rotulo="Canal"
          valor={canal}
          aoTrocar={trocarCanal}
          opcoes={[
            { chave: "email" as const, label: "E-mail" },
            { chave: "whatsapp" as const, label: "WhatsApp" },
          ]}
        />
        <Segmentado
          rotulo="Momento da cadencia"
          valor={modelo.id}
          aoTrocar={setModeloId}
          opcoes={modelos.map((m) => ({ chave: m.id, label: m.titulo }))}
        />
      </div>

      {canal === "email" && assuntoFinal && (
        <div className="flex flex-col gap-1.5">
          <Rotulo>Assunto</Rotulo>
          <p className="text-corpo-lg rounded-lg bg-recuo px-3 py-2 text-tinta">{assuntoFinal}</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Rotulo>Mensagem</Rotulo>
        <Textarea readOnly value={corpoFinal} rows={canal === "email" ? 16 : 8} aria-label="Mensagem" />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-fio pt-4">
        <Button icone={copiado ? Check : Copy} onClick={copiar}>
          {copiado ? "Copiado" : "Copiar"}
        </Button>

        {canal === "whatsapp" &&
          (linkWhats ? (
            <Button
              variante="primario"
              icone={MessageCircle}
              onClick={() => window.open(linkWhats, "_blank", "noopener")}
            >
              Abrir no WhatsApp
            </Button>
          ) : (
            <span className="text-corpo text-amber-700">
              Cadastre um telefone no contato para abrir o WhatsApp.
            </span>
          ))}

        {canal === "email" &&
          (linkEmail ? (
            <Button
              variante="primario"
              icone={Send}
              onClick={() => window.open(linkEmail, "_blank", "noopener")}
            >
              Abrir no e-mail
            </Button>
          ) : (
            <span className="text-corpo text-amber-700">
              Cadastre um e-mail no contato para abrir o cliente de e-mail.
            </span>
          ))}
      </div>
    </Cartao>
  );
}
