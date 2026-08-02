export type SaaSPlan = 'Starter' | 'Growth' | 'Scale' | 'Enterprise' | string;

export interface PlanConfig {
  id: string;
  name: string;
  pricePerSeat: number;
  description: string;
  minSeats?: number;
  features: string[];
  popular?: boolean;
  color?: string;
}

export type PipelineStageId = 
  | 'inbound'
  | 'qualification'
  | 'demo'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export type LeadSource = 
  | 'Inbound Web'
  | 'LinkedIn Outbound'
  | 'Trial Signup (PLG)'
  | 'Cold Outreach'
  | 'Indicação / Referral'
  | 'Evento / Feira';

export type LeadPriority = 'Alta' | 'Média' | 'Baixa';

export type ActivityType = 'call' | 'email' | 'demo' | 'note' | 'proposal' | 'stage_change';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  author: string;
}

export interface Lead {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactRole: string;
  companySize: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  industry: string;
  stage: PipelineStageId;
  planInterest: SaaSPlan;
  mrr: number; // Em BRL
  arr: number; // Em BRL
  seats: number;
  probability: number; // 0 a 100
  assignedRep: string;
  assignedRepAvatar: string;
  source: LeadSource;
  priority: LeadPriority;
  trialStatus: 'Active' | 'Expiring Soon' | 'Expired' | 'No Trial' | 'Converted';
  trialDaysLeft?: number;
  fitScore?: number; // 0-100
  createdAt: string;
  updatedAt: string;
  expectedCloseDate: string;
  notes: string;
  tags: string[];
  activities: Activity[];
}

export interface PipelineStage {
  id: PipelineStageId;
  title: string;
  description: string;
  color: {
    bg: string;
    border: string;
    badge: string;
    text: string;
  };
  probability: number;
}

export interface SalesRep {
  id: string;
  name: string;
  role: string;
  avatar: string;
  mrrTarget: number;
  currentMrr: number;
  dealsCount: number;
}

export interface AiQualificationResult {
  fitScore: number;
  recommendedPlan: string;
  summary: string;
  topStrengths: string[];
  keyRisks: string[];
  suggestedPitch: string;
  objectionHandlers: {
    objection: string;
    response: string;
  }[];
}

export interface AiEmailResult {
  subject: string;
  body: string;
  callToAction: string;
  proTip: string;
}

export interface AiFunnelInsightsResult {
  pipelineHealthScore: number;
  keyInsights: string[];
  recommendedActions: string[];
  forecastSummary: string;
}
