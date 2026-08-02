import type { CandidateFinding, ContradictionResult } from './types';

function sameEntity(a: CandidateFinding, b: CandidateFinding): boolean {
  return a.entityIds.some(e => b.entityIds.includes(e));
}

/**
 * Bounded contradiction checks — compare within category/entity groups, not O(n²) all pairs.
 */
export function detectContradictions(candidates: CandidateFinding[]): {
  results: ContradictionResult[];
  rejectedIds: Set<string>;
} {
  const results: ContradictionResult[] = [];
  const rejectedIds = setOf();
  const eligible = candidates.filter(c => c.eligibility.eligible || c.eligibility.decision === 'approved');

  const byEntity = new Map<string, CandidateFinding[]>();
  for (const c of eligible) {
    const key = c.entityIds[0] ?? c.category;
    const list = byEntity.get(key) ?? [];
    list.push(c);
    byEntity.set(key, list);
  }

  for (const group of byEntity.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const result = comparePair(a, b);
        if (result) {
          results.push(result);
          if (result.status === 'contradiction' && result.preferredFindingId) {
            const loser = result.preferredFindingId === a.id ? b.id : a.id;
            rejectedIds.add(loser);
          }
          if (result.status === 'superseded' && result.preferredFindingId) {
            const loser = result.preferredFindingId === a.id ? b.id : a.id;
            rejectedIds.add(loser);
          }
        }
      }
    }
  }

  // Cross-category: low risk vs critical concentration
  const riskLow = eligible.find(
    c => c.category === 'risk' && (c.type.includes('low') || c.title.toLowerCase().includes('low')),
  );
  const concCritical = eligible.find(
    c =>
      (c.category === 'allocation' || c.category === 'risk') &&
      (c.materiality.level === 'critical' || c.type.includes('extreme_concentration') || c.type.includes('dependency')),
  );
  if (riskLow && concCritical && riskLow.id !== concCritical.id) {
    results.push({
      findingA: riskLow.id,
      findingB: concCritical.id,
      status: 'contradiction',
      resolution: 'Concentration risk supersedes a generic low-risk claim.',
      preferredFindingId: concCritical.id,
    });
    rejectedIds.add(riskLow.id);
  }

  // Trading count down vs volume up — compatible
  const countDown = eligible.find(c => c.type.includes('dormancy') || c.type.includes('declin'));
  const volumeUp = eligible.find(c => c.type.includes('increasing_trading') || c.type.includes('high_turnover'));
  if (countDown && volumeUp) {
    results.push({
      findingA: countDown.id,
      findingB: volumeUp.id,
      status: 'compatible',
      resolution: 'Trade count and volume can diverge; both may be retained with scope notes.',
    });
  }

  return { results, rejectedIds };
}

function comparePair(a: CandidateFinding, b: CandidateFinding): ContradictionResult | null {
  if (!sameEntity(a, b) && a.category !== b.category) return null;

  // Duplicate-ish concentration wording
  if (
    a.type.includes('concentration') &&
    b.type.includes('concentration') &&
    sameEntity(a, b)
  ) {
    const preferred = a.materiality.score >= b.materiality.score ? a : b;
    return {
      findingA: a.id,
      findingB: b.id,
      status: 'superseded',
      resolution: 'Overlapping concentration claims — keep higher materiality finding.',
      preferredFindingId: preferred.id,
    };
  }

  // Performance positive vs negative same entity
  const aNeg = (a.impactUsd ?? 0) < 0 || a.type.includes('loss') || a.type.includes('underperform');
  const bNeg = (b.impactUsd ?? 0) < 0 || b.type.includes('loss') || b.type.includes('underperform');
  const aPos = (a.impactUsd ?? 0) > 0 || a.type.includes('growth') || a.type.includes('leader');
  const bPos = (b.impactUsd ?? 0) > 0 || b.type.includes('growth') || b.type.includes('leader');
  if (sameEntity(a, b) && ((aNeg && bPos) || (aPos && bNeg))) {
    return {
      findingA: a.id,
      findingB: b.id,
      status: 'scope_difference',
      resolution: 'Opposite directions may reflect different metrics/periods — keep both only if scopes differ.',
      preferredFindingId: a.materiality.score >= b.materiality.score ? a.id : b.id,
    };
  }

  return null;
}

function setOf(): Set<string> {
  return new Set();
}
