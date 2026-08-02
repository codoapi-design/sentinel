import type { IntelligenceQualityConfig } from './config';
import { RULE_IDS, getIqConfig } from './config';
import type { CandidateFinding, PriorityScore } from './types';

export type RelevanceContext =
  | 'dashboard'
  | 'asset'
  | 'portfolio'
  | 'flow'
  | 'risk'
  | 'trading'
  | 'network'
  | 'counterparty'
  | 'transaction'
  | 'chat'
  | 'report';

const CONTEXT_CATEGORY_BOOST: Record<RelevanceContext, Partial<Record<string, number>>> = {
  dashboard: { performance: 0.2, allocation: 0.15, flow: 0.1, risk: 0.1 },
  asset: { allocation: 0.25, performance: 0.2, flow: 0.15, risk: 0.1 },
  portfolio: { performance: 0.25, allocation: 0.2, risk: 0.15 },
  flow: { flow: 0.3, counterparty: 0.15, behavior: 0.1 },
  risk: { risk: 0.35, allocation: 0.2, network: 0.1 },
  trading: { behavior: 0.3, flow: 0.1 },
  network: { network: 0.35, risk: 0.15 },
  counterparty: { counterparty: 0.35, flow: 0.15 },
  transaction: { flow: 0.25, counterparty: 0.2 },
  chat: { performance: 0.15, allocation: 0.15, flow: 0.15, risk: 0.1 },
  report: { performance: 0.15, allocation: 0.15, risk: 0.15, flow: 0.1 },
};

function intentBoost(candidate: CandidateFinding, userQuestion?: string | null): number {
  if (!userQuestion?.trim()) return 0;
  const q = userQuestion.toLowerCase();
  let boost = 0;
  if (
    (q.includes('portfolio') || q.includes('entire') || q.includes('whole')) &&
    (candidate.category === 'performance' || candidate.entityIds.includes('portfolio'))
  ) {
    boost += 0.35;
  }
  if (q.includes('why') && candidate.category === 'performance') boost += 0.1;
  if (
    (q.includes('flow') || q.includes('transfer') || q.includes('deposit')) &&
    candidate.category === 'flow'
  ) {
    boost += 0.25;
  }
  if ((q.includes('risk') || q.includes('concentration')) && candidate.category === 'risk') {
    boost += 0.25;
  }
  // When question is about portfolio, downrank asset-local findings unless also asked
  if (
    (q.includes('portfolio') || q.includes('entire')) &&
    !q.includes((candidate.entityIds[0] ?? '').toLowerCase()) &&
    candidate.entityIds[0] &&
    candidate.entityIds[0] !== 'portfolio' &&
    candidate.category !== 'performance'
  ) {
    boost -= 0.2;
  }
  return boost;
}

export function scorePriority(
  candidate: CandidateFinding,
  context: RelevanceContext,
  duplicationPenalty = 0,
  config?: IntelligenceQualityConfig,
  userQuestion?: string | null,
): PriorityScore {
  const cfg = getIqConfig(config);
  const w = cfg.rankingWeights;
  const boost =
    (CONTEXT_CATEGORY_BOOST[context]?.[candidate.category] ?? 0) + intentBoost(candidate, userQuestion);

  const materiality = candidate.materiality.score;
  const significance = candidate.significance.score;
  const confidence = candidate.confidence.score / 100;
  const novelty =
    candidate.novelty.status === 'new'
      ? 0.9
      : candidate.novelty.status === 'persistent'
        ? 0.7
        : candidate.novelty.score;
  const persistence =
    candidate.novelty.status === 'persistent' ? 0.85 : candidate.significance.components.persistence;
  const userRelevance = Math.max(0, Math.min(1, 0.45 + boost));
  const dataQualityPenalty = candidate.sample.level === 'insufficient'
    ? 0.35
    : candidate.sample.level === 'weak'
      ? 0.2
      : candidate.confidence.level === 'very_low'
        ? 0.25
        : 0.05;

  const raw =
    (w.materiality ?? 0.28) * materiality +
    (w.significance ?? 0.22) * significance +
    (w.confidence ?? 0.15) * confidence +
    (w.novelty ?? 0.12) * novelty +
    (w.persistence ?? 0.08) * persistence +
    (w.userRelevance ?? 0.15) * userRelevance -
    (w.dataQualityPenalty ?? 0.1) * dataQualityPenalty -
    (w.duplicationPenalty ?? 0.08) * duplicationPenalty;

  const score = Math.max(0, Math.min(1, raw));
  const level: PriorityScore['level'] =
    score >= 0.8 ? 'critical' : score >= 0.65 ? 'high' : score >= 0.45 ? 'medium' : score >= 0.25 ? 'low' : 'informational';

  return {
    score,
    level,
    components: {
      materiality,
      significance,
      confidence,
      novelty,
      persistence,
      userRelevance,
      dataQualityPenalty,
      duplicationPenalty,
    },
    reasons: [`rule:${RULE_IDS.rankWeighted}`, `context:${context}`, `category:${candidate.category}`],
  };
}

export function rankCandidates(
  candidates: CandidateFinding[],
  context: RelevanceContext,
  duplicateIds: Set<string>,
  config?: IntelligenceQualityConfig,
  userQuestion?: string | null,
): Array<{ candidate: CandidateFinding; priority: PriorityScore }> {
  // When a portfolio-level question is present, rank under chat/portfolio relevance.
  const effectiveContext: RelevanceContext =
    userQuestion && /portfolio|entire|whole/i.test(userQuestion) ? 'chat' : context;

  return candidates
    .filter(c => c.eligibility.eligible)
    .map(c => ({
      candidate: c,
      priority: scorePriority(
        c,
        effectiveContext,
        duplicateIds.has(c.id) ? 0.8 : 0,
        config,
        userQuestion,
      ),
    }))
    .sort(
      (a, b) =>
        b.priority.score - a.priority.score ||
        b.candidate.materiality.score - a.candidate.materiality.score ||
        a.candidate.id.localeCompare(b.candidate.id),
    );
}
