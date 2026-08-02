import type { IntelligenceQualityConfig } from './config';
import { getIqConfig } from './config';
import type { PriorityScore } from './types';
import type { CandidateFinding } from './types';
import type { RelevanceContext } from './ranking';

/**
 * Diversity-aware final selection. Does not fill slots with empty limitations.
 */
export function selectInsights(input: {
  ranked: Array<{ candidate: CandidateFinding; priority: PriorityScore }>;
  context: RelevanceContext;
  config?: IntelligenceQualityConfig;
}): string[] {
  const cfg = getIqConfig(input.config);
  const max =
    input.context === 'chat'
      ? cfg.maximumPrimaryInsights.chat
      : input.context === 'report'
        ? cfg.maximumPrimaryInsights.report
        : cfg.maximumPrimaryInsights.dashboard;

  const selected: string[] = [];
  const categoryCounts = new Map<string, number>();
  const selectedTypes = new Set<string>();

  for (const row of input.ranked) {
    if (selected.length >= max) break;
    const cat = row.candidate.category;
    const count = categoryCounts.get(cat) ?? 0;
    // Prefer diversity: max 2 per category unless report
    if (input.context !== 'report' && count >= 2) continue;
    // Residual net-flow cards are redundant once a one-time material transfer is primary.
    if (
      row.candidate.type === 'net_capital_movement' &&
      (selectedTypes.has('one_time_material_event') ||
        input.ranked.some(
          r =>
            r.candidate.type === 'one_time_material_event' &&
            r.candidate.eligibility.eligible &&
            r.priority.score >= row.priority.score,
        ))
    ) {
      continue;
    }
    selected.push(row.candidate.id);
    categoryCounts.set(cat, count + 1);
    selectedTypes.add(row.candidate.type);
  }

  // Ensure at least one performance/allocation/risk mix on dashboard when available
  if (input.context === 'dashboard' && selected.length < max) {
    for (const preferred of ['performance', 'allocation', 'flow', 'risk'] as const) {
      if (selected.length >= max) break;
      const hit = input.ranked.find(
        r => r.candidate.category === preferred && !selected.includes(r.candidate.id),
      );
      if (hit) selected.push(hit.candidate.id);
    }
  }

  return selected;
}
