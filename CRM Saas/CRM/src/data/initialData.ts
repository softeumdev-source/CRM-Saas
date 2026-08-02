import { Lead, PipelineStage, SalesRep, PlanConfig } from '../types';

export const INITIAL_PLANS: PlanConfig[] = [
  {
    id: 'plan-starter',
    name: 'Starter',
    pricePerSeat: 100,
    description: 'Para pequenas equipes e startups iniciando a estruturação de vendas.',
    minSeats: 1,
    features: ['Até 5 usuários', 'Pipelines básicos', 'Suporte por e-mail', 'Relatórios padrão'],
    color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
  },
  {
    id: 'plan-growth',
    name: 'Growth',
    pricePerSeat: 250,
    description: 'Para empresas em escala buscando automação e previsão de receitas.',
    minSeats: 5,
    features: ['Até 25 usuários', 'Múltiplos funis', 'Automações via API', 'Módulo de IA para Leads', 'Suporte prioritário'],
    popular: true,
    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
  },
  {
    id: 'plan-scale',
    name: 'Scale',
    pricePerSeat: 350,
    description: 'Para operações comerciais robustas com integrações avançadas e SLA.',
    minSeats: 15,
    features: ['Usuários ilimitados', 'Integração Salesforce/HubSpot', 'Suporte VIP 24/7', 'IA Generativa Ilimitada'],
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
  },
  {
    id: 'plan-enterprise',
    name: 'Enterprise',
    pricePerSeat: 450,
    description: 'Para corporações que exigem segurança avançada, SSO e Gerente de Contas dedicado.',
    minSeats: 30,
    features: ['Gerente de CS dedicado', 'SLA de 99.9% garantido em contrato', 'Infraestrutura dedicada', 'Security Compliance (LGPD/SOC2)'],
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
  }
];

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 'inbound',
    title: 'Novo Lead / Inbound',
    description: 'Leads cadastrados no site, trials recentes ou cadastros frios',
    color: {
      bg: 'bg-slate-50 dark:bg-slate-900/50',
      border: 'border-slate-200 dark:border-slate-800',
      badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      text: 'text-slate-900 dark:text-slate-100'
    },
    probability: 10
  },
  {
    id: 'qualification',
    title: 'Qualificação (BANT)',
    description: 'Verificação de orçamento, tomador de decisão e fit com produto',
    color: {
      bg: 'bg-blue-50/50 dark:bg-blue-950/20',
      border: 'border-blue-200 dark:border-blue-800/60',
      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
      text: 'text-blue-900 dark:text-blue-100'
    },
    probability: 30
  },
  {
    id: 'demo',
    title: 'Demonstração Agendada',
    description: 'Apresentação do software SaaS ao vivo para o cliente',
    color: {
      bg: 'bg-indigo-50/50 dark:bg-indigo-950/20',
      border: 'border-indigo-200 dark:border-indigo-800/60',
      badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
      text: 'text-indigo-900 dark:text-indigo-100'
    },
    probability: 50
  },
  {
    id: 'proposal',
    title: 'Proposta / Trial Ativo',
    description: 'Proposta comercial enviada ou avaliação técnica em andamento',
    color: {
      bg: 'bg-amber-50/50 dark:bg-amber-950/20',
      border: 'border-amber-200 dark:border-amber-800/60',
      badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
      text: 'text-amber-900 dark:text-amber-100'
    },
    probability: 70
  },
  {
    id: 'negotiation',
    title: 'Negociação / Contrato',
    description: 'Minuta de contrato em aprovação pelo jurídico ou financeiro',
    color: {
      bg: 'bg-purple-50/50 dark:bg-purple-950/20',
      border: 'border-purple-200 dark:border-purple-800/60',
      badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
      text: 'text-purple-900 dark:text-purple-100'
    },
    probability: 90
  },
  {
    id: 'won',
    title: 'Fechado (Ganho - MRR)',
    description: 'Cliente assinou e iniciou onboarding do SaaS',
    color: {
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      border: 'border-emerald-200 dark:border-emerald-800/60',
      badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
      text: 'text-emerald-900 dark:text-emerald-100'
    },
    probability: 100
  },
  {
    id: 'lost',
    title: 'Perdido',
    description: 'Oportunidade desqualificada, concorrente ou sem orçamento',
    color: {
      bg: 'bg-rose-50/40 dark:bg-rose-950/20',
      border: 'border-rose-200 dark:border-rose-800/50',
      badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
      text: 'text-rose-900 dark:text-rose-100'
    },
    probability: 0
  }
];

