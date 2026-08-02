import React, { useState } from 'react';
import { Lead, PipelineStage, PipelineStageId, SaaSPlan } from '../types';
import { 
  Building2, 
  ArrowUpDown, 
  Download, 
  Sparkles, 
  Search, 
  Tag, 
  MoreVertical, 
  Calendar, 
  Users, 
  DollarSign,
  ChevronRight
} from 'lucide-react';

interface ListViewProps {
  leads: Lead[];
  stages: PipelineStage[];
  onSelectLead: (lead: Lead) => void;
  onUpdateLeadStage: (leadId: string, newStage: PipelineStageId) => void;
}

export const ListView: React.FC<ListViewProps> = ({
  leads,
  stages,
  onSelectLead,
  onUpdateLeadStage,
}) => {
  const [sortField, setSortField] = useState<'companyName' | 'mrr' | 'probability' | 'createdAt'>('mrr');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const handleSort = (field: 'companyName' | 'mrr' | 'probability' | 'createdAt') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedLeads = [...leads].sort((a, b) => {
    let valueA = a[sortField];
    let valueB = b[sortField];

    if (typeof valueA === 'string') {
      return sortDirection === 'asc' 
        ? valueA.localeCompare(valueB as string) 
        : (valueB as string).localeCompare(valueA);
    }
    return sortDirection === 'asc' ? (valueA as number) - (valueB as number) : (valueB as number) - (valueA as number);
  });

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(l => l.id));
    }
  };

  const toggleSelectLead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLeadIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const exportToCsv = () => {
    const headers = ['Empresa', 'Contato', 'E-mail', 'Cargo', 'Etapa', 'Plano', 'MRR (R$)', 'ARR (R$)', 'Seats', 'Vendedor', 'Fit Score', 'Trial'];
    const rows = leads.map(l => [
      `"${l.companyName}"`,
      `"${l.contactName}"`,
      `"${l.contactEmail}"`,
      `"${l.contactRole}"`,
      `"${l.stage}"`,
      `"${l.planInterest}"`,
      l.mrr,
      l.arr,
      l.seats,
      `"${l.assignedRep}"`,
      l.fitScore || 0,
      `"${l.trialStatus}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pipeline_leads_saas_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-4">
      {/* Barra de Ações em Massa / Exportação */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Total na Tabela: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{leads.length} leads</span>
          </p>
          {selectedLeadIds.length > 0 && (
            <span className="px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-lg">
              {selectedLeadIds.length} selecionados
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportToCsv}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Tabela de Leads SaaS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedLeadIds.length === leads.length && leads.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th 
                  onClick={() => handleSort('companyName')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Empresa & Contato</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Etapa do Funil</th>
                <th className="py-3.5 px-4">Plano SaaS</th>
                <th 
                  onClick={() => handleSort('mrr')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>MRR / Seats</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('probability')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Probabilidade</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Vendedor</th>
                <th className="py-3.5 px-4">Trial / Status</th>
                <th className="py-3.5 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs text-slate-700 dark:text-slate-300">
              {sortedLeads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Nenhum lead localizado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                sortedLeads.map((lead) => {
                  const isSelected = selectedLeadIds.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => onSelectLead(lead)}
                      className={`hover:bg-indigo-50/40 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50/70 dark:bg-slate-800/80' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center" onClick={(e) => toggleSelectLead(lead.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                          <span>{lead.companyName}</span>
                          {lead.fitScore !== undefined && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-md">
                              Fit {lead.fitScore}%
                            </span>
                          )}
                        </div>
                        <p className="text-slate-500 text-[11px] font-medium">
                          {lead.contactName} • {lead.contactRole} ({lead.contactEmail})
                        </p>
                      </td>

                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={lead.stage}
                          onChange={(e) => onUpdateLeadStage(lead.id, e.target.value as PipelineStageId)}
                          className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 text-slate-800 dark:text-slate-200"
                        >
                          {stages.map((stg) => (
                            <option key={stg.id} value={stg.id}>
                              {stg.title}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          {lead.planInterest}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                          R$ {lead.mrr.toLocaleString('pt-BR')}
                          <span className="text-[10px] font-normal text-slate-400"> /mês</span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {lead.seats} licenças ({lead.companySize} func)
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-indigo-600 h-full rounded-full"
                              style={{ width: `${lead.probability}%` }}
                            />
                          </div>
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                            {lead.probability}%
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <img
                            src={lead.assignedRepAvatar}
                            alt={lead.assignedRep}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {lead.assignedRep}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {lead.trialStatus === 'Expiring Soon' ? (
                          <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-md">
                            Trial: {lead.trialDaysLeft}d
                          </span>
                        ) : lead.trialStatus === 'Active' ? (
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-md">
                            Trial Ativo
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">
                            {lead.trialStatus}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
