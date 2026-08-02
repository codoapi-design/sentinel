import type { CandidateFinding, InsightRelationship } from './types';

const CONCENTRATION_TYPES = [
  'extreme_concentration',
  'single_asset_dependency',
  'dominant_asset',
  'high_asset_dependency',
  'concentration_increase',
  'network_concentration',
];

/** Prefer interpretive parent over overlapping child concentration cards. */
const CONCENTRATION_PARENT_PRIORITY: Record<string, number> = {
  high_asset_dependency: 100,
  single_asset_dependency: 95,
  dominant_asset: 90,
  extreme_concentration: 70,
  network_concentration: 65,
  concentration_increase: 50,
};

function isConcentration(c: CandidateFinding): boolean {
  return CONCENTRATION_TYPES.some(t => c.type.includes(t)) || c.type.includes('concentration');
}

function concentrationPriority(type: string): number {
  if (CONCENTRATION_PARENT_PRIORITY[type] != null) return CONCENTRATION_PARENT_PRIORITY[type];
  for (const [key, value] of Object.entries(CONCENTRATION_PARENT_PRIORITY)) {
    if (type.includes(key)) return value;
  }
  return 40;
}

/**
 * Consolidate semantically overlapping findings. Returns survivor ids and duplicate ids.
 */
export function consolidateDuplicates(candidates: CandidateFinding[]): {
  survivors: CandidateFinding[];
  duplicateIds: Set<string>;
  relationships: InsightRelationship[];
} {
  const duplicateIds = new Set<string>();
  const relationships: InsightRelationship[] = [];
  const survivors: CandidateFinding[] = [];

  const groups = new Map<string, CandidateFinding[]>();
  for (const c of candidates) {
    if (!c.eligibility.eligible && c.eligibility.decision !== 'approved') {
      survivors.push(c);
      continue;
    }
    const entity = c.entityIds[0] ?? 'portfolio';
    const key = isConcentration(c) ? `conc:${entity}` : `${c.type}:${entity}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    if (group.length === 1) {
      survivors.push(group[0]);
      continue;
    }
    const sorted = [...group].sort(
      (a, b) =>
        (isConcentration(a) ? concentrationPriority(b.type) - concentrationPriority(a.type) : 0) ||
        b.materiality.score - a.materiality.score ||
        b.confidence.score - a.confidence.score ||
        a.id.localeCompare(b.id),
    );
    const primary = {
      ...sorted[0],
      title: consolidateTitle(sorted),
      proposedMeaning: consolidateMeaning(sorted),
      evidenceIds: [...new Set(sorted.flatMap(g => g.evidenceIds))],
      observationIds: [...new Set(sorted.flatMap(g => g.observationIds))],
    };
    survivors.push(primary);
    for (const child of sorted.slice(1)) {
      duplicateIds.add(child.id);
      // Keep children in the candidate set so eligibility can mark suppressed_duplicate
      // and evidence remains available for diagnostics / parent linkage.
      survivors.push(child);
      relationships.push({
        from: child.id,
        to: primary.id,
        relationship: 'duplicates',
        strength: 0.9,
        evidenceIds: child.evidenceIds.slice(0, 3),
      });
      relationships.push({
        from: primary.id,
        to: child.id,
        relationship: 'supersedes',
        strength: 0.9,
        evidenceIds: [],
      });
    }
  }

  return { survivors, duplicateIds, relationships };
}

function consolidateTitle(group: CandidateFinding[]): string {
  const entity = group[0].entityIds[0] ?? 'Portfolio';
  const share = group
    .map(g => g.trigger.observedValue)
    .find(v => typeof v === 'number');
  if (isConcentration(group[0]) && typeof share === 'number') {
    return `${entity} concentration increased to ${share.toFixed(1)}%, raising portfolio dependence.`;
  }
  return group[0].title;
}

function consolidateMeaning(group: CandidateFinding[]): string {
  const entity = group[0].entityIds[0] ?? 'the asset';
  return `${entity} concentration findings were consolidated from ${group.length} overlapping observations; child evidence remains attached.`;
}
