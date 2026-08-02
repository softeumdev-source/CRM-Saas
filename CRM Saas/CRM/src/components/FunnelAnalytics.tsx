import React from 'react';
import { Lead, PipelineStage, SalesRep } from '../types';
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  PieChart, 
  CheckCircle2, 
  Target, 
  Flame, 
  Sparkles,
  ArrowRight,
  ShieldAlert,
  BarChart3
} from 'lucide-react';

interface FunnelAnalyticsProps {
  leads: Lead[];
  stages: PipelineStage[];
  salesReps: SalesRep[];
  onOpenAiInsights: () => void;
}

export const FunnelAnalytics: React.FC<FunnelAnalyticsProps> = ({
  leads = [],
  stages = [],
  salesReps = [],
  onOpenAiInsights,
}) => {
  // Calculando métricas gerais
  const totalLeadsCount = leads.length;
  const wonLeads = leads.filter(l => l.stage === 'won');
  const lostLeads = leads.filter(l => l.stage === 'lost');
  const activeLeads = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost');

  const totalPipelineMrr = activeLeads.reduce((acc, l) => acc + l.mrr, 0);
  const totalWonMrr = wonLeads.reduce((acc, l) => acc + l.mrr, 0);
  const conversionRate = totalLeadsCount > 0 ? Math.round((wonLeads.length / totalLeadsCount) * 100) : 0;
  const avgMrrPerDeal = wonLeads.length > 0 ? Math.round(totalWonMrr / wonLeads.length) : (leads.length > 0 ? Math.round(leads.reduce((acc, l) => acc + l.mrr, 0) / leads.length) : 0);

  // Distribuição por Plano SaaS
  const planDistribution = ['Starter', 'Growth', 'Scale', 'Enterprise'].map(plan => {
    const planLeads = leads.filter(l => l.planInterest === plan);
    const mrrSum = planLeads.reduce((acc, l) => acc + l.mrr, 0);
    return {
      plan,
      count: planLeads.length,
      mrr: mrrSum,
      percentage: totalPipelineMrr + totalWonMrr > 0 ? Math.round((mrrSum / (totalPipelineMrr + totalWonMrr)) * 100) : 0
    };
  });

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Banner de Topo: Destaques & Chamada para IA Copilot */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 text-xs font-bold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
              Métricas de Vendas SaaS
            </span>
            <span className="text-xs text-slate-400">Tempo Real</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">
            Desempenho do Funil & Receita Recorrente (MRR)
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Acompanhe a taxa de conversão entre etapas, atingimento da meta dos vendedores e otimize a velocidade de vendas do seu produto SaaS.
          </p>
        </div>

        <button
          onClick={onOpenAiInsights}
          className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-indigo-500/30 flex items-center gap-2 shrink-0 transition-all hover:scale-105 active:scale-95"
        >
          <Sparkles className="h-4 w-4" />
          <span>Diagnóstico de Funil com IA</span>
        </button>
      </div>

      {/* Cartões de KPIS Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <p className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
            Receita no Funil (MRR)
          </p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
            R$ {totalPipelineMrr.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {activeLeads.length} oportunidades ativas
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <p className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
            MRR Fechado (Ganhos)
          </p>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            R$ {totalWonMrr.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {wonLeads.length} contratos assinados
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <p className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
            Taxa de Conversão do Funil
          </p>
          <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
            {conversionRate}%
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Leads Inbound → Clientes
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <p className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
            Ticket Médio MRR
          </p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
            R$ {avgMrrPerDeal.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Média por contrato SaaS
          </p>
        </div>

      </div>

      {/* Gráfico Visual do Funil de Conversão */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Visualização de Funil Por Etapas */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                Volume de MRR por Etapa do Funil
              </h3>
              <p className="text-xs text-slate-500">
                Acompanhe o afunilamento dos negócios em cada fase de vendas
              </p>
            </div>
            <BarChart3 className="h-5 w-5 text-indigo-500" />
          </div>

          <div className="space-y-3 pt-2">
            {stages.map((stg) => {
              const stgLeads = leads.filter(l => l.stage === stg.id);
              const stgMrr = stgLeads.reduce((acc, l) => acc + l.mrr, 0);
              const maxMrr = Math.max(...stages.map(s => leads.filter(l => l.stage === s.id).reduce((acc, l) => acc + l.mrr, 0)), 1);
              const percentageWidth = Math.max(8, Math.round((stgMrr / maxMrr) * 100));

              return (
                <div key={stg.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {stg.title} ({stgLeads.length})
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100">
                      R$ {stgMrr.toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-7 rounded-xl overflow-hidden p-1 flex items-center">
                    <div
                      className={`h-full rounded-lg transition-all duration-500 flex items-center justify-end px-2 text-[10px] font-bold text-white shadow-xs ${
                        stg.id === 'won'
                          ? 'bg-emerald-500'
                          : stg.id === 'lost'
                          ? 'bg-rose-400'
                          : 'bg-indigo-600'
                      }`}
                      style={{ width: `${percentageWidth}%` }}
                    >
                      {percentageWidth > 20 && `R$ ${stgMrr.toLocaleString('pt-BR')}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Participação por Plano SaaS (Starter, Growth, Scale, Enterprise) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
              Distribuição por Plano SaaS
            </h3>
            <p className="text-xs text-slate-500">
              Participação dos planos na receita total
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {planDistribution.map((item) => (
              <div key={item.plan} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    Plano {item.plan}
                  </span>
                  <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                    R$ {item.mrr.toLocaleString('pt-BR')} ({item.percentage}%)
                  </span>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-500">
                  {item.count} {item.count === 1 ? 'oportunidade' : 'oportunidades'} neste plano
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Leaderboard dos Vendedores (Atingimento da Meta MRR) */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
            Leaderboard de Vendedores (Atingimento da Meta MRR)
          </h3>
          <p className="text-xs text-slate-500">
            Acompanhe o desempenho individual da equipe de vendas no mês
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {salesReps.map((rep) => {
            const repLeads = leads.filter(l => l.assignedRep === rep.name);
            const repWonMrr = repLeads.filter(l => l.stage === 'won').reduce((acc, l) => acc + l.mrr, 0);
            const repPipelineMrr = repLeads.filter(l => l.stage !== 'lost').reduce((acc, l) => acc + l.mrr, 0);
            const goalAttainment = Math.round((repPipelineMrr / rep.mrrTarget) * 100);

            return (
              <div key={rep.id} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-3">
                  <img
                    src={rep.avatar}
                    alt={rep.name}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-indigo-500/30"
                  />
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {rep.name}
                    </h4>
                    <p className="text-xs text-slate-500">{rep.role}</p>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Pipeline Atual:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      R$ {repPipelineMrr.toLocaleString('pt-BR')} / R$ {rep.mrrTarget.toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        goalAttainment >= 80 ? 'bg-emerald-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${Math.min(100, goalAttainment)}%` }}
                    />
                  </div>

                  <p className="text-right text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                    {goalAttainment}% da Meta
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
