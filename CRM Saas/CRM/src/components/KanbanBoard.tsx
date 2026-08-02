import React from 'react';
import { Lead, PipelineStage, PipelineStageId } from '../types';
import { LeadCard } from './LeadCard';
import { Plus, ChevronRight, ChevronLeft, DollarSign, Layers } from 'lucide-react';

interface KanbanBoardProps {
  stages: PipelineStage[];
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onUpdateLeadStage: (leadId: string, newStage: PipelineStageId) => void;
  onOpenNewLeadModal: () => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  stages,
  leads,
  onSelectLead,
  onUpdateLeadStage,
  onOpenNewLeadModal,
}) => {
  // Configuração para Drag and Drop básico HTML5
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStageId: PipelineStageId) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    if (leadId) {
      onUpdateLeadStage(leadId, targetStageId);
    }
  };

  return (
    <div className="flex-1 overflow-x-auto pb-6 pt-2 px-4 sm:px-6">
      <div className="flex gap-4 min-w-[1400px]">
        {stages.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.stage === stage.id);
          const stageMrrTotal = stageLeads.reduce((acc, lead) => acc + lead.mrr, 0);

          return (
            <div
              key={stage.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.id)}
              className={`w-[320px] shrink-0 flex flex-col rounded-2xl border ${stage.color.border} ${stage.color.bg} p-3.5 min-h-[700px] transition-all`}
            >
              {/* Cabeçalho da Coluna Kanban */}
              <div className="mb-3.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <h2 className={`font-bold text-sm ${stage.color.text}`}>
                      {stage.title}
                    </h2>
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${stage.color.badge}`}>
                      {stageLeads.length}
                    </span>
                  </div>

                  <button
                    onClick={onOpenNewLeadModal}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 dark:hover:bg-slate-800 transition-all"
                    title="Adicionar lead nesta etapa"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>MRR na etapa:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    R$ {stageMrrTotal.toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              {/* Lista de Cards com Arraste */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {stageLeads.length === 0 ? (
                  <div className="h-36 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center p-4 text-center">
                    <Layers className="h-6 w-6 text-slate-300 dark:text-slate-600 mb-1" />
                    <p className="text-xs text-slate-400 font-medium">
                      Nenhum lead nesta etapa
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Arraste um card para cá
                    </p>
                  </div>
                ) : (
                  stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <LeadCard
                        lead={lead}
                        onSelectLead={onSelectLead}
                      />
                    </div>
                  ))
                )}
              </div>

              {/* Rodapé da Coluna com Probabilidade Média */}
              <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <span>Conversão estim.: {stage.probability}%</span>
                <span>{stageLeads.length} {stageLeads.length === 1 ? 'lead' : 'leads'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
