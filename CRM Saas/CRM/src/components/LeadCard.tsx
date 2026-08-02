import React from 'react';
import { 
  Building2, 
  Users, 
  DollarSign, 
  Clock, 
  Sparkles, 
  ChevronRight,
  ShieldAlert,
  Flame,
  Tag
} from 'lucide-react';
import { Lead, SaaSPlan } from '../types';

interface LeadCardProps {
  lead: Lead;
  onSelectLead: (lead: Lead) => void;
  onMoveStage?: (leadId: string, direction: 'prev' | 'next') => void;
}

const getPlanBadgeColor = (plan: SaaSPlan) => {
  switch (plan) {
    case 'Enterprise':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    case 'Scale':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
    case 'Growth':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'Starter':
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
};

export const LeadCard: React.FC<LeadCardProps> = ({ lead, onSelectLead, onMoveStage }) => {
  return (
    <div
      onClick={() => onSelectLead(lead)}
      className="group bg-white dark:bg-slate-800/90 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-700/80 shadow-xs hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer transition-all duration-200 relative overflow-hidden"
    >
      {/* Barra sutil superior por prioridade */}
      {lead.priority === 'Alta' && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-rose-500" />
      )}

      {/* Nome da Empresa & Plano SaaS */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
              {lead.companyName}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium pl-5 mt-0.5 line-clamp-1">
            {lead.contactName} • {lead.contactRole}
          </p>
        </div>

        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border ${getPlanBadgeColor(lead.planInterest)} shrink-0`}>
          {lead.planInterest}
        </span>
      </div>

      {/* Valor MRR e Licenças (Seats) */}
      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2.5 my-3 flex items-center justify-between border border-slate-100 dark:border-slate-800">
        <div>
          <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
            MRR Estimado
          </p>
          <p className="text-base font-extrabold text-slate-900 dark:text-slate-100">
            R$ {lead.mrr.toLocaleString('pt-BR')}
            <span className="text-[11px] font-normal text-slate-500 font-sans">/mês</span>
          </p>
        </div>

        <div className="text-right">
          <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
            Licenças
          </p>
          <div className="flex items-center justify-end gap-1 font-bold text-xs text-slate-700 dark:text-slate-300">
            <Users className="h-3.5 w-3.5 text-indigo-500" />
            <span>{lead.seats} seats</span>
          </div>
        </div>
      </div>

      {/* Badges de Fit Score & Trial Status */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {lead.fitScore !== undefined && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-md border border-indigo-200 dark:border-indigo-800">
            <Sparkles className="h-3 w-3 text-indigo-500" />
            Fit IA: {lead.fitScore}%
          </span>
        )}

        {lead.trialStatus === 'Expiring Soon' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800 animate-pulse">
            <Flame className="h-3 w-3 text-amber-500" />
            Trial: {lead.trialDaysLeft}d restantes
          </span>
        )}

        {lead.trialStatus === 'Active' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 rounded-md border border-emerald-200 dark:border-emerald-800">
            <Clock className="h-3 w-3 text-emerald-500" />
            Trial Ativo
          </span>
        )}

        <span className="px-1.5 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-700/60 rounded-md">
          {lead.source}
        </span>
      </div>

      {/* Tags do Lead */}
      {lead.tags && lead.tags.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar mb-3">
          {lead.tags.slice(0, 2).map((tag, idx) => (
            <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800 rounded-md">
              <Tag className="h-2.5 w-2.5 text-slate-400" />
              {tag}
            </span>
          ))}
          {lead.tags.length > 2 && (
            <span className="text-[10px] text-slate-400 font-medium">
              +{lead.tags.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Rodapé: Vendedor & Probabilidade de Fechamento */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src={lead.assignedRepAvatar}
            alt={lead.assignedRep}
            className="h-6 w-6 rounded-full object-cover ring-2 ring-white dark:ring-slate-800"
            title={`Vendedor: ${lead.assignedRep}`}
          />
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate max-w-[100px]">
            {lead.assignedRep.split(' ')[0]}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {lead.probability}% Prob.
          </span>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </div>
  );
};
