import React, { useState } from 'react';
import { SalesRep, Lead, PipelineStage, PlanConfig } from '../types';
import { 
  Users, 
  UserPlus, 
  DollarSign, 
  TrendingUp, 
  Target, 
  ShieldCheck, 
  Package, 
  Plus, 
  X, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  BarChart3, 
  Sparkles,
  ArrowRight,
  Briefcase,
  Layers,
  Award,
  ChevronRight,
  Search,
  Filter
} from 'lucide-react';

interface AdminViewProps {
  salesReps: SalesRep[];
  onAddSalesRep: (rep: SalesRep) => void;
  onUpdateSalesRep: (rep: SalesRep) => void;
  onDeleteSalesRep: (repId: string) => void;
  plans: PlanConfig[];
  onAddPlan: (plan: PlanConfig) => void;
  onUpdatePlan: (plan: PlanConfig) => void;
  onDeletePlan: (planId: string) => void;
  leads: Lead[];
  stages: PipelineStage[];
  onSelectLead?: (lead: Lead) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  salesReps = [],
  onAddSalesRep,
  onUpdateSalesRep,
  onDeleteSalesRep,
  plans = [],
  onAddPlan,
  onUpdatePlan,
  onDeletePlan,
  leads = [],
  stages = [],
  onSelectLead,
}) => {
  const [activeTab, setActiveTab] = useState<'reps' | 'rep-funnel' | 'plans'>('reps');
  
  // Rep Selecionado para Filtro do Funil
  const [selectedRepId, setSelectedRepId] = useState<string>(salesReps[0]?.id || 'all');

  // Estado dos Modais
  const [isAddRepModalOpen, setIsAddRepModalOpen] = useState(false);
  const [isEditRepModalOpen, setIsEditRepModalOpen] = useState(false);
  const [editingRep, setEditingRep] = useState<SalesRep | null>(null);

  const [isAddPlanModalOpen, setIsAddPlanModalOpen] = useState(false);
  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanConfig | null>(null);

  // Form Vendedor
  const [repName, setRepName] = useState('');
  const [repRole, setRepRole] = useState('Account Executive (AE)');
  const [repMrrTarget, setRepMrrTarget] = useState(30000);
  const [repAvatar, setRepAvatar] = useState('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150');

  // Form Plano
  const [planName, setPlanName] = useState('');
  const [planPrice, setPlanPrice] = useState(200);
  const [planDescription, setPlanDescription] = useState('');
  const [planMinSeats, setPlanMinSeats] = useState(5);
  const [planFeaturesText, setPlanFeaturesText] = useState('Até 10 usuários, Múltiplos funis, Suporte prioritário');
  const [planIsPopular, setPlanIsPopular] = useState(false);

  // Presets de Avatares para Vendedores
  const avatarPresets = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=150',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=150'
  ];

  // Submit Criar Vendedor
  const handleCreateRep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repName.trim()) return;

    const newRep: SalesRep = {
      id: `rep-${Date.now()}`,
      name: repName.trim(),
      role: repRole.trim(),
      avatar: repAvatar,
      mrrTarget: repMrrTarget,
      currentMrr: 0,
      dealsCount: 0
    };

    onAddSalesRep(newRep);
    setIsAddRepModalOpen(false);
    resetRepForm();
  };

  // Submit Editar Vendedor
  const handleSaveEditedRep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRep || !repName.trim()) return;

    const updated: SalesRep = {
      ...editingRep,
      name: repName.trim(),
      role: repRole.trim(),
      avatar: repAvatar,
      mrrTarget: repMrrTarget,
    };

    onUpdateSalesRep(updated);
    setIsEditRepModalOpen(false);
    setEditingRep(null);
    resetRepForm();
  };

  const openEditRep = (rep: SalesRep) => {
    setEditingRep(rep);
    setRepName(rep.name);
    setRepRole(rep.role);
    setRepMrrTarget(rep.mrrTarget);
    setRepAvatar(rep.avatar);
    setIsEditRepModalOpen(true);
  };

  const resetRepForm = () => {
    setRepName('');
    setRepRole('Account Executive (AE)');
    setRepMrrTarget(30000);
    setRepAvatar(avatarPresets[0]);
  };

  // Submit Criar Plano
  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim()) return;

    const featuresArray = planFeaturesText.split(',').map(f => f.trim()).filter(Boolean);

    const newPlan: PlanConfig = {
      id: `plan-${Date.now()}`,
      name: planName.trim(),
      pricePerSeat: planPrice,
      description: planDescription.trim() || 'Plano customizado para vendas SaaS.',
      minSeats: planMinSeats,
      features: featuresArray.length > 0 ? featuresArray : ['Recursos customizados'],
      popular: planIsPopular,
      color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
    };

    onAddPlan(newPlan);
    setIsAddPlanModalOpen(false);
    resetPlanForm();
  };

  // Submit Editar Plano
  const handleSaveEditedPlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan || !planName.trim()) return;

    const featuresArray = planFeaturesText.split(',').map(f => f.trim()).filter(Boolean);

    const updated: PlanConfig = {
      ...editingPlan,
      name: planName.trim(),
      pricePerSeat: planPrice,
      description: planDescription.trim(),
      minSeats: planMinSeats,
      features: featuresArray,
      popular: planIsPopular,
    };

    onUpdatePlan(updated);
    setIsEditPlanModalOpen(false);
    setEditingPlan(null);
    resetPlanForm();
  };

  const openEditPlan = (plan: PlanConfig) => {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setPlanPrice(plan.pricePerSeat);
    setPlanDescription(plan.description);
    setPlanMinSeats(plan.minSeats || 1);
    setPlanFeaturesText(plan.features.join(', '));
    setPlanIsPopular(!!plan.popular);
    setIsEditPlanModalOpen(true);
  };

  const resetPlanForm = () => {
    setPlanName('');
    setPlanPrice(200);
    setPlanDescription('');
    setPlanMinSeats(5);
    setPlanFeaturesText('Até 10 usuários, Múltiplos funis, Suporte prioritário');
    setPlanIsPopular(false);
  };

  // Cálculos Globais de Vendedores
  const totalRepsTarget = salesReps.reduce((acc, r) => acc + r.mrrTarget, 0);
  const totalPipelineMrr = leads.filter(l => l.stage !== 'lost').reduce((acc, l) => acc + l.mrr, 0);
  const totalWonMrr = leads.filter(l => l.stage === 'won').reduce((acc, l) => acc + l.mrr, 0);

  // Vendedor Selecionado para Detalhes do Funil
  const activeRep = salesReps.find(r => r.id === selectedRepId) || salesReps[0];
  const repLeads = selectedRepId === 'all' ? leads : leads.filter(l => l.assignedRep === activeRep?.name);
  const repWonLeads = repLeads.filter(l => l.stage === 'won');
  const repActiveLeads = repLeads.filter(l => l.stage !== 'won' && l.stage !== 'lost');
  const repWonMrr = repWonLeads.reduce((acc, l) => acc + l.mrr, 0);
  const repPipelineMrr = repActiveLeads.reduce((acc, l) => acc + l.mrr, 0);
  const repConversionRate = repLeads.length > 0 ? Math.round((repWonLeads.length / repLeads.length) * 100) : 0;

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Banner Principal do Painel de Administração */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 text-xs font-bold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
              Módulo de Administração SaaS
            </span>
            <span className="text-xs text-slate-400">Controle Comercial & Planos</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">
            Painel de Gestão de Vendedores, Funis e Planos SaaS
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Cadastre novos representantes comerciais, configure as metas mensais de MRR, acompanhe o desempenho individual do funil e atualize a tabela de preços dos planos.
          </p>
        </div>

        {/* Abas Internas de Navegação Admin */}
        <div className="flex items-center bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700/60 shrink-0">
          <button
            onClick={() => setActiveTab('reps')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'reps'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Vendedores ({salesReps.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('rep-funnel')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'rep-funnel'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Funil do Vendedor</span>
          </button>

          <button
            onClick={() => setActiveTab('plans')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'plans'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>Planos SaaS ({plans.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 1: VENDEDORES (CADASTRO E METAS) */}
      {/* ========================================================================= */}
      {activeTab === 'reps' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Topo: KPIs da Equipe + Botão Cadastrar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                Equipe Comercial & Vendedores Registrados
              </h3>
              <p className="text-xs text-slate-500">
                Acompanhe o cumprimento das metas de MRR e cadastre novos executivos de conta.
              </p>
            </div>

            <button
              onClick={() => {
                resetRepForm();
                setIsAddRepModalOpen(true);
              }}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all active:scale-95"
            >
              <UserPlus className="h-4 w-4" />
              <span>Cadastrar Novo Vendedor</span>
            </button>
          </div>

          {/* Cards de Métricas Gerais de Vendedores */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-xs font-bold uppercase text-slate-400">Total de Executivos</p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                {salesReps.length} Vendedores
              </p>
              <p className="text-xs text-slate-500 mt-1">Ativos no CRM comercial</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-xs font-bold uppercase text-slate-400">Meta Global de MRR Mensal</p>
              <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                R$ {totalRepsTarget.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-slate-500 mt-1">Soma das metas individuais</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-xs font-bold uppercase text-slate-400">Realizado vs Meta Global</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {totalRepsTarget > 0 ? Math.round((totalWonMrr / totalRepsTarget) * 100) : 0}%
              </p>
              <p className="text-xs text-slate-500 mt-1">
                R$ {totalWonMrr.toLocaleString('pt-BR')} em novos contratos
              </p>
            </div>
          </div>

          {/* Grid de Vendedores Registrados */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {salesReps.map((rep) => {
              const repLeadsList = leads.filter(l => l.assignedRep === rep.name);
              const repWonMrrVal = repLeadsList.filter(l => l.stage === 'won').reduce((acc, l) => acc + l.mrr, 0);
              const repActivePipelineMrr = repLeadsList.filter(l => l.stage !== 'lost').reduce((acc, l) => acc + l.mrr, 0);
              const attainmentPct = rep.mrrTarget > 0 ? Math.round((repActivePipelineMrr / rep.mrrTarget) * 100) : 0;

              return (
                <div
                  key={rep.id}
                  className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-800 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={rep.avatar}
                        alt={rep.name}
                        className="h-12 w-12 rounded-2xl object-cover ring-2 ring-indigo-500/30"
                      />
                      <div>
                        <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                          {rep.name}
                        </h4>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">{rep.role}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditRep(rep)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Editar Meta ou Dados"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      {salesReps.length > 1 && (
                        <button
                          onClick={() => {
                            if (confirm(`Deseja remover o vendedor ${rep.name}?`)) {
                              onDeleteSalesRep(rep.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Remover Vendedor"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Detalhes de Desempenho do Vendedor */}
                  <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Meta de MRR:</span>
                      <span className="font-extrabold text-slate-900 dark:text-slate-100">
                        R$ {rep.mrrTarget.toLocaleString('pt-BR')} /mês
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Pipeline Ativo:</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        R$ {repActivePipelineMrr.toLocaleString('pt-BR')} ({repLeadsList.length} leads)
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">MRR Fechado (Ganhos):</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        R$ {repWonMrrVal.toLocaleString('pt-BR')}
                      </span>
                    </div>

                    {/* Barra de Progresso da Meta */}
                    <div className="pt-2 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Atingimento da Meta</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{attainmentPct}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            attainmentPct >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                          }`}
                          style={{ width: `${Math.min(100, attainmentPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ação: Ver Funil Deste Vendedor */}
                  <button
                    onClick={() => {
                      setSelectedRepId(rep.id);
                      setActiveTab('rep-funnel');
                    }}
                    className="w-full py-2 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <span>Ver Funil de {rep.name.split(' ')[0]}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SEÇÃO 2: ACOMPANHAR O FUNIL DOS VENDEDORES */}
      {/* ========================================================================= */}
      {activeTab === 'rep-funnel' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Seletor do Vendedor para Visualização do Funil */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Filtrar Funil de Vendas por Vendedor
              </label>
              <div className="flex items-center gap-3">
                <select
                  value={selectedRepId}
                  onChange={(e) => setSelectedRepId(e.target.value)}
                  className="px-4 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="all">🌐 Visão Geral (Todos os Vendedores)</option>
                  {salesReps.map((r) => (
                    <option key={r.id} value={r.id}>
                      👤 {r.name} ({r.role})
                    </option>
                  ))}
                </select>

                {selectedRepId !== 'all' && (
                  <span className="text-xs text-slate-500">
                    Exibindo exclusivamente oportunidades atribuídas a <strong>{activeRep?.name}</strong>.
                  </span>
                )}
              </div>
            </div>

            {selectedRepId !== 'all' && activeRep && (
              <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-950/50 p-3 rounded-2xl border border-indigo-200 dark:border-indigo-800 shrink-0">
                <img
                  src={activeRep.avatar}
                  alt={activeRep.name}
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div>
                  <h4 className="font-extrabold text-xs text-indigo-900 dark:text-indigo-200">{activeRep.name}</h4>
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-400 font-semibold">Meta MRR: R$ {activeRep.mrrTarget.toLocaleString('pt-BR')}</p>
                </div>
              </div>
            )}
          </div>

          {/* Cards de Desempenho do Vendedor no Funil */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-xs font-semibold uppercase text-slate-400">Pipeline Ativo</p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                R$ {repPipelineMrr.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-slate-500 mt-1">{repActiveLeads.length} negociações abertas</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-xs font-semibold uppercase text-slate-400">MRR Fechado (Ganhos)</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                R$ {repWonMrr.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-slate-500 mt-1">{repWonLeads.length} contratos assinados</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-xs font-semibold uppercase text-slate-400">Taxa de Conversão</p>
              <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                {repConversionRate}%
              </p>
              <p className="text-xs text-slate-500 mt-1">Leads gerados → Fechados</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-xs font-semibold uppercase text-slate-400">Atingimento da Meta</p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                {activeRep ? Math.round((repPipelineMrr / activeRep.mrrTarget) * 100) : 0}%
              </p>
              <p className="text-xs text-slate-500 mt-1">Com base nas oportunidades ativas</p>
            </div>
          </div>

          {/* Breakdown por Etapa do Funil Deste Vendedor */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
              Distribuição por Etapa no Funil {selectedRepId !== 'all' ? `de ${activeRep?.name}` : 'Geral'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {stages.map((stg) => {
                const stgLeads = repLeads.filter(l => l.stage === stg.id);
                const stgMrr = stgLeads.reduce((acc, l) => acc + l.mrr, 0);

                return (
                  <div
                    key={stg.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                        {stg.title}
                      </span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        {stgLeads.length} leads
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-xs text-slate-500">Volume de MRR:</span>
                      <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                        R$ {stgMrr.toLocaleString('pt-BR')}
                      </span>
                    </div>

                    {/* Lista rápida de empresas nessa etapa */}
                    {stgLeads.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-1">
                        {stgLeads.map(lead => (
                          <div
                            key={lead.id}
                            onClick={() => onSelectLead && onSelectLead(lead)}
                            className="text-[11px] p-1.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/60 dark:border-slate-800 flex items-center justify-between hover:border-indigo-400 cursor-pointer transition-colors"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">
                              {lead.companyName}
                            </span>
                            <span className="font-bold text-slate-600 dark:text-slate-400">
                              R$ {lead.mrr.toLocaleString('pt-BR')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabela Detalhada de Leads do Vendedor */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                  Oportunidades em Acompanhamento ({repLeads.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Clique em qualquer negociação para visualizar o histórico completo ou reatribuir.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-bold text-[10px]">
                    <th className="p-4">Empresa / Contato</th>
                    <th className="p-4">Etapa no Funil</th>
                    <th className="p-4">Plano</th>
                    <th className="p-4">MRR</th>
                    <th className="p-4">Vendedor</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {repLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-900 dark:text-slate-100">{lead.companyName}</p>
                        <p className="text-[11px] text-slate-500">{lead.contactName} • {lead.contactRole}</p>
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
                          {stages.find(s => s.id === lead.stage)?.title || lead.stage}
                        </span>
                      </td>
                      <td className="p-4 font-semibold text-slate-700 dark:text-slate-300">
                        {lead.planInterest} ({lead.seats} seats)
                      </td>
                      <td className="p-4 font-extrabold text-indigo-600 dark:text-indigo-400">
                        R$ {lead.mrr.toLocaleString('pt-BR')} /mês
                      </td>
                      <td className="p-4 font-medium text-slate-600 dark:text-slate-400">
                        {lead.assignedRep}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => onSelectLead && onSelectLead(lead)}
                          className="px-3 py-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 rounded-xl transition-all"
                        >
                          Ver Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SEÇÃO 3: CADASTRO E TABELA DE PLANOS SAAS */}
      {/* ========================================================================= */}
      {activeTab === 'plans' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                Tabela de Planos & Preços do SaaS
              </h3>
              <p className="text-xs text-slate-500">
                Cadastre novos planos, configure o valor base por licença (seat) e recursos inclusos.
              </p>
            </div>

            <button
              onClick={() => {
                resetPlanForm();
                setIsAddPlanModalOpen(true);
              }}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar Novo Plano SaaS</span>
            </button>
          </div>

          {/* Cards dos Planos SaaS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`bg-white dark:bg-slate-900 rounded-3xl p-6 border shadow-xs flex flex-col justify-between relative transition-all ${
                  plan.popular
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-600 text-white rounded-full shadow-md">
                    Mais Vendido
                  </span>
                )}

                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                        {plan.name}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                        {plan.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditPlan(plan)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Editar Plano"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      {plans.length > 1 && (
                        <button
                          onClick={() => {
                            if (confirm(`Deseja excluir o plano ${plan.name}?`)) {
                              onDeletePlan(plan.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Excluir Plano"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="py-2 border-y border-slate-100 dark:border-slate-800">
                    <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      R$ {plan.pricePerSeat.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-xs text-slate-500 font-medium"> /seat/mês</span>
                    {plan.minSeats && plan.minSeats > 1 && (
                      <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                        Mínimo de {plan.minSeats} licenças
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Recursos Incluídos:
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block text-center bg-indigo-50 dark:bg-indigo-950/60 py-2 rounded-xl">
                    Utilizado em Calculadoras de Lead
                  </span>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO DE VENDEDOR */}
      {/* ========================================================================= */}
      {(isAddRepModalOpen || isEditRepModalOpen) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                {isEditRepModalOpen ? 'Editar Vendedor' : 'Cadastrar Novo Vendedor'}
              </h3>
              <button
                onClick={() => {
                  setIsAddRepModalOpen(false);
                  setIsEditRepModalOpen(false);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={isEditRepModalOpen ? handleSaveEditedRep : handleCreateRep} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nome Completo do Vendedor *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Roberto Silveira"
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Cargo / Especialidade *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Account Executive (Enterprise)"
                  value={repRole}
                  onChange={(e) => setRepRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Meta Mensal de MRR (R$) *
                </label>
                <input
                  type="number"
                  required
                  step="1000"
                  min="5000"
                  value={repMrrTarget}
                  onChange={(e) => setRepMrrTarget(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-indigo-600 dark:text-indigo-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Avatar / Foto
                </label>
                <div className="flex items-center gap-2 mb-2">
                  {avatarPresets.map((preset, idx) => (
                    <img
                      key={idx}
                      src={preset}
                      alt="Preset"
                      onClick={() => setRepAvatar(preset)}
                      className={`h-8 w-8 rounded-full object-cover cursor-pointer border-2 transition-transform ${
                        repAvatar === preset ? 'border-indigo-600 scale-110' : 'border-transparent opacity-70'
                      }`}
                    />
                  ))}
                </div>
                <input
                  type="url"
                  placeholder="Ou cole a URL da imagem..."
                  value={repAvatar}
                  onChange={(e) => setRepAvatar(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddRepModalOpen(false);
                    setIsEditRepModalOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md"
                >
                  {isEditRepModalOpen ? 'Salvar Alterações' : 'Cadastrar Vendedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO DE PLANO SAAS */}
      {/* ========================================================================= */}
      {(isAddPlanModalOpen || isEditPlanModalOpen) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                {isEditPlanModalOpen ? 'Editar Plano SaaS' : 'Cadastrar Novo Plano SaaS'}
              </h3>
              <button
                onClick={() => {
                  setIsAddPlanModalOpen(false);
                  setIsEditPlanModalOpen(false);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={isEditPlanModalOpen ? handleSaveEditedPlan : handleCreatePlan} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nome do Plano *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Pro Unlimited, Startup, Business"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Preço por Seat (R$/mês) *
                  </label>
                  <input
                    type="number"
                    required
                    min="10"
                    step="10"
                    value={planPrice}
                    onChange={(e) => setPlanPrice(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-indigo-600 dark:text-indigo-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Mínimo de Seats
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={planMinSeats}
                    onChange={(e) => setPlanMinSeats(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Descrição Curta
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Ideal para empresas em crescimento rápido..."
                  value={planDescription}
                  onChange={(e) => setPlanDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Recursos Inclusos (Separados por vírgula)
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Até 50 usuários, Suporte VIP 24/7, Automação IA, Relatórios Avançados"
                  value={planFeaturesText}
                  onChange={(e) => setPlanFeaturesText(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="popularCheck"
                  checked={planIsPopular}
                  onChange={(e) => setPlanIsPopular(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 rounded border-slate-300"
                />
                <label htmlFor="popularCheck" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Marcar como "Mais Vendido" (Destaque)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddPlanModalOpen(false);
                    setIsEditPlanModalOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md"
                >
                  {isEditPlanModalOpen ? 'Salvar Plano' : 'Cadastrar Plano'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
