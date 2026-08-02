import type { IntelligenceQualityConfig } from './config';
import { getIqConfig, RULE_IDS } from './config';
import type { SignificanceScore } from './types';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Historical significance — distinguishes large-but-normal from small-but-unusual.
 * Returns normal/low scores when baseline is insufficient (no false claims).
 */
export function scoreSignificance(input: {
  changePct?: number | null;
  baselineMeanAbsPct?: number | null;
  historicalOccurrences?: number | null;
  persistenceDays?: number | null;
  periodDays: number;
  baselineAvailable: boolean;
  config?: IntelligenceQualityConfig;
}): SignificanceScore {
  const config = getIqConfig(input.config);
  const t = config.thresholds;
  const reasons: string[] = [`rule:${RULE_IDS.sigBaseline}`];

  if (!input.baselineAvailable) {
    return {
      score: 0.15,
      level: 'normal',
      components: {
        historicalDeviation: 0,
        periodOverPeriodChange: 0,
        baselineDeviation: 0,
        persistence: 0,
        rarity: 0,
      },
      reasons: [...reasons, 'Baseline data insufficient — significance not claimed.'],
    };
  }

  const change = Math.abs(input.changePct ?? 0);
  const baseline = Math.max(0.01, Math.abs(input.baselineMeanAbsPct ?? change));
  const deviation = clamp01(change / (baseline * 3));
  const pop = clamp01(change / 50);
  const persistence = clamp01((input.persistenceDays ?? 0) / Math.max(1, input.periodDays));
  const occ = input.historicalOccurrences ?? 0;
  const rarity = occ <= 1 ? 0.85 : occ <= 3 ? 0.55 : occ <= 8 ? 0.3 : 0.1;

  const score = clamp01(
    (config.significanceWeights.historicalDeviation ?? 0.25) * deviation +
      (config.significanceWeights.periodOverPeriodChange ?? 0.25) * pop +
      (config.significanceWeights.baselineDeviation ?? 0.2) * deviation +
      (config.significanceWeights.persistence ?? 0.15) * persistence +
      (config.significanceWeights.rarity ?? 0.15) * rarity,
  );

  reasons.push(`Change ${change.toFixed(2)}% vs baseline scale ${baseline.toFixed(2)}%.`);
  if (persistence > 0.4) reasons.push('Condition shows persistence across the period.');
  if (rarity > 0.5) reasons.push('Event is relatively rare in available history.');

  const level: SignificanceScore['level'] =
    score >= t.significanceExceptional
      ? 'exceptional'
      : score >= t.significanceSignificant
        ? 'significant'
        : score >= t.significanceNotable
          ? 'notable'
          : 'normal';

  return {
    score,
    level,
    components: {
      historicalDeviation: deviation,
      periodOverPeriodChange: pop,
      baselineDeviation: deviation,
      persistence,
      rarity,
    },
    reasons,
  };
}
