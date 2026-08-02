import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildAnalysisComparison,
  buildHistoricalWhatMatters,
  getMemoryStore,
  persistReasonedAnalysis,
  resetMemoryStoreForTests,
} from '@/lib/ai/memory';
import type { ReasonedIntelligencePackage } from '@/lib/ai/intelligence-quality/types';
import type { AnalysisScope } from '@/lib/ai/trust/types';

const fixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'tests/fixtures/ai-memory/v1', name), 'utf8'),
  ) as T;

type AnalysisFixture = {
  userId: string;
  walletId: string;
  analysisType: string;
  a: FixtureFinding;
  b: FixtureFinding;
};

type FixtureFinding = {
  headline: string;
  findingId: string;
  findingType: string;
  category: string;
  entityId: string;
  materiality: number;
  priority: number;
  portfolioChangeUsd: number;
};

const scope: AnalysisScope = {
  walletId: '11111111-1111-4111-8111-111111111111',
  requestedPeriod: { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
  entitlementScope: {
    allowedFrom: '2025-08-01T00:00:00.000Z',
    allowedTo: '2026-08-01T00:00:00.000Z',
    plan: 'pro',
    limitations: [],
  },
  entityScope: {},
  filters: {},
  source: 'server_database',
  coverage: { status: 'complete', isFullEntitledHistory: true, truncated: false },
  asOf: { holdings: '2026-08-01T00:00:00.000Z' },
};

function packageFor(finding: FixtureFinding): ReasonedIntelligencePackage {
  return {
    schemaVersion: '1',
    scope,
    domainStatuses: [{ domain: 'holdings', status: 'available', notes: [] }],
    observations: [],
    candidateFindings: [],
    approvedInsights: [{
      id: finding.findingId,
      type: finding.findingType,
      category: finding.category as never,
      entityIds: [finding.entityId],
      priority: { score: finding.priority, level: 'high', components: {}, reasons: [] },
      materiality: {
        score: finding.materiality,
        level: 'high',
        components: { impactUsd: 0, allocationImpactPp: 0 },
        reasons: [],
      },
      significance: { score: 0.6, level: 'high', reasons: [] },
      confidence: 'high',
      reasoningConfidence: 'high',
      evidenceIds: [],
      limitations: [],
    }],
    graph: { nodes: [], edges: [] },
    attribution: {
      portfolio: {
        totalChangeUsd: finding.portfolioChangeUsd,
        contributors: [],
        explainedChangeUsd: 0,
        unexplainedChangeUsd: 0,
        explainedPct: 0,
        externalInflowUsd: 0,
        externalOutflowUsd: 0,
        feesUsd: 0,
        limitations: [],
        reconcileErrorUsd: 0,
      },
    },
    contradictions: [],
    rankedInsightIds: [finding.findingId],
    selectedInsightIds: [finding.findingId],
    whatMatters: {
      primaryFindingId: finding.findingId,
      secondaryFindingIds: [],
      headline: finding.headline,
      whatChanged: finding.headline,
      whyItMatters: 'A material concentration affects portfolio risk.',
    },
    monitoringPoints: [],
    completionStatus: 'completed',
    limitations: [],
    versions: {
      reasoningEngine: 'reasoning-v1',
      eligibilityRules: 'eligibility-v1',
      materialityModel: 'materiality-v1',
      significanceModel: 'significance-v1',
      rankingModel: 'ranking-v1',
      attributionModel: 'attribution-v1',
      behaviorModel: 'behavior-v1',
    },
  } as unknown as ReasonedIntelligencePackage;
}

beforeEach(() => {
  resetMemoryStoreForTests();
});

describe('Package 3 A→B memory integration', () => {
  it('persists, reuses, transitions, compares, and renders historical what matters', async () => {
    const data = fixture<AnalysisFixture>('analyses-a-to-b.json');
    const first = await persistReasonedAnalysis({
      userId: data.userId,
      walletId: data.walletId,
      mode: 'dashboard',
      analysisType: data.analysisType,
      scope,
      pkg: packageFor(data.a),
      traceId: 'trace-a',
      pipelineVersion: 'pipeline-v1',
      responseSchemaVersion: 'response-v1',
    });
    expect(first?.reused).toBe(false);

    const replay = await persistReasonedAnalysis({
      userId: data.userId,
      walletId: data.walletId,
      mode: 'dashboard',
      analysisType: data.analysisType,
      scope,
      pkg: packageFor(data.a),
      traceId: 'trace-a-replay',
      pipelineVersion: 'pipeline-v1',
      responseSchemaVersion: 'response-v1',
    });
    expect(replay?.reused).toBe(true);
    expect(replay?.analysis.id).toBe(first?.analysis.id);

    const second = await persistReasonedAnalysis({
      userId: data.userId,
      walletId: data.walletId,
      mode: 'dashboard',
      analysisType: data.analysisType,
      scope,
      pkg: packageFor(data.b),
      traceId: 'trace-b',
      pipelineVersion: 'pipeline-v1',
      responseSchemaVersion: 'response-v1',
    });
    expect(second?.reused).toBe(false);

    const lifecycles = await getMemoryStore().listLifecycles(data.userId, data.walletId);
    expect(lifecycles).toHaveLength(1);
    expect(lifecycles[0]?.state).toBe('worsening');
    expect(lifecycles[0]?.occurrenceCount).toBe(2);

    const comparison = buildAnalysisComparison({
      current: second!.analysis,
      previous: first!.analysis,
      lifecycles,
    });
    expect(comparison.worseningInsightKeys).toEqual([lifecycles[0]!.lifecycleKey]);

    const historical = buildHistoricalWhatMatters({
      current: second!.analysis,
      comparison,
      lifecycles,
    });
    expect(historical.current.headline).toBe(data.b.headline);
    expect(historical.sincePrevious?.worseningIssues).toEqual([lifecycles[0]!.lifecycleKey]);
    expect(historical.continuity.mostChangedInsight).toBe(lifecycles[0]!.lifecycleKey);
  });
});
