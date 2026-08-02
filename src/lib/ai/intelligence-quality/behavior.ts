import type { EngineOutput } from '@/lib/ai/tools/registry';
import type { AnalysisScope } from '@/lib/ai/trust/types';

import { MODEL_VERSIONS } from './config';
import { numberOrNull, scoreConfidence } from './confidence-util';
import type { BehaviorAssessment } from './types';

/**
 * Probabilistic behavior assessments — no psychological labels.
 */
export function assessBehavior(input: {
  envelopes: EngineOutput[];
  scope: AnalysisScope;
  periodDays: number;
}): BehaviorAssessment[] {
  const trading = input.envelopes.find(e => e.engine === 'trading');
  const flow = input.envelopes.find(e => e.engine === 'flow');
  const portfolio = input.envelopes.find(e => e.engine === 'portfolio');
  const out: BehaviorAssessment[] = [];

  const txCount =
    numberOrNull(trading?.dataQuality.transactionCount) ??
    numberOrNull(flow?.dataQuality.transactionCount) ??
    0;
  const tradeCount = numberOrNull(trading?.metrics?.tradeCount) ?? numberOrNull(trading?.metrics?.swapCount) ?? 0;
  const stableShare = numberOrNull(portfolio?.metrics?.stablecoinAllocationPct) ?? null;
  const networkCount = numberOrNull(portfolio?.metrics?.networkCount) ?? numberOrNull(trading?.metrics?.networkCount);

  if (input.periodDays < 14 || txCount < 10) {
    out.push({
      profile: 'insufficient_history',
      confidence: scoreConfidence({ sample: 20, historical: 20 }),
      period: { from: input.scope.requestedPeriod.from, to: input.scope.requestedPeriod.to },
      indicators: [{ metric: 'txCount', observedValue: txCount, evidenceIds: [] }],
      status: 'insufficient_history',
      limitations: [`model:${MODEL_VERSIONS.behaviorModel}`, 'Insufficient history for behavior profile.'],
    });
    return out;
  }

  if (tradeCount >= 10) {
    out.push({
      profile: 'active_trader',
      confidence: scoreConfidence({ sample: Math.min(95, tradeCount * 5), classification: 70 }),
      period: { from: input.scope.requestedPeriod.from, to: input.scope.requestedPeriod.to },
      indicators: [{ metric: 'tradeCount', observedValue: tradeCount, evidenceIds: [] }],
      status: 'stable',
      limitations: [`model:${MODEL_VERSIONS.behaviorModel}`],
    });
  } else if (txCount <= 5) {
    out.push({
      profile: 'low_activity_wallet',
      confidence: scoreConfidence({ sample: 60 }),
      period: { from: input.scope.requestedPeriod.from, to: input.scope.requestedPeriod.to },
      indicators: [{ metric: 'txCount', observedValue: txCount, evidenceIds: [] }],
      status: 'stable',
      limitations: [`model:${MODEL_VERSIONS.behaviorModel}`],
    });
  } else {
    out.push({
      profile: 'long_term_holder',
      confidence: scoreConfidence({ sample: 55, historical: 50 }),
      period: { from: input.scope.requestedPeriod.from, to: input.scope.requestedPeriod.to },
      indicators: [
        { metric: 'txCount', observedValue: txCount, evidenceIds: [] },
        { metric: 'tradeCount', observedValue: tradeCount, evidenceIds: [] },
      ],
      status: 'stable',
      limitations: [`model:${MODEL_VERSIONS.behaviorModel}`],
    });
  }

  if (stableShare != null && stableShare >= 40) {
    out.push({
      profile: 'stablecoin_heavy',
      confidence: scoreConfidence({ pricing: 80, sample: 70 }),
      period: { from: input.scope.requestedPeriod.from, to: input.scope.requestedPeriod.to },
      indicators: [{ metric: 'stablecoinAllocationPct', observedValue: stableShare, evidenceIds: [] }],
      status: 'stable',
      limitations: [`model:${MODEL_VERSIONS.behaviorModel}`],
    });
  }

  if (networkCount != null && networkCount >= 3) {
    out.push({
      profile: 'multi_network_user',
      confidence: scoreConfidence({ sample: 65 }),
      period: { from: input.scope.requestedPeriod.from, to: input.scope.requestedPeriod.to },
      indicators: [{ metric: 'networkCount', observedValue: networkCount, evidenceIds: [] }],
      status: 'stable',
      limitations: [`model:${MODEL_VERSIONS.behaviorModel}`],
    });
  }

  return out;
}
