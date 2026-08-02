import React, { useState } from 'react';
import { X, Building2, User, Mail, Phone, DollarSign, Users, Sparkles } from 'lucide-react';
import { Lead, PipelineStage, PipelineStageId, SaaSPlan, LeadSource, LeadPriority, SalesRep, PlanConfig } from '../types';

interface NewLeadModalProps {
  stages: PipelineStage[];
  salesReps?: SalesRep[];
  plans?: PlanConfig[];
  onClose: () => void;
  onAddLead: (lead: Lead) => void;
}

export const NewLeadModal: React.FC<NewLeadModalProps> = ({
  stages,
  salesReps = [],
  plans = [],
  onClose,
  onAddLead,
}) => {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRole, setContactRole] = useState('Decisor de Compras');
  const [companySize, setCompanySize] = useState<'1-10' | '11-50' | '51-200' | '201-500' | '500+'>('11-50');
  const [industry, setIndustry] = useState('Tecnologia & Software');
  const [stage, setStage] = useState<PipelineStageId>('inbound');
  const [planInterest, setPlanInterest] = useState<SaaSPlan>(plans[0]?.name || 'Growth');
  const [seats, setSeats] = useState(15);
  const [assignedRep, setAssignedRep] = useState(salesReps[0]?.name || 'Carlos Andrade');
  const [source, setSource] = useState<LeadSource>('Inbound Web');
  const [priority, setPriority] = useState<LeadPriority>('Média');
  const [notes, setNotes] = useState('');

  // Cálculo automático do MRR baseado na lista dinâmica de planos ou fallback
  const calculateMrr = (seatsNum: number, planName: SaaSPlan) => {
    const matchedPlan = plans.find(p => p.name.toLowerCase() === planName.toLowerCase());
    let seatPrice = matchedPlan ? matchedPlan.pricePerSeat : 100;
    if (!matchedPlan) {
      if (planName === 'Growth') seatPrice = 250;
      if (planName === 'Scale') seatPrice = 350;
      if (planName === 'Enterprise') seatPrice = 450;
    }
    return Math.max(500, seatsNum * seatPrice);
  };

  const estimatedMrr = calculateMrr(seats, planInterest);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactName.trim()) return;

    const matchedRep = salesReps.find(r => r.name === assignedRep);
    const repAvatar = matchedRep?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150';

    const newLead: Lead = {
      id: `lead-${Date.now()}`,
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      contactRole,
      companySize,
      industry,
      stage,
      planInterest,
      mrr: estimatedMrr,
      arr: estimatedMrr * 12,
      seats,
      probability: stages.find(s => s.id === stage)?.probability || 20,
      assignedRep,
      assignedRepAvatar: repAvatar,
      source,
      priority,
      trialStatus: 'Active',
      trialDaysLeft: 14,
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
      expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      notes,
      tags: ['Novo Lead', planInterest],
      activities: [
        {
          id: `act-${Date.now()}`,
          type: 'note',
          title: 'Lead Cadastrado no CRM',
          description: `Oportunidade criada para o plano ${planInterest} com ${seats} licenças.`,
          timestamp: new Date().toLocaleString('pt-BR'),
          author: assignedRep
        }
      ]
    };

    onAddLead(newLead);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Cabeçalho do Modal */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-xl">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                Cadastrar Novo Lead SaaS
              </h3>
              <p className="text-xs text-slate-500">
                Preencha os dados do cliente e calcule o ticket de MRR automaticamente.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          
          {/* Nome da Empresa & Contato */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nome da Empresa *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: TechCorp LTDA"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nome do Contato / Decisor *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Ana Souza"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
              />
            </div>
          </div>

          {/* E-mail, Telefone & Cargo */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                E-mail Corporativo
              </label>
              <input
                type="email"
                placeholder="ana@techcorp.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                placeholder="(11) 98888-7777"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Cargo do Contato
              </label>
              <input
                type="text"
                placeholder="Ex: VP de Operações"
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          {/* Calculadora de Ticket SaaS (Plano x Licenças) */}
          <div className="bg-indigo-50/60 dark:bg-indigo-950/40 p-3.5 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 grid grid-cols-3 gap-3 items-center">
            <div>
              <label className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 block mb-1">
                Plano SaaS
              </label>
              <select
                value={planInterest}
                onChange={(e) => setPlanInterest(e.target.value as SaaSPlan)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl font-bold text-indigo-900 dark:text-indigo-100"
              >
                {plans && plans.length > 0 ? (
                  plans.map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name} (R$ {p.pricePerSeat}/seat)
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Starter">Starter (R$ 100/seat)</option>
                    <option value="Growth">Growth (R$ 250/seat)</option>
                    <option value="Scale">Scale (R$ 350/seat)</option>
                    <option value="Enterprise">Enterprise (R$ 450/seat)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 block mb-1">
                Licenças (Seats)
              </label>
              <input
                type="number"
                min="1"
                value={seats}
                onChange={(e) => setSeats(parseInt(e.target.value) || 1)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl font-bold"
              />
            </div>

            <div className="text-right pl-2">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">MRR Calculado</span>
              <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                R$ {estimatedMrr.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500">/mês</span>
              </span>
            </div>
          </div>

          {/* Etapa, Vendedor e Origem */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Etapa Inicial
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as PipelineStageId)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                {stages.map((stg) => (
                  <option key={stg.id} value={stg.id}>
                    {stg.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Vendedor Responsável
              </label>
              <select
                value={assignedRep}
                onChange={(e) => setAssignedRep(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
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
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Origem do Lead
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as LeadSource)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="Inbound Web">Inbound Web</option>
                <option value="Trial Signup (PLG)">Trial Signup (PLG)</option>
                <option value="LinkedIn Outbound">LinkedIn Outbound</option>
                <option value="Cold Outreach">Cold Outreach</option>
                <option value="Indicação / Referral">Indicação / Referral</option>
              </select>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
              Observações & Dores do Cliente
            </label>
            <textarea
              rows={3}
              placeholder="Descreva as dores, urgência e necessidades do cliente..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          {/* Botões do Rodapé */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md"
            >
              Criar Lead no Pipeline
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
