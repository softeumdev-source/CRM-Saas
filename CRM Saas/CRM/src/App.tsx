import React, { useState, useEffect } from 'react';
import { Lead, PipelineStageId, SaaSPlan, SalesRep, PlanConfig } from './types';
import { INITIAL_LEADS, PIPELINE_STAGES, SALES_REPS, INITIAL_PLANS } from './data/initialData';
import { Navbar } from './components/Navbar';
import { KanbanBoard } from './components/KanbanBoard';
import { ListView } from './components/ListView';
import { FunnelAnalytics } from './components/FunnelAnalytics';
import { AiSalesCopilot } from './components/AiSalesCopilot';
import { LeadDrawer } from './components/LeadDrawer';
import { NewLeadModal } from './components/NewLeadModal';
import { AdminView } from './components/AdminView';

export default function App() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem('saas_crm_leads_v1');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Falha ao carregar do localStorage', e);
    }
    return INITIAL_LEADS;
  });

  const [salesReps, setSalesReps] = useState<SalesRep[]>(() => {
    try {
      const saved = localStorage.getItem('saas_crm_reps_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Falha ao carregar vendedores', e);
    }
    return SALES_REPS;
  });

  const [plans, setPlans] = useState<PlanConfig[]>(() => {
    try {
      const saved = localStorage.getItem('saas_crm_plans_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Falha ao carregar planos', e);
    }
    return INITIAL_PLANS;
  });

  const [currentView, setCurrentView] = useState<'kanban' | 'list' | 'analytics' | 'ai-copilot' | 'admin'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRepFilter, setSelectedRepFilter] = useState('all');
  const [selectedStageFilter, setSelectedStageFilter] = useState('all');
  const [selectedPlanFilter, setSelectedPlanFilter] = useState('all');

  const [selectedLeadForDrawer, setSelectedLeadForDrawer] = useState<Lead | null>(null);
  const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false);

  // Salvar alterações no localStorage
  useEffect(() => {
    try {
      localStorage.setItem('saas_crm_leads_v1', JSON.stringify(leads));
    } catch (e) {
      console.error('Falha ao salvar no localStorage', e);
    }
  }, [leads]);

  useEffect(() => {
    try {
      localStorage.setItem('saas_crm_reps_v1', JSON.stringify(salesReps));
    } catch (e) {
      console.error('Falha ao salvar vendedores', e);
    }
  }, [salesReps]);

  useEffect(() => {
    try {
      localStorage.setItem('saas_crm_plans_v1', JSON.stringify(plans));
    } catch (e) {
      console.error('Falha ao salvar planos', e);
    }
  }, [plans]);

  // Filtro dinâmico de leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      searchTerm === '' ||
      lead.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.contactEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.industry.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRep = selectedRepFilter === 'all' || lead.assignedRep === selectedRepFilter;
    const matchesStage = selectedStageFilter === 'all' || lead.stage === selectedStageFilter;
    const matchesPlan = selectedPlanFilter === 'all' || lead.planInterest === selectedPlanFilter;

    return matchesSearch && matchesRep && matchesStage && matchesPlan;
  });

  // Handlers de dados
  const handleAddLead = (newLead: Lead) => {
    setLeads(prev => [newLead, ...prev]);
  };

  const handleUpdateLead = (updatedLead: Lead) => {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
    if (selectedLeadForDrawer?.id === updatedLead.id) {
      setSelectedLeadForDrawer(updatedLead);
    }
  };

  const handleDeleteLead = (leadId: string) => {
    setLeads(prev => prev.filter(l => l.id !== leadId));
    if (selectedLeadForDrawer?.id === leadId) {
      setSelectedLeadForDrawer(null);
    }
  };

  const handleUpdateLeadStage = (leadId: string, newStage: PipelineStageId) => {
    setLeads(prev => prev.map(l => {
      if (l.id === leadId) {
        const stageObj = PIPELINE_STAGES.find(s => s.id === newStage);
        return {
          ...l,
          stage: newStage,
          probability: stageObj ? stageObj.probability : l.probability,
          updatedAt: new Date().toISOString().slice(0, 10),
          activities: [
            {
              id: `act-${Date.now()}`,
              type: 'stage_change',
              title: `Manejado para: ${stageObj?.title || newStage}`,
              description: `Estágio alterado no funil de vendas SaaS.`,
              timestamp: new Date().toLocaleString('pt-BR'),
              author: l.assignedRep
            },
            ...l.activities
          ]
        };
      }
      return l;
    }));
  };

  const handleAddSalesRep = (newRep: SalesRep) => {
    setSalesReps(prev => [...prev, newRep]);
  };

  const handleUpdateSalesRep = (updatedRep: SalesRep) => {
    setSalesReps(prev => prev.map(r => r.id === updatedRep.id ? updatedRep : r));
  };

  const handleDeleteSalesRep = (repId: string) => {
    setSalesReps(prev => prev.filter(r => r.id !== repId));
  };

  const handleAddPlan = (newPlan: PlanConfig) => {
    setPlans(prev => [...prev, newPlan]);
  };

  const handleUpdatePlan = (updatedPlan: PlanConfig) => {
    setPlans(prev => prev.map(p => p.id === updatedPlan.id ? updatedPlan : p));
  };

  const handleDeletePlan = (planId: string) => {
    setPlans(prev => prev.filter(p => p.id !== planId));
  };

  const handleResetData = () => {
    if (confirm('Deseja restaurar os leads, vendedores e planos de exemplo originais do CRM?')) {
      setLeads(INITIAL_LEADS);
      setSalesReps(SALES_REPS);
      setPlans(INITIAL_PLANS);
      localStorage.removeItem('saas_crm_leads_v1');
      localStorage.removeItem('saas_crm_reps_v1');
      localStorage.removeItem('saas_crm_plans_v1');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* Barra de Navegação & Filtros Globais */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedRepFilter={selectedRepFilter}
        setSelectedRepFilter={setSelectedRepFilter}
        selectedStageFilter={selectedStageFilter}
        setSelectedStageFilter={setSelectedStageFilter}
        selectedPlanFilter={selectedPlanFilter}
        setSelectedPlanFilter={setSelectedPlanFilter}
        onOpenNewLeadModal={() => setIsNewLeadModalOpen(true)}
        onOpenAiInsights={() => setCurrentView('ai-copilot')}
        leads={leads}
        salesReps={salesReps}
        plans={plans}
        onResetData={handleResetData}
      />

      {/* Conteúdo Principal de Acordo com a Visualização */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {currentView === 'kanban' && (
          <KanbanBoard
            stages={PIPELINE_STAGES}
            leads={filteredLeads}
            onSelectLead={(lead) => setSelectedLeadForDrawer(lead)}
            onUpdateLeadStage={handleUpdateLeadStage}
            onOpenNewLeadModal={() => setIsNewLeadModalOpen(true)}
          />
        )}

        {currentView === 'list' && (
          <ListView
            leads={filteredLeads}
            stages={PIPELINE_STAGES}
            onSelectLead={(lead) => setSelectedLeadForDrawer(lead)}
            onUpdateLeadStage={handleUpdateLeadStage}
          />
        )}

        {currentView === 'analytics' && (
          <FunnelAnalytics
            leads={leads}
            stages={PIPELINE_STAGES}
            salesReps={salesReps}
            onOpenAiInsights={() => setCurrentView('ai-copilot')}
          />
        )}

        {currentView === 'ai-copilot' && (
          <AiSalesCopilot
            leads={leads}
            stages={PIPELINE_STAGES}
          />
        )}

        {currentView === 'admin' && (
          <AdminView
            salesReps={salesReps}
            onAddSalesRep={handleAddSalesRep}
            onUpdateSalesRep={handleUpdateSalesRep}
            onDeleteSalesRep={handleDeleteSalesRep}
            plans={plans}
            onAddPlan={handleAddPlan}
            onUpdatePlan={handleUpdatePlan}
            onDeletePlan={handleDeletePlan}
            leads={leads}
            stages={PIPELINE_STAGES}
            onSelectLead={(lead) => {
              setSelectedLeadForDrawer(lead);
              setCurrentView('kanban');
            }}
          />
        )}
      </main>

      {/* Drawer do Lead Selecionado */}
      {selectedLeadForDrawer && (
        <LeadDrawer
          lead={selectedLeadForDrawer}
          stages={PIPELINE_STAGES}
          onClose={() => setSelectedLeadForDrawer(null)}
          onUpdateLead={handleUpdateLead}
          onDeleteLead={handleDeleteLead}
        />
      )}

      {/* Modal de Criação de Novo Lead */}
      {isNewLeadModalOpen && (
        <NewLeadModal
          stages={PIPELINE_STAGES}
          salesReps={salesReps}
          plans={plans}
          onClose={() => setIsNewLeadModalOpen(false)}
          onAddLead={handleAddLead}
        />
      )}

    </div>
  );
}
