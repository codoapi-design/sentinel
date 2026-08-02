import { buildConfidenceScore } from '@/lib/ai/trust/confidence';
import type { ConfidenceScore } from '@/lib/ai/trust/types';

export function scoreConfidence(parts: {
  data?: number;
  pricing?: number;
  historical?: number;
  classification?: number;
  sample?: number;
  reasons?: string[];
}): ConfidenceScore {
  return buildConfidenceScore({
    dataCompleteness: parts.data ?? 70,
    pricingCoverage: parts.pricing ?? 70,
    historicalCoverage: parts.historical ?? 50,
    classificationReliability: parts.classification ?? 70,
    sampleAdequacy: parts.sample ?? 50,
    reasons: parts.reasons,
  });
}

export function minConfidence(...scores: ConfidenceScore[]): ConfidenceScore {
  if (scores.length === 0) return scoreConfidence({ sample: 0, reasons: ['no scores'] });
  return scores.reduce((a, b) => (a.score <= b.score ? a : b));
}

export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
