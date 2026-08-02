import type { ConfidenceScore as CS } from '@/lib/ai/trust/types';

import { scoreConfidence, minConfidence } from './confidence-util';
import type {
  ApprovedInsight,
  AssetValueAttribution,
  ReasoningConfidence,
  ReasoningResult,
} from './types';

/**
 * Downstream confidence cannot exceed the weakest required upstream component.
 */
export function propagateInsightConfidence(input: {
  observationConfidence: CS;
  attributionConfidence?: CS | null;
  causal: ReasoningResult;
  sampleScore: number;
}): ReasoningConfidence {
  const causalConf = input.causal.confidence;
  const attr = input.attributionConfidence ?? scoreConfidence({ sample: 50, historical: 50 });

  const interpretation = minConfidence(
    input.observationConfidence,
    attr,
    causalConf,
    scoreConfidence({ sample: input.sampleScore * 100 }),
  );

  return {
    observationConfidence: input.observationConfidence,
    causalConfidence: minConfidence(causalConf, attr),
    interpretationConfidence: interpretation,
  };
}

export function whatMattersConfidence(insights: ApprovedInsight[]): CS {
  if (insights.length === 0) {
    return scoreConfidence({ sample: 20, reasons: ['no approved insights'] });
  }
  return insights
    .map(i => i.reasoningConfidence.interpretationConfidence)
    .reduce((a, b) => (a.score <= b.score ? a : b));
}

export function attributionConfidenceFromAsset(attr?: AssetValueAttribution | null): CS {
  if (!attr) return scoreConfidence({ historical: 30, pricing: 30, sample: 30 });
  return attr.confidence;
}

/** Enforce: approved insight interpretation confidence ≤ min(obs, causal, attr). */
export function assertConfidenceOrdering(insight: ApprovedInsight): string[] {
  const issues: string[] = [];
  const rc = insight.reasoningConfidence;
  const ceiling = Math.min(
    rc.observationConfidence.score,
    rc.causalConfidence.score,
  );
  if (rc.interpretationConfidence.score > ceiling + 1e-6) {
    issues.push(
      `interpretation ${rc.interpretationConfidence.score} exceeds upstream ceiling ${ceiling}`,
    );
  }
  return issues;
}

export function applyPropagatedConfidence(
  insight: ApprovedInsight,
  attributionConfidence?: CS | null,
): ApprovedInsight {
  const rc = propagateInsightConfidence({
    observationConfidence: insight.confidence,
    attributionConfidence,
    causal: insight.reasoning,
    sampleScore: insight.sample.score,
  });
  return { ...insight, reasoningConfidence: rc };
}
