import type { CandidateFinding, InsightRelationship } from './types';
import type { ContributionAttribution } from './types';

/** Cross-domain relationship edges among eligible findings. */
export function buildCrossDomainRelationships(
  candidates: CandidateFinding[],
  portfolio?: ContributionAttribution,
): InsightRelationship[] {
  const edges: InsightRelationship[] = [];
  const eligible = candidates.filter(c => c.eligibility.eligible);

  const perf = eligible.filter(c => c.category === 'performance');
  const alloc = eligible.filter(c => c.category === 'allocation' || c.category === 'risk');
  const flow = eligible.filter(c => c.category === 'flow');
  const trading = eligible.filter(c => c.category === 'behavior');

  for (const p of perf) {
    for (const a of alloc) {
      if (p.entityIds.some(e => a.entityIds.includes(e))) {
        edges.push({
          from: p.id,
          to: a.id,
          relationship: 'contributes_to',
          strength: 0.7,
          evidenceIds: [...p.evidenceIds.slice(0, 2), ...a.evidenceIds.slice(0, 2)],
        });
      }
    }
  }

  for (const f of flow) {
    for (const a of alloc) {
      if (f.entityIds.some(e => a.entityIds.includes(e))) {
        edges.push({
          from: f.id,
          to: a.id,
          relationship: 'explains',
          strength: 0.65,
          evidenceIds: f.evidenceIds.slice(0, 3),
        });
      }
    }
  }

  for (const t of trading) {
    const fee = eligible.find(c => c.type.includes('fee') || c.entityIds.includes('fees'));
    if (fee) {
      edges.push({
        from: t.id,
        to: fee.id,
        relationship: 'offsets',
        strength: 0.55,
        evidenceIds: [],
      });
    }
  }

  if (portfolio) {
    const neg = portfolio.contributors.find(c => c.direction === 'negative' && c.entityType === 'asset');
    const pos = portfolio.contributors.find(c => c.direction === 'positive' && c.entityType === 'asset');
    if (neg && pos) {
      const negFinding = eligible.find(c => c.entityIds.includes(neg.entityId));
      const posFinding = eligible.find(c => c.entityIds.includes(pos.entityId));
      if (negFinding && posFinding) {
        edges.push({
          from: posFinding.id,
          to: negFinding.id,
          relationship: 'offsets',
          strength: 0.75,
          evidenceIds: [],
        });
      }
    }
  }

  return edges;
}
