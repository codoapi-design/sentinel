/**
 * Package 1 — Trust / correctness contracts.
 * Additive; legacy response fields remain available.
 */

export const PIPELINE_VERSION = '2.0.0';
export const RESPONSE_SCHEMA_VERSION = '2.0.0';
export const STRUCTURED_NARRATIVE_SCHEMA_VERSION = '2.0.0';

export type AnalysisDataSource =
  | 'server_database'
  | 'server_aggregate'
  | 'client_screen'
  | 'hybrid_verified'
  | 'hybrid_unverified';

export type CoverageStatus = 'complete' | 'partial' | 'unavailable' | 'not_required';

export type DataDomain =
  | 'wallet'
  | 'holdings'
  | 'transactions'
  | 'pricing'
  | 'snapshots'
  | 'investment_return'
  | 'trading_volume'
  | 'counterparties';

export type DomainAvailability = 'available' | 'partial' | 'unavailable' | 'not_required';

export type AnalysisCompletionStatus =
  | 'complete'
  | 'partial'
  | 'insufficient_data'
  | 'pending'
  | 'failed';

export interface AnalysisScope {
  walletId: string;
  requestedPeriod: {
    preset?: string;
    from: string;
    to: string;
  };
  entitlementScope: {
    allowedFrom: string | null;
    allowedTo: string | null;
    plan: string;
    limitations: string[];
  };
  entityScope: {
    asset?: string;
    network?: string;
    counterparty?: string;
    transactionType?: string;
  };
  filters: Record<string, unknown>;
  source: AnalysisDataSource;
  coverage: {
    status: CoverageStatus;
    processedRecords?: number;
    matchingRecords?: number;
    isFullEntitledHistory: boolean;
    truncated: boolean;
    truncationReason?: string;
  };
  asOf: {
    holdings?: string;
    transactions?: string;
    pricing?: string;
    snapshots?: string;
  };
}

export interface DomainStatus {
  domain: DataDomain;
  status: DomainAvailability;
  asOf?: string;
  completeness?: number;
  recordsProcessed?: number;
  errorCode?: string;
  notes: string[];
}

export interface EvidenceReference {
  type:
    | 'transaction'
    | 'asset_position'
    | 'portfolio_snapshot'
    | 'price_point'
    | 'counterparty'
    | 'aggregate'
    | 'calculation';
  id?: string;
  hash?: string;
  table?: string;
  timestamp?: string;
}

export interface EvidenceItem {
  evidenceId: string;
  type: string;
  metric: string;
  value: string | number | boolean | null;
  unit?: string;
  comparisonValue?: string | number | null;
  comparisonPeriod?: { from: string; to: string };
  sourceRefs: EvidenceReference[];
  calculation: {
    engine: string;
    engineVersion: string;
    formulaId?: string;
    ruleId?: string;
  };
  scope: AnalysisScope;
}

export interface FindingTrigger {
  ruleId: string;
  observedValue?: number;
  threshold?: number;
  minimumObservations?: number;
  observationsFound?: number;
  /** Comparison operator used by Package 2 eligibility/ranking. */
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  /** Opaque trigger context (e.g. interactionCount) — never shown as a financial number source. */
  context?: Record<string, string | number | boolean | null>;
}

export interface ConfidenceScore {
  score: number;
  level: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  components: {
    dataCompleteness: number;
    pricingCoverage: number;
    historicalCoverage: number;
    classificationReliability: number;
    sampleAdequacy: number;
  };
  reasons: string[];
}

export interface NormalizedFinding {
  id: string;
  type: string;
  engine: string;
  engineVersion: string;
  severity: 'informational' | 'low' | 'medium' | 'high' | 'critical';
  materiality: {
    score: number;
    impactUsd?: number | null;
    portfolioImpactPct?: number | null;
  };
  confidence: ConfidenceScore;
  trigger: FindingTrigger;
  evidenceIds: string[];
  relatedEntityIds: string[];
  limitations: string[];
  generatedAt: string;
  scope: AnalysisScope;
  /** Legacy display fields preserved for UI. */
  title?: string;
  description?: string;
}

export interface StructuredNarrative {
  schemaVersion: string;
  headline: string;
  directAnswer?: string;
  summary: string;
  selectedFindingIds: string[];
  interpretation: string;
  monitoringPoints: string[];
  monitoringPointIds?: string[];
  whatMatters?: {
    whatChanged: string;
    whyItMatters: string;
    mainCause?: string;
    mainOffset?: string;
  };
  limitations: string[];
  language: string;
}

export interface NarrativeValidationReport {
  valid: boolean;
  checkedClaims: number;
  matchedClaims: number;
  unmatchedClaims: Array<{
    text: string;
    normalizedValue?: number;
    reason: string;
  }>;
  correctionsApplied: string[];
}

export interface GroundingReport {
  primarySource: AnalysisDataSource;
  screenContextUsed: boolean;
  screenValuesVerified: boolean;
  discrepancies: Array<{
    field: string;
    clientValue: unknown;
    serverValue: unknown;
    severity: 'info' | 'warning' | 'error';
    note: string;
  }>;
}

export interface DataRequirementsPlan {
  holdings: boolean;
  transactions:
    | { mode: 'none' }
    | {
        mode: 'filtered';
        asset?: string;
        network?: string;
        counterparty?: string;
        from: string;
        to: string;
        /** Soft row budget for sync path; never implies full history when exceeded. */
        maxRows?: number;
      }
    | {
        mode: 'aggregate';
        metrics: string[];
        from: string;
        to: string;
      }
    | {
        mode: 'full_entitled_history';
        processing: 'chunked' | 'async';
      };
  snapshots: boolean;
  clients: boolean;
  pricing: boolean;
  investmentReturn: boolean;
  tradingVolume: boolean;
}

export interface AiVersions {
  pipelineVersion: string;
  responseSchemaVersion: string;
  promptVersion: string;
  engineVersions: Record<string, string>;
}

export interface TraceTimings {
  plannerMs?: number;
  dbMs?: number;
  contextMs?: number;
  enginesMs?: number;
  /** Package 2 reasoning orchestrator. */
  reasoningMs?: number;
  observationsMs?: number;
  eligibilityMs?: number;
  materialityMs?: number;
  attributionMs?: number;
  graphMs?: number;
  contradictionsMs?: number;
  rankingMs?: number;
  selectionMs?: number;
  /** Package 3 memory retrieval + persistence. */
  memoryMs?: number;
  llmMs?: number;
  validationMs?: number;
  totalMs?: number;
}

export interface AiTraceRecord {
  traceId: string;
  requestId: string;
  userId: string;
  walletId: string | null;
  entryPoint: 'analyze' | 'chat';
  mode: string;
  requestedPeriod?: unknown;
  dataRequirementsPlan?: DataRequirementsPlan;
  toolsPlanned: string[];
  toolsExecuted: string[];
  timings: TraceTimings;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number | null;
  fallbackStatus?: string;
  fallbackReason?: string;
  domainStatuses?: DomainStatus[];
  finalConfidence?: unknown;
  completionStatus?: AnalysisCompletionStatus;
  responseStatus: number;
  errorCode?: string;
  createdAt: string;
}

export const ENGINE_VERSIONS: Record<string, string> = {
  performance: '2.0.0',
  flow: '2.0.0',
  portfolio: '2.0.0',
  asset: '2.0.0',
  risk: '2.0.0',
  trading: '2.0.0',
  network: '2.0.0',
  counterparty: '2.0.0',
  anomaly: '2.0.0',
  alert: '2.0.0',
  report: '2.0.0',
};
