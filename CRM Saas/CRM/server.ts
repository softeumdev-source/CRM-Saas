import { GoogleGenAI, Type } from "@google/genai";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Healthcheck
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// AI Lead Qualification & SaaS Fit Scoring
app.post("/api/ai/qualify-lead", async (req, res) => {
  try {
    const ai = getAiClient();
    if (!ai) {
      return res.status(500).json({ error: "Chave GEMINI_API_KEY não configurada no servidor." });
    }

    const { lead } = req.body;
    if (!lead) {
      return res.status(400).json({ error: "Dados do lead não fornecidos." });
    }

    const prompt = `Você é um diretor de vendas SaaS especialista em qualificação de B2B e estratégia de vendas.
Analise as informações deste lead SaaS e forneça uma qualificação detalhada em português do Brasil:

Empresa: ${lead.companyName}
Segmento: ${lead.industry || 'Tecnologia'}
Tamanho da Empresa: ${lead.companySize || 'Médio porte'}
Cargo do Contato: ${lead.contactRole} (${lead.contactName})
Plano de Interesse: ${lead.planInterest || 'Enterprise'}
MRR Estimado: R$ ${lead.estimatedMrr || 0}
Etapa no Funil: ${lead.stage}
Origem do Lead: ${lead.source}
Principais Dores / Necessidades: ${lead.notes || 'Necessita automação, integração de dados e relatórios.'}
Estágio de Trial: ${lead.trialDaysLeft ? lead.trialDaysLeft + ' dias restantes' : 'Sem trial'}

Forneça uma análise estruturada contendo:
1. fitScore (número de 0 a 100 indicando o alinhamento com SaaS)
2. recommendedPlan (ex: Starter, Growth, Scale, Enterprise)
3. summary (resumo direto em 2 frases do potencial)
4. topStrengths (3 pontos fortes do lead)
5. keyRisks (2 possíveis objeções ou riscos)
6. suggestedPitch (um pitch de vendas personalizado de 3 parágrafos focado na dor do cliente)
7. objectionHandlers (3 respostas práticas para objeções comuns como Preço, Tempo de Implantação, Troca de Fornecedor)
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fitScore: { type: Type.NUMBER, description: "Pontuação de 0 a 100 de fit com o SaaS" },
            recommendedPlan: { type: Type.STRING, description: "Plano SaaS recomendado" },
            summary: { type: Type.STRING, description: "Resumo executivo do potencial" },
            topStrengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Lista de pontos fortes"
            },
            keyRisks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Principais riscos ou objeções"
            },
            suggestedPitch: { type: Type.STRING, description: "Pitch de vendas recomendado" },
            objectionHandlers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  objection: { type: Type.STRING },
                  response: { type: Type.STRING }
                },
                required: ["objection", "response"]
              },
              description: "Guia de contorno de objeções"
            }
          },
          required: ["fitScore", "recommendedPlan", "summary", "topStrengths", "keyRisks", "suggestedPitch", "objectionHandlers"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    res.json(result);
  } catch (error: any) {
    console.error("Erro na qualificação IA:", error);
    res.status(500).json({ error: error.message || "Falha ao qualificar lead com IA." });
  }
});

// AI SaaS Outreach & Sales Email Generator
app.post("/api/ai/generate-email", async (req, res) => {
  try {
    const ai = getAiClient();
    if (!ai) {
      return res.status(500).json({ error: "Chave GEMINI_API_KEY não configurada." });
    }

    const { lead, emailType, tone } = req.body;

    const prompt = `Você é um Copywriter de Vendas SaaS B2B sênior.
Escreva um e-mail ultra persuasivo em português do Brasil para o seguinte prospect:

Empresa: ${lead.companyName}
Contato: ${lead.contactName} (${lead.contactRole})
Tipo de E-mail: ${emailType} (Ex: Primeiro Contato Inbound, Pós-Demonstração, Envio de Proposta Comercial, Acompanhamento de Trial Expirando, Reengajamento de Lead Frio)
Tom de Voz: ${tone || 'Consultivo e Profissional'}
Plano SaaS em Pauta: ${lead.planInterest} (MRR Estimado R$ ${lead.estimatedMrr})
Contexto/Dores: ${lead.notes || 'Busca escalar operações com a nossa solução SaaS.'}

Gere um e-mail pronto para enviar com:
- Assunto altamente atrativo (com alta taxa de abertura)
- Corpo da mensagem focado no ROI do SaaS, economia de tempo e próximos passos claros (CTA direto).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING, description: "Linha de assunto do e-mail" },
            body: { type: Type.STRING, description: "Corpo do e-mail formatado" },
            callToAction: { type: Type.STRING, description: "A chamada para ação sugerida" },
            proTip: { type: Type.STRING, description: "Dica do especialista para o vendedor antes de enviar" }
          },
          required: ["subject", "body", "callToAction", "proTip"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    res.json(result);
  } catch (error: any) {
    console.error("Erro ao gerar e-mail IA:", error);
    res.status(500).json({ error: error.message || "Falha ao gerar e-mail com IA." });
  }
});

// AI Funnel Insights & Bottleneck Recommendations
app.post("/api/ai/funnel-insights", async (req, res) => {
  try {
    const ai = getAiClient();
    if (!ai) {
      return res.status(500).json({ error: "Chave GEMINI_API_KEY não configurada." });
    }

    const { pipelineMetrics } = req.body;

    const prompt = `Você é um VP de RevOps (Revenue Operations) para SaaS.
Analise os seguintes dados do funil de vendas atual da equipe:

${JSON.stringify(pipelineMetrics, null, 2)}

Forneça um diagnóstico estratégico em português do Brasil focado em aumentar a velocidade de fechamento (Sales Velocity) e aumentar a taxa de conversão do funil de vendas.

Forneça:
1. pipelineHealthScore (0-100)
2. keyInsights (3 observações essenciais sobre o funil)
3. recommendedActions (3 ações prioritárias para os vendedores hoje)
4. forecastSummary (previsão de MRR para o encerramento do mês)`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pipelineHealthScore: { type: Type.NUMBER },
            keyInsights: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            recommendedActions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            forecastSummary: { type: Type.STRING }
          },
          required: ["pipelineHealthScore", "keyInsights", "recommendedActions", "forecastSummary"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    res.json(result);
  } catch (error: any) {
    console.error("Erro nos insights do funil:", error);
    res.status(500).json({ error: error.message || "Falha ao analisar funil com IA." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SaaS CRM Server] Servidor executando em http://localhost:${PORT}`);
  });
}

startServer();
