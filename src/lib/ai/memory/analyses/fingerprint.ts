import { createHash } from 'node:crypto';

import type { AnalysisScope } from '@/lib/ai/trust/types';
import type { ReasonedIntelligencePackage } from '@/lib/ai/intelligence-quality/types';

export function hashStable(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);
}

export function scopeHash(scope: AnalysisScope): string {
  return hashStable([
    scope.walletId,
    scope.requestedPeriod.from,
    scope.requestedPeriod.to,
    scope.coverage.status,
    String(scope.coverage.truncated),
    JSON.stringify(scope.entityScope ?? {}),
    JSON.stringify(scope.filters ?? {}),
  ]);
}

export function dataFingerprintFromPackage(pkg: ReasonedIntelligencePackage): string {
  const keys = [
    ...pkg.selectedInsightIds,
    ...pkg.approvedInsights.map(a => `${a.type}:${a.materiality.score.toFixed(3)}`),
    pkg.whatMatters.headline,
    String(pkg.attribution.portfolio?.totalChangeUsd ?? ''),
  ];
  return hashStable(keys);
}

export function buildAnalysisFingerprint(input: {
  userId: string;
  walletId: string;
  analysisType: string;
  analysisLevel: string;
  scope: AnalysisScope;
  pkg: ReasonedIntelligencePackage;
  pipelineVersion: string;
  reasoningEngine: string;
}): string {
  return hashStable([
    input.userId,
    input.walletId,
    input.analysisType,
    input.analysisLevel,
    scopeHash(input.scope),
    dataFingerprintFromPackage(input.pkg),
    input.pipelineVersion,
    input.reasoningEngine,
  ]);
}

export function shouldPersistAnalysis(input: {
  mode: string;
  completionStatus: string;
  selectedCount: number;
  forcePersist?: boolean;
}): boolean {
  if (input.forcePersist) return true;
  if (input.completionStatus === 'failed' || input.completionStatus === 'insufficient_data') {
    // Allow partial if there are selected insights
    if (input.selectedCount === 0) return false;
  }
  if (input.mode === 'dashboard' || input.mode === 'report') return input.selectedCount > 0;
  if (input.mode === 'chat') return input.selectedCount > 0;
  return input.selectedCount > 0;
}
