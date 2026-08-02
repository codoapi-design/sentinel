import { scoreConfidence } from '@/lib/ai/intelligence-quality/confidence-util';

import type {
  AnalysisComparison,
  ConclusionChangeExplanation,
  HistoricalWhatMatters,
  InsightLifecycleRecord,
  PersistedReasonedAnalysis,
} from '../types';

export function analysesCompatible(
  current: PersistedReasonedAnalysis,
  previous: PersistedReasonedAnalysis,
): { ok: boolean; limitations: string[] } {
  const limitations: string[] = [];
  if (current.walletId !== previous.walletId) {
    return { ok: false, limitations: ['Different wallets.'] };
  }
  if (current.analysisLevel !== previous.analysisLevel) {
    limitations.push('Analysis level differs.');
    return { ok: false, limitations };
  }
  if (current.analysisType !== previous.analysisType) {
    limitations.push('Analysis type differs — comparison labeled approximate.');
  }
  if (current.versions.reasoningEngine !== previous.versions.reasoningEngine) {
    limitations.push('Some differences may result from an updated reasoning model.');
  }
  if (previous.completionStatus === 'partial' || previous.completionStatus === 'insufficient_data') {
    limitations.push('Previous analysis was partial.');
  }
  return { ok: true, limitations };
}

export function buildAnalysisComparison(input: {
  current: PersistedReasonedAnalysis;
  previous?: PersistedReasonedAnalysis | null;
  lifecycles: InsightLifecycleRecord[];
}): AnalysisComparison {
  const byState = (state: string) =>
    input.lifecycles.filter(l => l.state === state).map(l => l.lifecycleKey);

  const whatChanged = input.lifecycles
    .filter(l =>
      ['new', 'worsening', 'improving', 'resolved', 'reopened'].includes(l.state),
    )
    .map(l => ({
      lifecycleKey: l.lifecycleKey,
      changeType: l.state,
      summary: `${l.findingType} is ${l.state}`,
      evidenceIds: [],
      confidence: scoreConfidence({ sample: 65, historical: 60 }),
    }));

  return {
    currentAnalysisId: input.current.id,
    previousAnalysisId: input.previous?.id ?? null,
    newInsightKeys: byState('new'),
    recurringInsightKeys: byState('recurring'),
    worseningInsightKeys: byState('worsening'),
    improvingInsightKeys: byState('improving'),
    stableInsightKeys: byState('stable'),
    resolvedInsightKeys: byState('resolved'),
    reopenedInsightKeys: byState('reopened'),
    supersededInsightKeys: byState('superseded'),
    whatChanged,
    limitations: input.previous
      ? analysesCompatible(input.current, input.previous).limitations
      : ['No previous compatible analysis.'],
  };
}

export function explainConclusionChange(input: {
  current: PersistedReasonedAnalysis;
  previous: PersistedReasonedAnalysis;
}): ConclusionChangeExplanation {
  const reasons: ConclusionChangeExplanation['reasons'] = [];
  const compat = analysesCompatible(input.current, input.previous);
  if (input.current.versions.reasoningEngine !== input.previous.versions.reasoningEngine) {
    reasons.push({
      type: 'model_version_changed',
      description: 'Reasoning engine version changed between analyses.',
      evidenceIds: [],
    });
  }
  if (
    input.previous.completionStatus === 'partial' ||
    input.previous.completionStatus === 'insufficient_data'
  ) {
    reasons.push({
      type: 'previous_partial',
      description: 'Previous analysis was partial or data-limited.',
      evidenceIds: [],
    });
  }
  const curChange = input.current.attribution.portfolio?.totalChangeUsd;
  const prevChange = input.previous.attribution.portfolio?.totalChangeUsd;
  if (
    curChange != null &&
    prevChange != null &&
    Math.abs(curChange - prevChange) > 1
  ) {
    reasons.push({
      type: 'wallet_data_changed',
      description: 'Portfolio change attribution differs from the previous analysis.',
      evidenceIds: [],
    });
  }
  if (input.current.scope.coverage.status !== input.previous.scope.coverage.status) {
    reasons.push({
      type: 'coverage_changed',
      description: 'Data coverage status changed.',
      evidenceIds: [],
    });
  }
  if (reasons.length === 0) {
    reasons.push({
      type: 'wallet_data_changed',
      description: 'Selected insights or materiality shifted versus the previous analysis.',
      evidenceIds: [],
    });
  }
  void compat;
  return {
    previousAnalysisId: input.previous.id,
    currentAnalysisId: input.current.id,
    reasons,
    confidence: scoreConfidence({ sample: 70, historical: 65 }),
  };
}

export function buildHistoricalWhatMatters(input: {
  current: PersistedReasonedAnalysis;
  comparison: AnalysisComparison;
  lifecycles: InsightLifecycleRecord[];
}): HistoricalWhatMatters {
  const persistent = input.lifecycles
    .filter(l => l.state === 'persistent' || l.state === 'recurring')
    .sort((a, b) => b.consecutiveOccurrenceCount - a.consecutiveOccurrenceCount)[0];
  const mostChanged = input.lifecycles
    .filter(l => l.change.materialityDelta != null)
    .sort(
      (a, b) =>
        Math.abs(b.change.materialityDelta ?? 0) - Math.abs(a.change.materialityDelta ?? 0),
    )[0];

  const mainChange =
    input.comparison.whatChanged[0]?.summary ??
    (input.comparison.previousAnalysisId
      ? 'No major lifecycle change since the previous analysis.'
      : 'First persisted analysis for this wallet scope.');

  return {
    current: input.current.whatMatters,
    sincePrevious: input.comparison.previousAnalysisId
      ? {
          mainChange,
          newIssues: input.comparison.newInsightKeys,
          worseningIssues: input.comparison.worseningInsightKeys,
          improvingIssues: input.comparison.improvingInsightKeys,
          resolvedIssues: input.comparison.resolvedInsightKeys,
        }
      : undefined,
    continuity: {
      longestPersistentInsight: persistent?.lifecycleKey,
      mostChangedInsight: mostChanged?.lifecycleKey,
    },
    limitations: input.comparison.limitations,
  };
}
