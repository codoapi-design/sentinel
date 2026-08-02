import type { NoveltyScore } from './types';

/**
 * Novelty / persistence from deterministic historical windows (no conversational memory).
 */
export function scoreNovelty(input: {
  previousOccurrences: number;
  crossedThresholdThisPeriod?: boolean;
  stillAboveThreshold?: boolean;
  previouslyAboveNowBelow?: boolean;
  firstObservedAt?: string;
}): NoveltyScore {
  const reasons: string[] = [];

  if (input.previouslyAboveNowBelow) {
    return {
      score: 0.55,
      status: 'resolved',
      firstObservedAt: input.firstObservedAt,
      previousOccurrences: input.previousOccurrences,
      reasons: ['Condition previously elevated and has declined.'],
    };
  }

  if (input.crossedThresholdThisPeriod && input.previousOccurrences === 0) {
    reasons.push('Threshold crossed for the first time in available history.');
    return {
      score: 0.9,
      status: 'new',
      firstObservedAt: input.firstObservedAt,
      previousOccurrences: 0,
      reasons,
    };
  }

  if (input.stillAboveThreshold && input.previousOccurrences >= 2) {
    reasons.push('Condition remains elevated across multiple windows.');
    return {
      score: 0.7,
      status: 'persistent',
      firstObservedAt: input.firstObservedAt,
      previousOccurrences: input.previousOccurrences,
      reasons,
    };
  }

  if (input.previousOccurrences >= 1) {
    reasons.push('Condition has occurred before in available history.');
    return {
      score: 0.45,
      status: 'recurring',
      firstObservedAt: input.firstObservedAt,
      previousOccurrences: input.previousOccurrences,
      reasons,
    };
  }

  if (input.previousOccurrences === 0 && !input.crossedThresholdThisPeriod) {
    return {
      score: 0.3,
      status: 'unknown',
      previousOccurrences: 0,
      reasons: ['Insufficient historical analytical state to classify novelty.'],
    };
  }

  return {
    score: 0.5,
    status: 'new',
    firstObservedAt: input.firstObservedAt,
    previousOccurrences: input.previousOccurrences,
    reasons: reasons.length ? reasons : ['Treated as new within available windows.'],
  };
}
