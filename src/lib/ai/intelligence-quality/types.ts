/**
 * Package 2 — Intelligence quality / reasoning contracts.
 * Deterministic, versioned, additive to Package 1.
 */

import type {
  AnalysisCompletionStatus,
  AnalysisScope,
  ConfidenceScore,
  DomainStatus,
  FindingTrigger,
} from '@/lib/ai/trust/types';

export const REASONED_INTELLIGENCE_SCHEMA_VERSION = '1.0.0';

export type ObservationEntityType =
  | 'portfolio'
  | 'asset'
  | 'network'
  | 'counterparty'
  | 'transaction'
  | 'period';

export interface AnalyticalObservation {
  id: string;
  type: string;
  engine: string;
  engineVersion: string;
  entity: {
    type: ObservationEntityType;
    id?: string;
    symbol?: string;
    name?: string;
  };
  metric: {
    key: string;
    value: number | string | boolean | null;
    unit?: string;
    comparisonValue?: number | string | null;
    changeValue?: number | null;
    changePct?: number | null;
  };
  scope: AnalysisScope;
  evidenceIds: string[];
  confidence: ConfidenceScore;
  generatedAt: string;
}

export interface SampleAdequacy {
  score: number;
  level: 'insufficient' | 'weak' | 'adequate' | 'strong';
  observations: number;
  requiredObservations: number;
  activeDays?: number;
  requiredActiveDays?: number;
  periodDays: number;
  coverageComplete: boolean;
  reasons: string[];
}

export interface MaterialityScore {
  score: number;
  level: 'immaterial' | 'low' | 'medium' | 'high' | 'critical';
  components: {
    impactUsd: number | null;
    portfolioImpactPct: number | null;
    assetImpactPct: number | null;
    allocationImpactPp: number | null;
    transactionSizeRelativeToPortfolio: number | null;
    recurrenceImpact: number | null;
  };
  reasons: string[];
}

export interface SignificanceScore {
  score: number;
  level: 'normal' | 'notable' | 'significant' | 'exceptional';
  components: {
    historicalDeviation: number;
    periodOverPeriodChange: number;
    baselineDeviation: number;
    persistence: number;
    rarity: number;
  };
  reasons: string[];
}

export interface NoveltyScore {
  score: number;
  status: 'new' | 'recurring' | 'persistent' | 'resolved' | 'unknown';
  firstObservedAt?: string;
  previousOccurrences: number;
  reasons: string[];
}

export type FindingCategory =
  | 'performance'
  | 'allocation'
  | 'flow'
  | 'risk'
  | 'behavior'
  | 'counterparty'
  | 'network'
  | 'data_quality';

export type EligibilityDecision =
  | 'approved'
  | 'suppressed_insufficient_sample'
  | 'suppressed_low_materiality'
  | 'suppressed_duplicate'
  | 'suppressed_low_confidence'
  | 'suppressed_incomplete_scope'
  | 'suppressed_not_meaningful'
  | 'suppressed_normal_behavior'
  | 'suppressed_contradicted';

export interface FindingEligibility {
  eligible: boolean;
  decision: EligibilityDecision;
  reasons: string[];
}

export interface CandidateFinding {
  id: string;
  type: string;
  category: FindingCategory;
  entityIds: string[];
  observationIds: string[];
  evidenceIds: string[];
  proposedMeaning: string;
  trigger: FindingTrigger;
  sample: SampleAdequacy;
  materiality: MaterialityScore;
  significance: SignificanceScore;
  novelty: NoveltyScore;
  confidence: ConfidenceScore;
  eligibility: FindingEligibility;
  /** Legacy engine finding id when derived from one. */
  legacyFindingId?: string;
  title: string;
  description: string;
  impactUsd?: number | null;
  requiredDomains: string[];
}

export type CausalStatus =
  | 'supported'
  | 'partially_supported'
  | 'rejected'
  | 'insufficient_data';

export type CauseType =
  | 'price_effect'
  | 'quantity_effect'
  | 'external_inflow'
  | 'external_outflow'
  | 'asset_rotation'
  | 'fees'
  | 'other_assets_growth'
  | 'network_activity'
  | 'unknown';

