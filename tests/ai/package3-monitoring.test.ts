import { describe, expect, it } from 'vitest';

import {
  buildMonitoringKey,
  resetMemoryStoreForTests,
  resolveMonitoringTransitions,
  type MonitoringPointState,
  type PersistedInsightSnapshot,
} from '@/lib/ai/memory';
import type { MonitoringPoint } from '@/lib/ai/intelligence-quality/types';

const userId = 'user-monitoring';
const walletId = 'wallet-monitoring';
const nowIso = '2026-08-02T00:00:00.000Z';

function point(currentValue = 50): MonitoringPoint {
  return {
    id: 'monitor-1',
    relatedFindingId: 'finding-1',
    metric: 'concentration_pct',
    currentValue,
    threshold: 100,
    condition: 'increases_above',
    explanation: 'Watch concentration.',
  };
}

function snapshot(): PersistedInsightSnapshot {
  return {
    snapshotId: 'snapshot-1', analysisId: 'analysis-1', lifecycleKey: 'lifecycle-1',
    findingId: 'finding-1', findingType: 'concentration', category: 'risk', entityRefs: [],
    priorityScore: 0.5, priorityLevel: 'medium', materialityScore: 0.5, significanceScore: 0.5,
    confidence: { score: 0.8, level: 'high', components: { dataCompleteness: 80, pricingCoverage: 80, historicalCoverage: 80, classificationReliability: 80, sampleAdequacy: 80 }, reasons: [] },
    evidenceIds: [], limitations: [], observedValues: { concentration_pct: 50 },
    selected: true, eligibleButNotSelected: false, createdAt: nowIso,
  };
}

function prior(state: MonitoringPointState['state'], currentValue = 120): MonitoringPointState {
  return {
    id: 'monitor:1', userId, walletId,
    monitoringKey: buildMonitoringKey({ walletId, metric: 'concentration_pct', relatedFindingId: 'finding-1', lifecycleKey: 'lifecycle-1' }),
    lifecycleKey: 'lifecycle-1', analysisId: 'analysis-old', lastAnalysisId: 'analysis-old',
    metric: 'concentration_pct', state, currentValue, threshold: 100, explanation: 'Watch concentration.',
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function resolve(overrides: Partial<Parameters<typeof resolveMonitoringTransitions>[0]> = {}) {
  return resolveMonitoringTransitions({
    userId, walletId, analysisId: 'analysis-1', nowIso, monitoringPoints: [point()],
    presentSnapshots: [snapshot()], previousRecords: [], canEvaluateAbsence: true,
    ...overrides,
  });
}

describe('Package 3 monitoring transitions', () => {
  it('creates an active state for a new monitoring point', () => {
    resetMemoryStoreForTests();
    expect(resolve().upserts[0]?.state).toBe('active');
  });

  it('triggers when a threshold is crossed', () => {
    expect(resolve({ monitoringPoints: [point(120)] }).upserts[0]?.state).toBe('triggered');
  });

  it('marks a favorable non-resolving move as improved', () => {
    expect(resolve({ previousRecords: [prior('active', 60)], monitoringPoints: [point(50)] }).upserts[0]?.state).toBe('improved');
  });

  it('resolves a cleared condition only with evaluable evidence', () => {
    expect(resolve({ previousRecords: [prior('triggered')], monitoringPoints: [point(90)] }).upserts[0]?.state).toBe('resolved');
  });

  it('does not resolve a cleared condition when required domains fail', () => {
    expect(resolve({ previousRecords: [prior('triggered')], monitoringPoints: [point(90)], canEvaluateAbsence: false }).upserts[0]?.state).toBe('improved');
  });

  it('expires invalid monitoring scope', () => {
    expect(resolve({ scopeValid: false }).upserts[0]?.state).toBe('expired');
  });

  it('supersedes monitoring with its lifecycle', () => {
    expect(resolve({
      lifecycleRecords: [{ lifecycleKey: 'lifecycle-1', state: 'superseded' } as never],
    }).upserts[0]?.state).toBe('superseded');
  });

  it('does not transition twice for an idempotent analysis retry', () => {
    const result = resolve({ previousRecords: [{ ...prior('triggered'), lastAnalysisId: 'analysis-1' }] });
    expect(result.upserts).toHaveLength(0);
    expect(result.timelineHints).toHaveLength(0);
  });
});
