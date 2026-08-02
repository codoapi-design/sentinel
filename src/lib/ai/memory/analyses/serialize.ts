import type { ApprovedInsight, ReasonedIntelligencePackage } from '@/lib/ai/intelligence-quality/types';
import type { AnalysisScope } from '@/lib/ai/trust/types';

import { MEMORY_MODEL_VERSIONS } from '../config';
import { buildLifecycleKey } from '../lifecycle/identity';
import type { PersistedInsightSnapshot, PersistedReasonedAnalysis } from '../types';

function entityRefsFromInsight(a: ApprovedInsight) {
  return (a.entityIds.length ? a.entityIds : ['portfolio']).map(id => ({
    type: id.toLowerCase() === 'portfolio' ? 'portfolio' : 'asset',
    id,
    symbol: id,
  }));
}

export function toInsightSnapshots(input: {
  analysisId: string;
  walletId: string;
  pkg: ReasonedIntelligencePackage;
  nowIso: string;
}): PersistedInsightSnapshot[] {
  const selected = new Set(input.pkg.selectedInsightIds);
  const out: PersistedInsightSnapshot[] = [];

  for (const a of input.pkg.approvedInsights) {
    const refs = entityRefsFromInsight(a);
    const lifecycleKey = buildLifecycleKey({
      walletId: input.walletId,
      analysisLevel: 'wallet',
      findingType: a.type,
      category: a.category,
      entityRefs: refs,
    });
    out.push({
      snapshotId: `snap:${input.analysisId}:${a.id}`,
      analysisId: input.analysisId,
      lifecycleKey,
      findingId: a.id,
      findingType: a.type,
      category: a.category,
      entityRefs: refs,
      priorityScore: a.priority.score,
      priorityLevel: a.priority.level,
      materialityScore: a.materiality.score,
      significanceScore: a.significance.score,
      confidence: a.confidence,
      reasoningConfidence: a.reasoningConfidence,
      evidenceIds: a.evidenceIds,
      limitations: a.limitations,
      observedValues: {
        impactHint: a.materiality.components.impactUsd,
        allocationPp: a.materiality.components.allocationImpactPp,
      },
      selected: selected.has(a.id),
      eligibleButNotSelected: !selected.has(a.id),
      createdAt: input.nowIso,
    });
  }

  // Eligible-but-suppressed-for-ranking: use diagnostics candidates still eligible
  for (const c of input.pkg.candidateFindings) {
    if (!c.eligibility.eligible) continue;
    if (input.pkg.approvedInsights.some(a => a.id === c.id)) continue;
    const refs = (c.entityIds.length ? c.entityIds : ['portfolio']).map(id => ({
      type: id.toLowerCase() === 'portfolio' ? 'portfolio' : 'asset',
      id,
      symbol: id,
    }));
    const lifecycleKey = buildLifecycleKey({
      walletId: input.walletId,
      analysisLevel: 'wallet',
      findingType: c.type,
      category: c.category,
      entityRefs: refs,
    });
    out.push({
      snapshotId: `snap:${input.analysisId}:${c.id}`,
      analysisId: input.analysisId,
      lifecycleKey,
      findingId: c.id,
      findingType: c.type,
      category: c.category,
      entityRefs: refs,
      priorityScore: 0,
      priorityLevel: 'informational',
      materialityScore: c.materiality.score,
      significanceScore: c.significance.score,
      confidence: c.confidence,
      evidenceIds: c.evidenceIds,
      limitations: [],
      observedValues: {},
      selected: false,
      eligibleButNotSelected: true,
      createdAt: input.nowIso,
    });
  }

  return out;
}

export function buildPersistedAnalysis(input: {
  id: string;
  userId: string;
  walletId: string;
  analysisType: string;
  scope: AnalysisScope;
  pkg: ReasonedIntelligencePackage;
  fingerprint: string;
  traceId: string;
  pipelineVersion: string;
  responseSchemaVersion: string;
  conversationId?: string | null;
  parentAnalysisId?: string | null;
  jobId?: string | null;
  nowIso: string;
}): PersistedReasonedAnalysis {
  const snapshots = toInsightSnapshots({
    analysisId: input.id,
    walletId: input.walletId,
    pkg: input.pkg,
    nowIso: input.nowIso,
  });

  return {
    id: input.id,
    userId: input.userId,
    walletId: input.walletId,
    conversationId: input.conversationId ?? null,
    parentAnalysisId: input.parentAnalysisId ?? null,
    jobId: input.jobId ?? null,
    analysisType: input.analysisType,
    analysisLevel: 'wallet',
    scope: input.scope,
    completionStatus: input.pkg.completionStatus,
    whatMatters: input.pkg.whatMatters,
    approvedInsights: snapshots,
    monitoringPoints: input.pkg.monitoringPoints,
    attribution: input.pkg.attribution,
    domainStatuses: input.pkg.domainStatuses,
    limitations: input.pkg.limitations,
    eligibleFindingKeys: snapshots.map(s => s.lifecycleKey),
    versions: {
      pipelineVersion: input.pipelineVersion,
      responseSchemaVersion: input.responseSchemaVersion,
      reasoningEngine: input.pkg.versions.reasoningEngine,
      eligibilityRules: input.pkg.versions.eligibilityRules,
      rankingModel: input.pkg.versions.rankingModel,
      attributionModel: input.pkg.versions.attributionModel,
      memoryModel: MEMORY_MODEL_VERSIONS.memoryModel,
    },
    dataAsOf: {
      holdings: input.scope.asOf.holdings,
      transactions: input.scope.asOf.transactions,
      prices: input.scope.asOf.pricing,
      snapshots: input.scope.asOf.snapshots,
    },
    fingerprint: input.fingerprint,
    traceId: input.traceId,
    createdAt: input.nowIso,
  };
}
