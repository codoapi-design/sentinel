import type { IntelligenceQualityConfig } from './config';
import { getIqConfig } from './config';
import type { SampleAdequacy } from './types';

export function assessSampleAdequacy(input: {
  kind: string;
  observations: number;
  activeDays?: number;
  periodDays: number;
  coverageComplete: boolean;
  config?: IntelligenceQualityConfig;
}): SampleAdequacy {
  const config = getIqConfig(input.config);
  const requiredObservations =
    config.minimumSamples[input.kind] ?? config.minimumSamples.default ?? 2;
  const requiredActiveDays =
    config.minimumActiveDays[input.kind] ?? config.minimumActiveDays.default ?? 1;

  const reasons: string[] = [];
  let score = 1;

  if (input.observations < requiredObservations) {
    score -= 0.45;
    reasons.push(
      `Only ${input.observations} observation(s); ${requiredObservations} required for ${input.kind}.`,
    );
  }
  if (input.activeDays != null && input.activeDays < requiredActiveDays) {
    score -= 0.25;
    reasons.push(
      `Only ${input.activeDays} active day(s); ${requiredActiveDays} required for ${input.kind}.`,
    );
  }
  if (!input.coverageComplete) {
    score -= 0.15;
    reasons.push('Coverage incomplete for the analyzed scope.');
  }
  if (input.periodDays < 7 && input.kind.includes('behavior')) {
    score -= 0.2;
    reasons.push('Period too short for behavioral pattern confidence.');
  }

  score = Math.max(0, Math.min(1, score));
  const level: SampleAdequacy['level'] =
    score < 0.35 ? 'insufficient' : score < 0.55 ? 'weak' : score < 0.8 ? 'adequate' : 'strong';

  if (reasons.length === 0) reasons.push('Sample meets configured minimums.');

  return {
    score,
    level,
    observations: input.observations,
    requiredObservations,
    activeDays: input.activeDays,
    requiredActiveDays,
    periodDays: input.periodDays,
    coverageComplete: input.coverageComplete,
    reasons,
  };
}
