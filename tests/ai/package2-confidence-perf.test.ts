import { describe, expect, it } from 'vitest';

import {
  assertConfidenceOrdering,
  getBenchmarkMatrixV1,
  runIntelligenceQuality,
  whatMattersConfidence,
} from '@/lib/ai/intelligence-quality';
import type { AnalysisScope } from '@/lib/ai/trust/types';

const scope: AnalysisScope = {
  walletId: '11111111-1111-4111-8111-111111111111',
  requestedPeriod: { from: '2026-05-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
  entitlementScope: {
    allowedFrom: '2025-08-01T00:00:00.000Z',
    allowedTo: '2026-08-01T00:00:00.000Z',
    plan: 'pro',
    limitations: [],
  },
  entityScope: {},
  filters: {},
  source: 'server_database',
  coverage: { status: 'complete', isFullEntitledHistory: false, truncated: false },
  asOf: {},
};

function runId(id: string) {
  const f = getBenchmarkMatrixV1().find(x => x.id === id)!;
  return runIntelligenceQuality({
    envelopes: f.envelopes,
    scope,
    domainStatuses: f.domainStatuses!,
    evidence: [],
    portfolioValueUsd: f.walletSizeUsd,
    periodDays: f.periodDays,
    context: f.analysisPage,
    includeDiagnostics: true,
    focusAsset: f.focusAsset,
    userQuestion: f.userQuestion,
    analysisLevelLabel: f.analysisLevelLabel ?? 'wallet',
  });
}

describe('Package 2 confidence propagation', () => {
  it('enforces observation → attribution → causal → interpretation ordering', () => {
    const pkg = runId('sol-historical-closure');
    const selected = pkg.approvedInsights.filter(a => pkg.selectedInsightIds.includes(a.id));
    expect(selected.length).toBeGreaterThan(0);
    for (const insight of selected) {
      const issues = assertConfidenceOrdering(insight);
      expect(issues, issues.join('; ')).toEqual([]);
      const rc = insight.reasoningConfidence;
      expect(rc.interpretationConfidence.score).toBeLessThanOrEqual(
        Math.min(rc.observationConfidence.score, rc.causalConfidence.score) + 1e-6,
      );
    }
    const wm = whatMattersConfidence(selected);
    const minInterp = Math.min(...selected.map(s => s.reasoningConfidence.interpretationConfidence.score));
    expect(wm.score).toBeLessThanOrEqual(minInterp + 1e-6);
  });
});

describe('Package 2 performance and repeatability', () => {
  it('repeatability: identical inputs → identical ranking and selection', () => {
    const a = runId('sol-historical-closure');
    const b = runId('sol-historical-closure');
    expect(a.rankedInsightIds).toEqual(b.rankedInsightIds);
    expect(a.selectedInsightIds).toEqual(b.selectedInsightIds);
    expect(a.whatMatters.headline).toEqual(b.whatMatters.headline);
    expect(a.approvedInsights.map(x => x.type)).toEqual(b.approvedInsights.map(x => x.type));
  });

  it('measures stage timings for small / medium / large envelopes', () => {
    const small = runId('cp-one-immaterial');
    const medium = runId('port-balanced');
    const large = runId('sol-historical-closure');
    for (const pkg of [small, medium, large]) {
      expect(pkg.timingsMs).toBeTruthy();
      const t = pkg.timingsMs!;
      expect(t.observations).toBeGreaterThanOrEqual(0);
      expect(t.candidates).toBeGreaterThanOrEqual(0);
      expect(t.eligibility).toBeGreaterThanOrEqual(0);
      expect(t.attribution).toBeGreaterThanOrEqual(0);
      expect(t.total).toBeGreaterThanOrEqual(0);
      // No LLM in reasoning path — total should stay well under 2s for fixture envelopes
      expect(t.total).toBeLessThan(2000);
    }
    // eslint-disable-next-line no-console
    console.log(
      'IQ timings (ms)',
      JSON.stringify({
        small: small.timingsMs,
        medium: medium.timingsMs,
        large: large.timingsMs,
      }),
    );
  });

  it('intent overrides page context for ranking', () => {
    const pkg = runId('intent-overrides-page');
    const primary = pkg.approvedInsights.find(a => a.id === pkg.selectedInsightIds[0]);
    expect(primary?.type).toBe('continuous_growth');
    expect(primary?.entityIds.includes('portfolio') || primary?.category === 'performance').toBe(true);
  });
});
