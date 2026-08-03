"use client";

import { useState } from "react";
import { Send, MessageCircle, Copy, Check, Mail } from "lucide-react";
import type { NegocioComRelacoes, Usuario } from "@/lib/types";

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

export function CopilotoTab({ negocio, usuarioAtual }: { negocio: NegocioComRelacoes; usuarioAtual: Usuario }) {
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
    navigator.clipboard.writeText(canal === "email" && assuntoFinal ? `${assuntoFinal}\n\n${corpoFinal}` : corpoFinal);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  };

  const telefone = (negocio.contato?.telefone || "").replace(/\D/g, "");
  const linkWhats = telefone ? `https://wa.me/55${telefone}?text=${encodeURIComponent(corpoFinal)}` : null;
  const linkEmail = negocio.contato?.email
    ? `mailto:${negocio.contato.email}?subject=${encodeURIComponent(assuntoFinal)}&body=${encodeURIComponent(corpoFinal)}`
    : null;

  const trocarCanal = (novo: "email" | "whatsapp") => {
    setCanal(novo);
    const primeiros = (novo === "email" ? EMAIL_MODELOS : WHATS_MODELOS);
    if (!primeiros.some((m) => m.id === modeloId)) setModeloId(primeiros[0].id);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Gerador de mensagens</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Modelos prontos com o nome do vendedor e do cliente preenchidos. Escolha, revise e envie.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
          <button
            onClick={() => trocarCanal("email")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg ${canal === "email" ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs" : "text-slate-500"}`}
          >
            <Mail className="h-3.5 w-3.5" /> E-mail
          </button>
          <button
            onClick={() => trocarCanal("whatsapp")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg ${canal === "whatsapp" ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-xs" : "text-slate-500"}`}
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {modelos.map((m) => (
            <button
              key={m.id}
              onClick={() => setModeloId(m.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${
                modelo.id === m.id
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
            >
              {m.titulo}
            </button>
          ))}
        </div>

        {canal === "email" && assuntoFinal && (
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Assunto</label>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">{assuntoFinal}</p>
          </div>
        )}

        <div>
          <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">Mensagem</label>
          <textarea
            readOnly
            value={corpoFinal}
            rows={canal === "email" ? 16 : 8}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copiar}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl"
          >
            {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? "Copiado!" : "Copiar"}
          </button>

          {canal === "whatsapp" && linkWhats && (
            <a
              href={linkWhats}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Abrir no WhatsApp
            </a>
          )}
          {canal === "whatsapp" && !linkWhats && (
            <span className="text-[11px] text-amber-600">Cadastre um telefone no contato para abrir o WhatsApp.</span>
          )}

          {canal === "email" && linkEmail && (
            <a
              href={linkEmail}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl"
            >
              <Send className="h-3.5 w-3.5" /> Abrir no e-mail
            </a>
          )}
          {canal === "email" && !linkEmail && (
            <span className="text-[11px] text-amber-600">Cadastre um e-mail no contato para abrir o cliente de e-mail.</span>
          )}
        </div>
      </div>
    </div>
  );
}
