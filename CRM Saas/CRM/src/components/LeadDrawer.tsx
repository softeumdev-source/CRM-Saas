import React, { useState } from 'react';
import { 
  X, 
  Building2, 
  User, 
  Mail, 
  Phone, 
  DollarSign, 
  Users, 
  Calendar, 
  Sparkles, 
  Send, 
  CheckCircle2, 
  Clock, 
  Tag, 
  Copy, 
  Check, 
  AlertTriangle, 
  Plus, 
  MessageSquare, 
  FileText, 
  PhoneCall, 
  Video,
  ChevronRight,
  Loader2,
  HelpCircle,
  TrendingUp,
  ShieldCheck
} from 'lucide-react';
import { Lead, PipelineStage, PipelineStageId, SaaSPlan, ActivityType, AiQualificationResult, AiEmailResult } from '../types';

interface LeadDrawerProps {
  lead: Lead | null;
  stages: PipelineStage[];
  onClose: () => void;
  onUpdateLead: (updatedLead: Lead) => void;
  onDeleteLead: (leadId: string) => void;
}

export const LeadDrawer: React.FC<LeadDrawerProps> = ({
  lead,
  stages,
  onClose,
  onUpdateLead,
  onDeleteLead,
}) => {
  if (!lead) return null;

  const [activeTab, setActiveTab] = useState<'overview' | 'ai-qualification' | 'ai-email' | 'activities'>('overview');
  const [copied, setCopied] = useState(false);

  // Estados do Qualificador de IA
  const [qualifying, setQualifying] = useState(false);
  const [aiResult, setAiResult] = useState<AiQualificationResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Estados do Gerador de E-mail IA
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [emailType, setEmailType] = useState('Pós-Demonstração SaaS');
  const [emailTone, setEmailTone] = useState('Consultivo e Focado em ROI');
  const [emailResult, setEmailResult] = useState<AiEmailResult | null>(null);

  // Estado para nova atividade
  const [newActivityType, setNewActivityType] = useState<ActivityType>('call');
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [newActivityDesc, setNewActivityDesc] = useState('');

  // Atualização de campos de edição direta
  const handleStageChange = (newStage: PipelineStageId) => {
    const updated = {
      ...lead,
      stage: newStage,
      updatedAt: new Date().toISOString().slice(0, 10),
      activities: [
        {
          id: `act-${Date.now()}`,
          type: 'stage_change' as ActivityType,
          title: `Etapa alterada para: ${stages.find(s => s.id === newStage)?.title}`,
          description: `Vendedor alterou a etapa do lead no funil.`,
          timestamp: new Date().toLocaleString('pt-BR'),
          author: lead.assignedRep
        },
        ...lead.activities
      ]
    };
    onUpdateLead(updated);
  };

  const handleSeatsOrPlanChange = (seats: number, plan: SaaSPlan) => {
    let basePricePerSeat = 100;
    if (plan === 'Growth') basePricePerSeat = 250;
    if (plan === 'Scale') basePricePerSeat = 350;
    if (plan === 'Enterprise') basePricePerSeat = 450;

    const newMrr = Math.max(500, seats * basePricePerSeat);
    const newArr = newMrr * 12;

    onUpdateLead({
      ...lead,
      seats,
      planInterest: plan,
      mrr: newMrr,
      arr: newArr,
      updatedAt: new Date().toISOString().slice(0, 10)
    });
  };

  const handleNotesChange = (notes: string) => {
    onUpdateLead({ ...lead, notes });
  };

  // Execução do Qualificador de IA via Express API
  const runAiQualification = async () => {
    setQualifying(true);
    setAiError(null);
    try {
      const response = await fetch('/api/ai/qualify-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao qualificar lead');
      }

      const data: AiQualificationResult = await response.json();
      setAiResult(data);

      // Atualiza o fit score no lead
      if (data.fitScore) {
        onUpdateLead({
          ...lead,
          fitScore: data.fitScore
        });
      }
    } catch (err: any) {
      setAiError(err.message || 'Falha na comunicação com o servidor de IA.');
    } finally {
      setQualifying(false);
    }
  };

  // Execução do Gerador de E-mail IA
  const runAiEmailGenerator = async () => {
    setGeneratingEmail(true);
    try {
      const response = await fetch('/api/ai/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead, emailType, tone: emailTone })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao gerar e-mail');
      }

      const data: AiEmailResult = await response.json();
      setEmailResult(data);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setGeneratingEmail(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Registrar nova atividade manual
  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivityTitle.trim()) return;

    const newAct = {
      id: `act-${Date.now()}`,
      type: newActivityType,
      title: newActivityTitle,
      description: newActivityDesc,
      timestamp: new Date().toLocaleString('pt-BR'),
      author: lead.assignedRep
    };

    onUpdateLead({
      ...lead,
      activities: [newAct, ...lead.activities]
    });

    setNewActivityTitle('');
    setNewActivityDesc('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col overflow-hidden border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300">
        
        {/* Cabeçalho do Painel Lateral */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {lead.companyName}
              </h2>
              {lead.fitScore !== undefined && (
                <span className="px-2 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded-md">
                  Fit {lead.fitScore}%
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {lead.contactName} • {lead.contactRole} ({lead.contactEmail})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (confirm('Deseja realmente remover este lead do pipeline?')) {
                  onDeleteLead(lead.id);
                  onClose();
                }
              }}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Excluir Lead
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Seletor Rápido de Etapa no Topo */}
        <div className="px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-500">Etapa Atual:</span>
          <select
            value={lead.stage}
            onChange={(e) => handleStageChange(e.target.value as PipelineStageId)}
            className="flex-1 px-3 py-1.5 text-xs font-bold bg-indigo-50 dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-xl text-indigo-900 dark:text-indigo-200 focus:outline-hidden"
          >
            {stages.map((stg) => (
              <option key={stg.id} value={stg.id}>
                {stg.title} ({stg.probability}% Probabilidade)
              </option>
            ))}
          </select>
        </div>

        {/* Abas de Navegação */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 px-5 gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Visão Geral & BANT
          </button>

          <button
            onClick={() => setActiveTab('ai-qualification')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'ai-qualification'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            Qualificador IA
          </button>

          <button
            onClick={() => setActiveTab('ai-email')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'ai-email'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Mail className="h-3.5 w-3.5 text-indigo-500" />
            Gerador de E-mail
          </button>

          <button
            onClick={() => setActiveTab('activities')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'activities'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Atividades ({lead.activities.length})
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* TAB 1: VISÃO GERAL & BANT */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Card de Calculadora de Receita SaaS (Seats x MRR) */}
              <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <DollarSign className="h-32 w-32" />
                </div>

                <p className="text-xs font-medium text-indigo-300 uppercase tracking-wider mb-1">
                  Calculadora de Negócio SaaS
                </p>

                <div className="grid grid-cols-2 gap-4 my-3">
                  <div>
                    <p className="text-xs text-slate-300">MRR Mensal</p>
                    <p className="text-2xl font-extrabold text-white">
                      R$ {lead.mrr.toLocaleString('pt-BR')}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-300">ARR Anualizado</p>
                    <p className="text-2xl font-extrabold text-emerald-400">
                      R$ {lead.arr.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                {/* Seletores de Licenças e Plano */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-indigo-800/80">
                  <div>
                    <label className="text-[11px] font-semibold text-indigo-200 block mb-1">
                      Plano SaaS
                    </label>
                    <select
                      value={lead.planInterest}
                      onChange={(e) => handleSeatsOrPlanChange(lead.seats, e.target.value as SaaSPlan)}
                      className="w-full px-2.5 py-1.5 text-xs bg-indigo-950/80 border border-indigo-700/60 rounded-xl text-white font-bold"
                    >
                      <option value="Starter">Starter (R$ 100/seat)</option>
                      <option value="Growth">Growth (R$ 250/seat)</option>
                      <option value="Scale">Scale (R$ 350/seat)</option>
                      <option value="Enterprise">Enterprise (R$ 450/seat)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-indigo-200 block mb-1">
                      Número de Licenças (Seats)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={lead.seats}
                      onChange={(e) => handleSeatsOrPlanChange(parseInt(e.target.value) || 1, lead.planInterest)}
                      className="w-full px-2.5 py-1.5 text-xs bg-indigo-950/80 border border-indigo-700/60 rounded-xl text-white font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Informações da Empresa & Contato */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-1">
                    Contato Principal
                  </p>
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {lead.contactName}
                  </p>
                  <p className="text-xs text-slate-500">{lead.contactRole}</p>
                  <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 space-y-0.5">
                    <p className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {lead.contactEmail}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {lead.contactPhone}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-1">
                    Perfil da Empresa
                  </p>
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {lead.companyName}
                  </p>
                  <p className="text-xs text-slate-500">{lead.industry}</p>
                  <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                    <p>Tamanho: <strong>{lead.companySize} funcionários</strong></p>
                    <p>Origem: <strong>{lead.source}</strong></p>
                  </div>
                </div>
              </div>

              {/* Notas do Vendedor & Observações */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Anotações de Vendas & Dores Identificadas
                </label>
                <textarea
                  rows={4}
                  value={lead.notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Registre as principais dores do cliente, tomadores de decisão e objeções levantadas..."
                  className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

            </div>
          )}

          {/* TAB 2: QUALIFICADOR DE IA */}
          {activeTab === 'ai-qualification' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-indigo-50 to-sky-50 dark:from-indigo-950/40 dark:to-sky-950/20 p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    Qualificação B2B com Gemini AI
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Análise inteligente de fit SaaS, pitch recomendado e contorno de objeções.
                  </p>
                </div>

                <button
                  onClick={runAiQualification}
                  disabled={qualifying}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {qualifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Analisando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>{aiResult ? 'Re-analisar' : 'Qualificar Lead'}</span>
                    </>
                  )}
                </button>
              </div>

              {aiError && (
                <div className="p-4 bg-rose-50 text-rose-700 rounded-xl text-xs border border-rose-200 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              {aiResult && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  {/* Fit Score Badge */}
                  <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase">SaaS Fit Score</p>
                      <p className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                        {aiResult.fitScore}%
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-500 font-medium uppercase">Plano Recomendado</p>
                      <span className="inline-block px-3 py-1 text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 rounded-lg mt-1">
                        {aiResult.recommendedPlan}
                      </span>
                    </div>
                  </div>

                  {/* Resumo */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
                    <p className="font-bold text-slate-900 dark:text-slate-100 mb-1">
                      Resumo Executivo do Lead:
                    </p>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {aiResult.summary}
                    </p>
                  </div>

                  {/* Pitch Recomendado */}
                  <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-xs text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-indigo-600" />
                        Pitch de Vendas Sugerido
                      </h4>
                      <button
                        onClick={() => copyToClipboard(aiResult.suggestedPitch)}
                        className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copied ? 'Copiado!' : 'Copiar Pitch'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900">
                      {aiResult.suggestedPitch}
                    </p>
                  </div>

                  {/* Guia de Objeções */}
                  <div>
                    <h4 className="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                      Como Contornar Objeções Deste Lead
                    </h4>
                    <div className="space-y-3">
                      {aiResult.objectionHandlers.map((obj, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                          <p className="font-bold text-rose-600 dark:text-rose-400 mb-1">
                            Objeção: "{obj.objection}"
                          </p>
                          <p className="text-slate-700 dark:text-slate-300">
                            <strong>Resposta Vendedora:</strong> {obj.response}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* TAB 3: GERADOR DE E-MAIL IA */}
          {activeTab === 'ai-email' && (
            <div className="space-y-5">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Gerador de E-mails para Vendas SaaS
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Objetivo do E-mail
                    </label>
                    <select
                      value={emailType}
                      onChange={(e) => setEmailType(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      <option value="Pós-Demonstração SaaS">Pós-Demonstração SaaS</option>
                      <option value="Envio de Proposta Comercial">Envio de Proposta Comercial</option>
                      <option value="Trial Expirando em Breve">Trial Expirando em Breve</option>
                      <option value="Primeiro Contato Inbound">Primeiro Contato Inbound</option>
                      <option value="Reengajamento de Lead Frio">Reengajamento de Lead Frio</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Tom de Voz
                    </label>
                    <select
                      value={emailTone}
                      onChange={(e) => setEmailTone(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      <option value="Consultivo e Focado em ROI">Consultivo e Focado em ROI</option>
                      <option value="Direto e Objetivo">Direto e Objetivo</option>
                      <option value="Urgente / Oferta Especial">Urgente / Oferta Especial</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={runAiEmailGenerator}
                  disabled={generatingEmail}
                  className="w-full py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {generatingEmail ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Gerando E-mail Perfeito...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Gerar E-mail com IA</span>
                    </>
                  )}
                </button>
              </div>

              {emailResult && (
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Assunto Recomendado</span>
                      <button
                        onClick={() => copyToClipboard(`Assunto: ${emailResult.subject}\n\n${emailResult.body}`)}
                        className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copied ? 'Copiado!' : 'Copiar E-mail'}</span>
                      </button>
                    </div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
                      {emailResult.subject}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Corpo da Mensagem</span>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap border border-slate-200/80 dark:border-slate-700">
                      {emailResult.body}
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
                    <strong>Dica do Especialista de Vendas:</strong> {emailResult.proTip}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: HISTÓRICO DE ATIVIDADES */}
          {activeTab === 'activities' && (
            <div className="space-y-6">
              
              {/* Form de Nova Atividade */}
              <form onSubmit={handleAddActivity} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Registrar Nova Atividade de Vendas
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newActivityType}
                    onChange={(e) => setNewActivityType(e.target.value as ActivityType)}
                    className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                  >
                    <option value="call">Ligação Telefônica</option>
                    <option value="demo">Demonstração (Demo)</option>
                    <option value="email">E-mail Enviado</option>
                    <option value="proposal">Proposta Enviada</option>
                    <option value="note">Nota Interna</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Título da atividade..."
                    value={newActivityTitle}
                    onChange={(e) => setNewActivityTitle(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <textarea
                  rows={2}
                  placeholder="Detalhes ou resultado do contato..."
                  value={newActivityDesc}
                  onChange={(e) => setNewActivityDesc(e.target.value)}
                  className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />

                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Registrar Atividade
                </button>
              </form>

              {/* Linha do Tempo de Atividades */}
              <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {lead.activities.map((act) => (
                  <div key={act.id} className="relative pl-9">
                    <div className="absolute left-1 top-1.5 h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center ring-4 ring-white dark:ring-slate-900">
                      {act.type === 'demo' && <Video className="h-3 w-3" />}
                      {act.type === 'call' && <PhoneCall className="h-3 w-3" />}
                      {act.type === 'email' && <Mail className="h-3 w-3" />}
                      {act.type === 'proposal' && <FileText className="h-3 w-3" />}
                      {act.type === 'stage_change' && <CheckCircle2 className="h-3 w-3" />}
                      {act.type === 'note' && <MessageSquare className="h-3 w-3" />}
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {act.title}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {act.timestamp}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {act.description}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1 font-medium">
                        Por {act.author}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