export interface CausalHypothesis {
  id: string;
  causeType: CauseType;
  affectedEntityIds: string[];
  estimatedContributionUsd?: number;
  estimatedContributionPct?: number;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  confidence: ConfidenceScore;
  status: CausalStatus;
  languageState: 'confirmed' | 'strongly_supported' | 'likely' | 'possible' | 'cannot_determine';
}

export interface ReasoningResult {
  hypotheses: CausalHypothesis[];
  selectedCauseIds: string[];
  summary: string;
  confidence: ConfidenceScore;
}

export interface ReasoningConfidence {
  observationConfidence: ConfidenceScore;
  causalConfidence: ConfidenceScore;
  interpretationConfidence: ConfidenceScore;
}

export type InsightRelationshipType =
  | 'supports'
  | 'explains'
  | 'causes'
  | 'contributes_to'
  | 'contradicts'
  | 'duplicates'
  | 'supersedes'
  | 'offsets'
  | 'belongs_to';

export interface InsightRelationship {
  from: string;
  to: string;
  relationship: InsightRelationshipType;
  strength: number;
  evidenceIds: string[];
}

export interface PriorityScore {
  score: number;
  level: 'informational' | 'low' | 'medium' | 'high' | 'critical';
  components: {
    materiality: number;
    significance: number;
    confidence: number;
    novelty: number;
    persistence: number;
    userRelevance: number;
    dataQualityPenalty: number;
    duplicationPenalty: number;
  };
  reasons: string[];
}

export interface ApprovedInsight extends CandidateFinding {
  status: 'approved';
  reasoning: ReasoningResult;
  relationships: InsightRelationship[];
  priority: PriorityScore;
  userMeaning: {
    investor?: string;
    trader?: string;
    general?: string;
  };
  monitoringPointIds: string[];
  limitations: string[];
  reasoningConfidence: ReasoningConfidence;
  versions: Record<string, string>;
}

export interface ContributionAttribution {
  totalChangeUsd: number;
  contributors: Array<{
    entityId: string;
    entityType: 'asset' | 'network' | 'flow' | 'fees';
    contributionUsd: number;
    contributionPctOfTotalChange: number | null;
    direction: 'positive' | 'negative' | 'neutral';
    confidence: ConfidenceScore;
    evidenceIds: string[];
  }>;
  explainedChangeUsd: number;
  unexplainedChangeUsd: number;
  explainedPct: number;
  externalInflowUsd: number;
  externalOutflowUsd: number;
  feesUsd: number;
  limitations: string[];
  reconcileErrorUsd: number;
}

export interface AssetValueAttribution {
  assetId: string;
  beginningQuantity: number | null;
  endingQuantity: number | null;
  beginningPriceUsd: number | null;
  endingPriceUsd: number | null;
  totalValueChangeUsd: number | null;
  priceEffectUsd: number | null;
  quantityEffectUsd: number | null;
  interactionEffectUsd: number | null;
  pricingCoverage: number;
  confidence: ConfidenceScore;
  limitations: string[];
  formulaVersion: string;
  reconcileErrorUsd: number;
}

export interface AllocationDriftAttribution {
  assetId: string;
  previousAllocationPct: number;
  currentAllocationPct: number;
  driftPp: number;
  drivers: Array<{
    type:
      | 'asset_price'
      | 'asset_quantity'
      | 'other_assets_growth'
      | 'external_flow'
      | 'unpriced_assets'
      | 'unknown';
    contributionPp?: number;
    contributionUsd?: number;
    confidence: ConfidenceScore;
    evidenceIds: string[];
  }>;
  explainedDriftPp: number | null;
  unexplainedDriftPp: number | null;
  limitations: string[];
}

export interface CapitalMovementAttribution {
  analysisLevel: 'individual_wallet' | 'combined_user_portfolio' | 'selected_wallet_group';
  externalInflowUsd: number;
  externalOutflowUsd: number;
  netExternalFlowUsd: number;
  internalTransferUsd: number;
  feesUsd: number;
  swapLegsUsd: number;
  unknownTransferUsd: number;
  limitations: string[];
}

export interface IntelligenceNode {
  id: string;
  type:
    | 'observation'
    | 'finding'
    | 'asset'
    | 'network'
    | 'counterparty'
    | 'risk'
    | 'performance_result';
  data: Record<string, unknown>;
}

