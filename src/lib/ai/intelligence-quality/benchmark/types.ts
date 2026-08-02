/**
 * Package 2 intelligence-quality benchmark contracts.
 */

import type { RelevanceContext } from '../ranking';
import type { EngineOutput } from '@/lib/ai/tools/registry';
import type { AnalysisScope, DomainStatus } from '@/lib/ai/trust/types';

export interface BenchmarkFixture {
  id: string;
  version: string;
  description: string;
  category: 'portfolio' | 'asset' | 'counterparty' | 'trading' | 'risk' | 'flow' | 'mixed';
  analysisPage: RelevanceContext;
  /** Optional chat/user question — overrides page context when set. */
  userQuestion?: string | null;
  walletSizeUsd: number;
  periodDays: number;
  domainStatuses?: DomainStatus[];
  envelopes: EngineOutput[];
  focusAsset?: string | null;
  analysisLevelLabel?: 'wallet' | 'user_portfolio';
  expected: {
    approvedTypes: string[];
    suppressedTypes: string[];
    top3Types: string[];
    /** Types that must NOT appear in top 3. */
    mustNotTop3Types?: string[];
    expectedCauses: Array<'price_effect' | 'quantity_effect' | 'external_inflow' | 'external_outflow' | 'unknown' | string>;
    forbiddenClaims: string[];
    duplicateGroupsExpected?: number;
    unresolvedContradictionsMax?: number;
    attributionReconcileMaxUsd?: number;
    limitationsMustInclude?: string[];
    oneEventDependencyForbidden?: boolean;
    requireWalletLevelLabel?: boolean;
  };
}

export interface IntelligenceBenchmarkResult {
  fixtureId: string;
  expectedApproved: string[];
  actualApproved: string[];
  expectedSuppressed: string[];
  actualSuppressed: string[];
  expectedTop3: string[];
  actualTop3: string[];
  expectedCauses: string[];
  actualCauses: string[];
  forbiddenClaimsDetected: string[];
  duplicateGroupsExpected: number;
  duplicateGroupsActual: number;
  unresolvedContradictions: number;
  attributionReconciliationErrorUsd?: number;
  passed: boolean;
  failures: string[];
}

export interface BenchmarkGlobalMetrics {
  fixtureCount: number;
  candidateCount: number;
  approvedCount: number;
  suppressedCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositivePrimaryInsightRate: number;
  duplicatePrimaryInsightRate: number;
  unresolvedContradictionRate: number;
  unsupportedCausalClaimRate: number;
  forbiddenClaimRate: number;
  top1RelevanceAccuracy: number;
  top3RelevanceAccuracy: number;
  meanRankingAgreement: number;
  attributionReconciliationPassRate: number;
  limitationComplianceRate: number;
  oneEventDependencyFalsePositiveRate: number;
  passedFixtures: number;
  failedFixtures: number;
}

export interface BenchmarkRunReport {
  version: string;
  results: IntelligenceBenchmarkResult[];
  metrics: BenchmarkGlobalMetrics;
  gates: Record<string, { target: number | string; result: number; pass: boolean }>;
  allGatesPassed: boolean;
}

export interface BenchmarkScopeBundle {
  scope: AnalysisScope;
  domainStatuses: DomainStatus[];
}
