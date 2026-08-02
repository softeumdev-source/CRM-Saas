import React, { useState } from 'react';
import { Lead, PipelineStage, AiFunnelInsightsResult } from '../types';
import { 
  Sparkles, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  HelpCircle,
  Lightbulb,
  ShieldCheck,
  Target,
  ChevronRight
} from 'lucide-react';

interface AiSalesCopilotProps {
  leads: Lead[];
  stages: PipelineStage[];
}

export const AiSalesCopilot: React.FC<AiSalesCopilotProps> = ({ leads, stages }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [insights, setInsights] = useState<AiFunnelInsightsResult | null>(null);

  // Chat do Copilot
  const [chatMessages, setChatMessages] = useState<{ sender: 'ai' | 'user'; text: string }[]>([
    {
      sender: 'ai',
      text: 'Olá! Sou o seu Copiloto de Vendas SaaS. Posso analisar seus gargalos no funil de vendas, sugerir ações para os vendedores hoje ou responder dúvidas sobre negociações específicas. Como posso ajudar?'
    }
  ]);
  const [userQuery, setUserQuery] = useState('');
  const [askingAi, setAskingAi] = useState(false);

  // Analisar Funil via Express Backend
  const runFunnelDiagnostics = async () => {
    setAnalyzing(true);
    try {
      const activeLeads = leads.filter(l => l.stage !== 'lost');
      const pipelineMetrics = {
        totalLeads: leads.length,
        activeLeadsCount: activeLeads.length,
        totalPipelineMrr: activeLeads.reduce((acc, l) => acc + l.mrr, 0),
        wonMrr: leads.filter(l => l.stage === 'won').reduce((acc, l) => acc + l.mrr, 0),
        stagesBreakdown: stages.map(s => ({
          stage: s.title,
          leadsCount: leads.filter(l => l.stage === s.id).length,
          mrr: leads.filter(l => l.stage === s.id).reduce((acc, l) => acc + l.mrr, 0)
        }))
      };

      const response = await fetch('/api/ai/funnel-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineMetrics })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao analisar funil');
      }

      const data: AiFunnelInsightsResult = await response.json();
      setInsights(data);
    } catch (err: any) {
      alert(`Erro no diagnóstico: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuery.trim() || askingAi) return;

    const query = userQuery;
    setUserQuery('');
    setChatMessages(prev => [...prev, { sender: 'user', text: query }]);
    setAskingAi(true);

    try {
      // Simula / chama pergunta de vendas direcionada com contexto do pipeline
      const leadContext = leads.slice(0, 5).map(l => `${l.companyName} (${l.planInterest} - R$ ${l.mrr}/mês, Etapa: ${l.stage})`).join('; ');
      
      const response = await fetch('/api/ai/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: {
            companyName: 'Pipeline Geral SaaS',
            contactName: 'Vendedor',
            contactRole: 'Sales Rep',
            planInterest: 'Enterprise',
            estimatedMrr: 10000,
            notes: `Pergunta do Vendedor: ${query}. Contexto de Leads Atuais: ${leadContext}`
          },
          emailType: 'Estratégia de Vendas e Fechamento',
          tone: 'Consultivo e Prático'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setChatMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: `${data.body || data.subject}\n\n💡 **Dica Prática:** ${data.proTip}`
          }
        ]);
      } else {
        setChatMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: 'Recomendo focar nos leads com Trial Expirando (como TechScale e DataPulse), oferecendo uma sessão de onboarding técnico grátis para destravar o contrato antes do encerramento do mês.'
          }
        ]);
      }
    } catch (err) {
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: 'Foque nos leads com maior MRR na etapa de Negociação e Proposta. Garanta que os decisores técnicos tenham visto o módulo de segurança e integrações.'
        }
      ]);
    } finally {
      setAskingAi(false);
    }
  };

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Banner Superior do Copiloto */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-800/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-400/30">
            <Bot className="h-8 w-8 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">
              Copiloto IA de Vendas SaaS
            </h2>
            <p className="text-xs text-indigo-200 mt-1 max-w-xl">
              Análise em tempo real de gargalos, previsão de MRR e sugestões táticas de fechamento personalizadas para a sua equipe comercial.
            </p>
          </div>
        </div>

        <button
          onClick={runFunnelDiagnostics}
          disabled={analyzing}
          className="px-5 py-3 bg-white text-indigo-900 hover:bg-indigo-50 font-extrabold text-xs rounded-2xl shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 shrink-0"
        >
          {analyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              <span>Analisando Pipeline...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <span>Executar Diagnóstico do Funil</span>
            </>
          )}
        </button>
      </div>

      {/* Resultados do Diagnóstico se executado */}
      {insights && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
          
          {/* Saude do Funil */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <p className="text-xs font-bold uppercase text-slate-400">Saúde do Pipeline</p>
            <div className="flex items-center justify-between">
              <span className="text-4xl font-extrabold text-indigo-600 dark:text-indigo-400">
                {insights.pipelineHealthScore}%
              </span>
              <span className="px-3 py-1 text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded-full">
                {insights.pipelineHealthScore > 80 ? 'Excelente' : 'Atenção Necessária'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
              <strong>Previsão de MRR:</strong> {insights.forecastSummary}
            </p>
          </div>

          {/* Principais Insights */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Observações Estratégicas
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              {insights.keyInsights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Ações Prioritárias Recomendadas */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-500" />
              Ações Recomendadas para os Vendedores
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              {insights.recommendedActions.map((action, idx) => (
                <li key={idx} className="flex items-start gap-2 p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      )}

      {/* Interface de Chat com o Consultor IA de Vendas */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col h-[550px]">
        
        {/* Topo do Chat */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Assistente de Vendas em Tempo Real
              </h3>
              <p className="text-[11px] text-slate-500">
                Tire dúvidas sobre pitch, objecções de preço ou como acelerar um lead
              </p>
            </div>
          </div>

          <span className="px-2.5 py-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-full">
            Online • Gemini AI
          </span>
        </div>

        {/* Mensagens */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {chatMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 max-w-2xl ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}>
                {msg.sender === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              <div className={`p-4 rounded-2xl text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 whitespace-pre-wrap'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}

          {askingAi && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                <span>Digitando resposta comercial...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input de Envio */}
        <form onSubmit={handleSendChat} className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex items-center gap-3">
          <input
            type="text"
            placeholder="Ex: Como posso acelerar o fechamento do contrato com a TechScale?"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            className="flex-1 px-4 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30"
          />
          <button
            type="submit"
            disabled={!userQuery.trim() || askingAi}
            className="px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50 transition-all"
          >
            <Send className="h-4 w-4" />
            <span>Enviar</span>
          </button>
        </form>

      </div>

    </div>
  );
};
