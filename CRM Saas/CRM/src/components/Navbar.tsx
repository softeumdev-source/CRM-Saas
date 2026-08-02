import React from 'react';
import { 
  Kanban, 
  ListFilter, 
  PieChart, 
  Sparkles, 
  Plus, 
  Search, 
  DollarSign, 
  TrendingUp, 
  Flame, 
  Users,
  Filter,
  CheckCircle2,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { Lead, SalesRep, PlanConfig } from '../types';

interface NavbarProps {
  currentView: 'kanban' | 'list' | 'analytics' | 'ai-copilot' | 'admin';
  setCurrentView: (view: 'kanban' | 'list' | 'analytics' | 'ai-copilot' | 'admin') => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedRepFilter: string;
  setSelectedRepFilter: (rep: string) => void;
  selectedStageFilter: string;
  setSelectedStageFilter: (stage: string) => void;
  selectedPlanFilter: string;
  setSelectedPlanFilter: (plan: string) => void;
  onOpenNewLeadModal: () => void;
  onOpenAiInsights: () => void;
  leads: Lead[];
  salesReps?: SalesRep[];
  plans?: PlanConfig[];
  onResetData: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  searchTerm,
  setSearchTerm,
  selectedRepFilter,
  setSelectedRepFilter,
  selectedStageFilter,
  setSelectedStageFilter,
  selectedPlanFilter,
  setSelectedPlanFilter,
  onOpenNewLeadModal,
  onOpenAiInsights,
  leads,
  salesReps = [],
  plans = [],
  onResetData
}) => {
  // Calculando Métricas do Funil SaaS
  const activeLeads = leads.filter(l => l.stage !== 'lost');
  const wonLeads = leads.filter(l => l.stage === 'won');
  const pipelineMrr = activeLeads.reduce((acc, l) => acc + (l.stage === 'won' ? 0 : l.mrr), 0);
  const wonMrr = wonLeads.reduce((acc, l) => acc + l.mrr, 0);
  const totalWeightedMrr = activeLeads.reduce((acc, l) => acc + (l.mrr * (l.probability / 100)), 0);
  const activeTrials = leads.filter(l => l.trialStatus === 'Active' || l.trialStatus === 'Expiring Soon').length;

  const hasActiveFilters = selectedRepFilter !== 'all' || selectedStageFilter !== 'all' || selectedPlanFilter !== 'all' || searchTerm.trim() !== '';

  const clearFilters = () => {
    setSelectedRepFilter('all');
    setSelectedStageFilter('all');
    setSelectedPlanFilter('all');
    setSearchTerm('');
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs">
      {/* Linha Superior: Logo, Estatísticas SaaS e Ações */}
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Logo & Marca */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 p-0.5 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <div className="h-full w-full bg-white dark:bg-slate-900 rounded-[10px] flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                SaaS Pipeline CRM
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
                SaaS B2B
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gestão de Leads & Funil de Assinaturas
            </p>
          </div>
        </div>

        {/* Resumo de Métricas SaaS Rápidas */}
        <div className="hidden lg:flex items-center gap-6 px-4 py-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              <DollarSign className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Pipeline MRR
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                R$ {pipelineMrr.toLocaleString('pt-BR')}
                <span className="text-[11px] font-normal text-slate-500 ml-1">/mês</span>
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                MRR Fechado (Ganhos)
              </p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                R$ {wonMrr.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-100/80 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <Flame className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Trials Ativos
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {activeTrials} <span className="text-xs text-amber-600 font-medium">Leads em Teste</span>
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-100/80 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                MRR Ponderado
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                R$ {Math.round(totalWeightedMrr).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação Principais */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenAiInsights}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200/80 dark:border-indigo-800 rounded-xl transition-all shadow-2xs group"
            title="Copiloto de IA para Vendas SaaS"
          >
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Copiloto IA SaaS</span>
          </button>

          <button
            onClick={onOpenNewLeadModal}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-600/20 active:scale-[0.98] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Lead</span>
          </button>
        </div>
      </div>

      {/* Linha Inferior: Alternador de Visualização & Filtros Dinâmicos */}
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        
        {/* Abas de Visualização (Kanban, Lista, Funil SaaS, IA Copilot) */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1">
          <button
            onClick={() => setCurrentView('kanban')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'kanban'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Kanban className="h-3.5 w-3.5" />
            <span>Pipeline Kanban</span>
          </button>

          <button
            onClick={() => setCurrentView('list')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'list'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ListFilter className="h-3.5 w-3.5" />
            <span>Tabela de Leads</span>
          </button>

          <button
            onClick={() => setCurrentView('analytics')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'analytics'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <PieChart className="h-3.5 w-3.5" />
            <span>Métricas & Funil</span>
          </button>

          <button
            onClick={() => setCurrentView('ai-copilot')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'ai-copilot'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            <span>Estratégia IA</span>
          </button>

          <button
            onClick={() => setCurrentView('admin')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              currentView === 'admin'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Painel Admin</span>
          </button>
        </div>

        {/* Campo de Busca & Filtros por Vendedor / Plano */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Busca por Empresa/Contato */}
          <div className="relative min-w-[200px] sm:min-w-[260px]">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar lead, empresa ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-900 dark:text-slate-100 placeholder-slate-400"
            />
          </div>

          {/* Filtro por Vendedor */}
          <select
            value={selectedRepFilter}
            onChange={(e) => setSelectedRepFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-700 dark:text-slate-300"
          >
            <option value="all">Todos os Vendedores</option>
            {salesReps && salesReps.length > 0 ? (
              salesReps.map(r => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))
            ) : (
              <>
                <option value="Carlos Andrade">Carlos Andrade</option>
                <option value="Fernanda Lima">Fernanda Lima</option>
                <option value="Lucas Martins">Lucas Martins</option>
              </>
            )}
          </select>

          {/* Filtro por Plano SaaS */}
          <select
            value={selectedPlanFilter}
            onChange={(e) => setSelectedPlanFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-700 dark:text-slate-300"
          >
            <option value="all">Todos os Planos</option>
            {plans && plans.length > 0 ? (
              plans.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))
            ) : (
              <>
                <option value="Starter">Starter</option>
                <option value="Growth">Growth</option>
                <option value="Scale">Scale</option>
                <option value="Enterprise">Enterprise</option>
              </>
            )}
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline px-2 py-1 font-medium"
            >
              Limpar filtros
            </button>
          )}

          <button
            onClick={onResetData}
            title="Restaurar dados de exemplo"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