export const SALES_REPS: SalesRep[] = [
  {
    id: 'rep-1',
    name: 'Carlos Andrade',
    role: 'Account Executive (AE Senior)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
    mrrTarget: 35000,
    currentMrr: 28400,
    dealsCount: 12
  },
  {
    id: 'rep-2',
    name: 'Fernanda Lima',
    role: 'Enterprise SaaS Specialist',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=150',
    mrrTarget: 50000,
    currentMrr: 43200,
    dealsCount: 8
  },
  {
    id: 'rep-3',
    name: 'Lucas Martins',
    role: 'SDR / Mid-Market AE',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150',
    mrrTarget: 25000,
    currentMrr: 19800,
    dealsCount: 15
  }
];

export const INITIAL_LEADS: Lead[] = [
  {
    id: 'lead-101',
    companyName: 'TechScale Logistics',
    contactName: 'Mariana Ribeiro',
    contactEmail: 'm.ribeiro@techscale.com.br',
    contactPhone: '(11) 98765-4321',
    contactRole: 'Head de Operações & Tecnologia',
    companySize: '51-200',
    industry: 'Logística & Transportes',
    stage: 'negotiation',
    planInterest: 'Enterprise',
    mrr: 12500,
    arr: 150000,
    seats: 45,
    probability: 90,
    assignedRep: 'Fernanda Lima',
    assignedRepAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=150',
    source: 'Trial Signup (PLG)',
    priority: 'Alta',
    trialStatus: 'Expiring Soon',
    trialDaysLeft: 2,
    fitScore: 94,
    createdAt: '2026-07-15',
    updatedAt: '2026-08-01',
    expectedCloseDate: '2026-08-08',
    notes: 'Cliente em teste grátis Enterprise com 45 licenças ativas. Pediram personalização de SLA no contrato e integração via API.',
    tags: ['Decisor Engajado', 'High Ticket', 'Urgente'],
    activities: [
      {
        id: 'act-1',
        type: 'demo',
        title: 'Demo Técnica de API e Segurança',
        description: 'Demonstrado módulo de controle de acesso, SSO e relatórios em tempo real.',
        timestamp: '2026-07-28 14:30',
        author: 'Fernanda Lima'
      },
      {
        id: 'act-2',
        type: 'proposal',
        title: 'Minuta de Contrato Enterprise Enviada',
        description: 'Minuta de contrato anual com faturamento mensal de R$ 12.500 enviado para avaliação jurídica.',
        timestamp: '2026-07-30 10:15',
        author: 'Fernanda Lima'
      }
    ]
  },
  {
    id: 'lead-102',
    companyName: 'FinFlow Soluções Financeiras',
    contactName: 'Roberto Castro',
    contactEmail: 'roberto@finflow.io',
    contactPhone: '(11) 97123-8899',
    contactRole: 'CTO / Diretor de TI',
    companySize: '201-500',
    industry: 'Fintech',
    stage: 'demo',
    planInterest: 'Scale',
    mrr: 8900,
    arr: 106800,
    seats: 30,
    probability: 50,
    assignedRep: 'Carlos Andrade',
    assignedRepAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
    source: 'LinkedIn Outbound',
    priority: 'Alta',
    trialStatus: 'Active',
    trialDaysLeft: 9,
    fitScore: 88,
    createdAt: '2026-07-20',
    updatedAt: '2026-07-31',
    expectedCloseDate: '2026-08-20',
    notes: 'CTO gostou da arquitetura de microsserviços do nosso SaaS. Reunião de alinhamento técnico agendada com o time de engenharia.',
    tags: ['Fintech', 'Scale Plan', 'Tech Touch'],
    activities: [
      {
        id: 'act-3',
        type: 'call',
        title: 'Chamada de Qualificação BANT',
        description: 'Identificado orçamento aprovado para Q3. Dor principal: perda de tempo em conciliação manual.',
        timestamp: '2026-07-22 11:00',
        author: 'Carlos Andrade'
      }
    ]
  },
  {
    id: 'lead-103',
    companyName: 'DataPulse Analytics',
    contactName: 'Juliana Mendes',
    contactEmail: 'juliana.mendes@datapulse.com',
    contactPhone: '(21) 99881-2233',
    contactRole: 'VP de Vendas & CS',
    companySize: '11-50',
    industry: 'Consultoria de Dados',
    stage: 'proposal',
    planInterest: 'Growth',
    mrr: 4500,
    arr: 54000,
    seats: 15,
    probability: 70,
    assignedRep: 'Lucas Martins',
    assignedRepAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150',
    source: 'Inbound Web',
    priority: 'Média',
    trialStatus: 'Active',
    trialDaysLeft: 5,
    fitScore: 82,
    createdAt: '2026-07-18',
    updatedAt: '2026-07-29',
    expectedCloseDate: '2026-08-12',
    notes: 'Avaliando plano Growth com 15 licenças. Estão comparando com concorrente tradicional, mas elogiaram nossa facilidade de uso.',
    tags: ['Comparando Concorrente', 'Growth'],
    activities: [
      {
        id: 'act-4',
        type: 'proposal',
        title: 'Proposta Comercial Plano Growth',
        description: 'Enviado proposta com desconto de 10% no pagamento anuidade à vista ou R$ 4.500/mês.',
        timestamp: '2026-07-29 16:45',
        author: 'Lucas Martins'
      }
    ]
  },
  {
    id: 'lead-104',
    companyName: 'RetailHub Ecommerce',
    contactName: 'Gabriel Siqueira',
    contactEmail: 'gabriel@retailhub.com.br',
    contactPhone: '(31) 99112-4455',
    contactRole: 'CEO & Fundador',
    companySize: '51-200',
    industry: 'E-commerce & Varejo',
    stage: 'qualification',
    planInterest: 'Growth',
    mrr: 5200,
    arr: 62400,
    seats: 20,
    probability: 30,
    assignedRep: 'Lucas Martins',
    assignedRepAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150',
    source: 'Trial Signup (PLG)',
    priority: 'Média',
    trialStatus: 'Active',
    trialDaysLeft: 12,
    fitScore: 75,
    createdAt: '2026-07-26',
    updatedAt: '2026-07-27',
    expectedCloseDate: '2026-08-25',
    notes: 'Criou conta grátis após ler case de sucesso de automação de e-commerce no blog. Agendando conversa de qualificação.',
    tags: ['PLG Lead', 'Varejo'],
    activities: []
  },
  {
    id: 'lead-105',
    companyName: 'HealthPulse MedTech',
    contactName: 'Dra. Beatriz Almeida',
    contactEmail: 'beatriz@healthpulse.com',
    contactPhone: '(41) 98877-6655',
    contactRole: 'Diretora Médica & Operacional',
    companySize: '500+',
    industry: 'Saúde & Biotecnologia',
    stage: 'won',
    planInterest: 'Enterprise',
    mrr: 18000,
    arr: 216000,
    seats: 80,
    probability: 100,
    assignedRep: 'Fernanda Lima',
    assignedRepAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=150',
    source: 'Indicação / Referral',
    priority: 'Alta',
    trialStatus: 'Converted',
    fitScore: 98,
    createdAt: '2026-06-10',
    updatedAt: '2026-07-25',
    expectedCloseDate: '2026-07-25',
    notes: 'Contrato de 2 anos assinado! 80 usuários ativados no plano Enterprise com suporte VIP 24/7.',
    tags: ['Cliente Ganho', 'Key Account', 'Case de Sucesso'],
    activities: [
      {
        id: 'act-5',
        type: 'stage_change',
        title: 'Oportunidade Fechada e Ganha!',
        description: 'Contrato assinado via DocuSign. MRR de R$ 18.000 confirmado.',
        timestamp: '2026-07-25 09:00',
        author: 'Fernanda Lima'
      }
    ]
  },
  {
    id: 'lead-106',
    companyName: 'EduSmart EdTech',
    contactName: 'Thiago Faria',
    contactEmail: 'thiago@edusmart.com.br',
    contactPhone: '(19) 97766-5544',
    contactRole: 'Gerente de Parcerias',
    companySize: '11-50',
    industry: 'Educação',
    stage: 'inbound',
    planInterest: 'Starter',
    mrr: 1800,
    arr: 21600,
    seats: 5,
    probability: 10,
    assignedRep: 'Carlos Andrade',
    assignedRepAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
    source: 'Inbound Web',
    priority: 'Baixa',
    trialStatus: 'Active',
    trialDaysLeft: 14,
    fitScore: 62,
    createdAt: '2026-08-01',
    updatedAt: '2026-08-01',
    expectedCloseDate: '2026-08-30',
    notes: 'Preencheu formulário de contato solicitando demonstração simples do plano Starter.',
    tags: ['Lead Novo', 'Starter'],
    activities: []
  },
  {
    id: 'lead-107',
    companyName: 'BuildCorp Construções',
    contactName: 'Marcelo Pires',
    contactEmail: 'mpires@buildcorp.com.br',
    contactPhone: '(47) 99911-2233',
    contactRole: 'Diretor Administrativo',
    companySize: '201-500',
    industry: 'Construção Civil',
    stage: 'lost',
    planInterest: 'Scale',
    mrr: 7500,
    arr: 90000,
    seats: 25,
    probability: 0,
    assignedRep: 'Carlos Andrade',
    assignedRepAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
    source: 'Cold Outreach',
    priority: 'Baixa',
    trialStatus: 'Expired',
    fitScore: 40,
    createdAt: '2026-06-15',
    updatedAt: '2026-07-20',
    expectedCloseDate: '2026-07-20',
    notes: 'Perdido por falta de orçamento no ano atual. Solicitaram retorno no primeiro trimestre de 2027.',
    tags: ['Sem Orçamento Q3', 'Nutrir para 2027'],
    activities: []
  }
];