export interface IntelligenceEdge {
  from: string;
  to: string;
  relationship:
    | 'supports'
    | 'causes'
    | 'contributes_to'
    | 'contradicts'
    | 'duplicates'
    | 'offsets'
    | 'belongs_to';
  strength: number;
  evidenceIds: string[];
}

export interface ContradictionResult {
  findingA: string;
  findingB: string;
  status:
    | 'contradiction'
    | 'scope_difference'
    | 'period_difference'
    | 'metric_difference'
    | 'compatible'
    | 'superseded';
  resolution: string;
  preferredFindingId?: string;
}

export interface MonitoringPoint {
  id: string;
  relatedFindingId: string;
  metric: string;
  currentValue?: number;
  threshold?: number;
  condition:
    | 'increases_above'
    | 'decreases_below'
    | 'changes_materially'
    | 'new_event'
    | 'persists';
  explanation: string;
}

export interface WhatMattersSummary {
  primaryFindingId: string | null;
  secondaryFindingIds: string[];
  headline: string;
  whatChanged: string;
  whyItMatters: string;
  mainCause?: string;
  mainOffset?: string;
  importantAbsence?: string[];
}

export interface BehaviorAssessment {
  profile: string;
  confidence: ConfidenceScore;
  period: { from: string; to: string };
  indicators: Array<{
    metric: string;
    observedValue: number;
    baselineValue?: number;
    evidenceIds: string[];
  }>;
  status: 'stable' | 'changing' | 'insufficient_history';
  limitations: string[];
}

export interface ReasoningDiagnostics {
  candidateCount: number;
  approvedCount: number;
  suppressedCount: number;
  suppressionReasons: Record<string, number>;
}

export interface ReasonedIntelligencePackage {
  schemaVersion: string;
  scope: AnalysisScope;
  domainStatuses: DomainStatus[];
  observations: AnalyticalObservation[];
  candidateFindings: CandidateFinding[];
  approvedInsights: ApprovedInsight[];
  graph: {
    nodes: IntelligenceNode[];
    edges: IntelligenceEdge[];
  };
  attribution: {
    portfolio?: ContributionAttribution;
    assets?: AssetValueAttribution[];
    allocationDrift?: AllocationDriftAttribution[];
    capitalFlow?: CapitalMovementAttribution;
  };
  contradictions: ContradictionResult[];
  rankedInsightIds: string[];
  selectedInsightIds: string[];
  whatMatters: WhatMattersSummary;
  monitoringPoints: MonitoringPoint[];
  behavior?: BehaviorAssessment[];
  completionStatus: AnalysisCompletionStatus;
  limitations: string[];
  versions: {
    reasoningEngine: string;
    eligibilityRules: string;
    materialityModel: string;
    significanceModel: string;
    rankingModel: string;
    attributionModel: string;
    behaviorModel: string;
  };
  timingsMs?: Record<string, number>;
  diagnostics?: ReasoningDiagnostics;
}

/** Public API subset — no full candidate dump. */
export interface PublicReasonedIntelligence {
  schemaVersion: string;
  approvedInsights: Array<{
    id: string;
    type: string;
    category: FindingCategory;
    title: string;
    description: string;
    proposedMeaning: string;
    priority: PriorityScore;
    materiality: MaterialityScore;
    significance: SignificanceScore;
    novelty: NoveltyScore;
    eligibility: FindingEligibility;
    reasoning: ReasoningResult;
    userMeaning: ApprovedInsight['userMeaning'];
    monitoringPointIds: string[];
    limitations: string[];
    reasoningConfidence: ReasoningConfidence;
    legacyFindingId?: string;
  }>;
  rankedInsightIds: string[];
  selectedInsightIds: string[];
  whatMatters: WhatMattersSummary;
  monitoringPoints: MonitoringPoint[];
  contradictions: ContradictionResult[];
  attribution: ReasonedIntelligencePackage['attribution'];
  completionStatus: AnalysisCompletionStatus;
  limitations: string[];
  versions: ReasonedIntelligencePackage['versions'];
  /** Present only when debug / authorized diagnostics requested. */
  diagnostics?: ReasoningDiagnostics;
}
