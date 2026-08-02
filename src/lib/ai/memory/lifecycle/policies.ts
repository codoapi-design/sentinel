/**
 * Condition-specific worsening / improving direction.
 * Positive directionScore means "worse" when delta is positive.
 */

export type Direction = 'higher_worse' | 'lower_worse' | 'neutral';

export function directionForFindingType(findingType: string): Direction {
  const t = findingType.toLowerCase();
  if (
    t.includes('concentration') ||
    t.includes('dependency') ||
    t.includes('fees') ||
    t.includes('loss') ||
    t.includes('risk') ||
    t.includes('uncertain') ||
    t.includes('unpriced')
  ) {
    return 'higher_worse';
  }
  if (t.includes('growth') && !t.includes('deposit')) {
    // Positive growth improving when materiality of positive contribution rises is nuanced;
    // treat materiality increase of growth findings as improving (lower_worse inverted).
    return 'lower_worse';
  }
  if (t.includes('return') || t.includes('coverage') && t.includes('pricing')) {
    return 'lower_worse';
  }
  return 'higher_worse';
}

export function classifyScoreMove(input: {
  findingType: string;
  previousMateriality: number;
  currentMateriality: number;
  worsenDelta: number;
  improveDelta: number;
  stableEpsilon: number;
}): 'worsening' | 'improving' | 'stable' {
  const delta = input.currentMateriality - input.previousMateriality;
  if (Math.abs(delta) <= input.stableEpsilon) return 'stable';
  const dir = directionForFindingType(input.findingType);
  if (dir === 'neutral') return 'stable';
  const worse = dir === 'higher_worse' ? delta >= input.worsenDelta : delta <= -input.worsenDelta;
  const better = dir === 'higher_worse' ? delta <= -input.improveDelta : delta >= input.improveDelta;
  if (worse) return 'worsening';
  if (better) return 'improving';
  return 'stable';
}
