/**
 * Separated confidence model (data / finding / interpretation).
 */

import type { Confidence } from '@/lib/ai/intelligence';

import type { ConfidenceScore, DomainStatus } from './types';

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export function levelFromScore(score: number): ConfidenceScore['level'] {
  if (score >= 90) return 'very_high';
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  if (score >= 35) return 'low';
  return 'very_low';
}

export function toLegacyConfidence(level: ConfidenceScore['level']): Confidence {
  if (level === 'very_high' || level === 'high') return 'high';
  if (level === 'medium') return 'medium';
  return 'low';
}

export function buildConfidenceScore(input: {
  dataCompleteness: number;
  pricingCoverage: number;
  historicalCoverage: number;
  classificationReliability: number;
  sampleAdequacy: number;
  reasons?: string[];
}): ConfidenceScore {
  const components = {
    dataCompleteness: clamp(input.dataCompleteness),
    pricingCoverage: clamp(input.pricingCoverage),
    historicalCoverage: clamp(input.historicalCoverage),
    classificationReliability: clamp(input.classificationReliability),
    sampleAdequacy: clamp(input.sampleAdequacy),
  };

  // Finding confidence is gated by the weakest relevant pillar — never inflate
  // transaction findings from holdings quality alone.
  const score = clamp(
    0.3 * components.dataCompleteness +
      0.2 * components.pricingCoverage +
      0.2 * components.historicalCoverage +
      0.15 * components.classificationReliability +
      0.15 * components.sampleAdequacy,
  );

  return {
    score,
    level: levelFromScore(score),
    components,
    reasons: input.reasons ?? [],
  };
}

export function confidenceForFindingKind(
  kind: 'holdings' | 'flow' | 'counterparty' | 'historical' | 'generic',
  domains: DomainStatus[],
  observationCount = 0,
): ConfidenceScore {
  const by = new Map(domains.map(d => [d.domain, d]));
  const holdings = by.get('holdings');
  const txs = by.get('transactions');
  const pricing = by.get('pricing');
  const snaps = by.get('snapshots');

  const holdingsScore =
    holdings?.status === 'available' ? 90 : holdings?.status === 'partial' ? 60 : 20;
  const txScore =
    txs?.status === 'available' ? 85 : txs?.status === 'partial' ? 45 : txs?.status === 'not_required' ? 50 : 15;
  const priceScore =
    pricing?.status === 'available' ? 90 : pricing?.status === 'partial' ? 50 : 25;
  const histScore =
    snaps?.status === 'available' ? 80 : snaps?.status === 'partial' ? 50 : 20;

  const sample = observationCount <= 0 ? 40 : observationCount === 1 ? 35 : observationCount < 5 ? 55 : 85;

  if (kind === 'holdings') {
    return buildConfidenceScore({
      dataCompleteness: holdingsScore,
      pricingCoverage: priceScore,
      historicalCoverage: 50,
      classificationReliability: 80,
      sampleAdequacy: 80,
      reasons: ['Holdings confidence derived from holdings + pricing domains only.'],
    });
  }

  if (kind === 'flow') {
    return buildConfidenceScore({
      dataCompleteness: txScore,
      pricingCoverage: priceScore,
      historicalCoverage: txs?.status === 'available' ? 80 : 30,
      classificationReliability: 70,
      sampleAdequacy: sample,
      reasons: [
        'Flow confidence ignores holdings quality.',
        txs?.status === 'partial' ? 'Partial transaction coverage caps flow confidence.' : '',
      ].filter(Boolean),
    });
  }

  if (kind === 'counterparty') {
    return buildConfidenceScore({
      dataCompleteness: txScore,
      pricingCoverage: priceScore,
      historicalCoverage: txs?.status === 'available' ? 70 : 25,
      classificationReliability: observationCount >= 3 ? 75 : 40,
      sampleAdequacy: sample,
      reasons: [
        observationCount <= 1
          ? 'A single observation cannot receive high counterparty analytical confidence.'
          : 'Counterparty confidence scales with observation count.',
      ],
    });
  }

  if (kind === 'historical') {
    return buildConfidenceScore({
      dataCompleteness: holdingsScore,
      pricingCoverage: priceScore,
      historicalCoverage: histScore,
      classificationReliability: 70,
      sampleAdequacy: snaps?.recordsProcessed && snaps.recordsProcessed > 7 ? 80 : 40,
      reasons: ['Historical confidence requires snapshot coverage.'],
    });
  }

  return buildConfidenceScore({
    dataCompleteness: Math.min(holdingsScore, txScore),
    pricingCoverage: priceScore,
    historicalCoverage: histScore,
    classificationReliability: 60,
    sampleAdequacy: sample,
  });
}
