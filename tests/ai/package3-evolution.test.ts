import { beforeEach, describe, expect, it } from 'vitest';

import {
  attributeEvolution,
  computeIntelligenceEvolution,
  resetMemoryStoreForTests,
  type PersistedInsightSnapshot,
} from '@/lib/ai/memory';

function snapshots(values: Array<Record<string, number>>): PersistedInsightSnapshot[] {
  return values.map((observedValues, index) => ({
    snapshotId: `snapshot-${index}`, analysisId: `analysis-${index}`, lifecycleKey: 'lifecycle-1',
    findingId: 'finding-1', findingType: 'risk', category: 'risk', entityRefs: [],
    priorityScore: 0.5, priorityLevel: 'medium', materialityScore: 0.5, significanceScore: 0.5,
    confidence: { score: 0.8, level: 'high', components: { dataCompleteness: 80, pricingCoverage: 80, historicalCoverage: 80, classificationReliability: 80, sampleAdequacy: 80 }, reasons: [] },
    evidenceIds: [], limitations: [], observedValues, selected: true, eligibleButNotSelected: false,
    createdAt: `2026-08-0${index + 1}T00:00:00.000Z`,
  }));
}

beforeEach(() => {
  resetMemoryStoreForTests();
});

describe('Package 3 intelligence evolution', () => {
  it('detects SOL allocation 55 → 48 → 42 as improving', () => {
    const result = computeIntelligenceEvolution({
      lifecycleKey: 'sol-allocation',
      observations: [{ value: 55 }, { value: 48 }, { value: 42 }],
    });
    expect(result.state).toBe('improving_trend');
    expect(result.changeRate).toBeGreaterThan(0);
  });

  it('detects accelerating fee deterioration', () => {
    const result = computeIntelligenceEvolution({
      lifecycleKey: 'fees',
      observations: [{ value: 1.1, metric: 'fees' }, { value: 1.8, metric: 'fees' }, { value: 2.9, metric: 'fees' }],
    });
    expect(result.state).toBe('worsening_trend');
    expect(result.acceleration).toBeLessThan(0);
  });

  it('detects a positive reversal', () => {
    expect(computeIntelligenceEvolution({
      lifecycleKey: 'risk', observations: [{ value: 50 }, { value: 60 }, { value: 45 }],
    }).state).toBe('reversal_positive');
  });

  it('detects volatility', () => {
    expect(computeIntelligenceEvolution({
      lifecycleKey: 'risk', observations: [{ value: 50 }, { value: 60 }, { value: 45 }, { value: 57 }],
    }).state).toBe('volatile');
  });

  it('detects a stable trend', () => {
    expect(computeIntelligenceEvolution({
      lifecycleKey: 'risk', observations: [{ value: 50 }, { value: 50.1 }, { value: 50 }],
    }).state).toBe('stable_trend');
  });

  it('labels fewer than three observations as insufficient history', () => {
    const result = computeIntelligenceEvolution({
      lifecycleKey: 'risk', observations: [{ value: 50 }, { value: 45 }],
    });
    expect(result.state).toBe('insufficient_history');
    expect(result.transitionNote).toContain('single');
  });

  it('does not invent an attribution driver', () => {
    const evolution = computeIntelligenceEvolution({
      lifecycleKey: 'risk', observations: [{ value: 50 }, { value: 45 }, { value: 40 }],
    });
    expect(attributeEvolution({ evolution, snapshots: snapshots([{ opaque: 1 }, { opaque: 2 }]) }).mainDrivers).toEqual([{
      signal: 'unknown',
      description: 'Trend is observed, but its driver cannot be determined from available evidence.',
    }]);
  });
});
