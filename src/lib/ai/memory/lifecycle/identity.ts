import type { EntityRef } from '../types';

export function normalizeEntityId(raw?: string | null): string {
  if (!raw) return 'unknown';
  return String(raw).trim().toUpperCase().replace(/[^A-Z0-9:_-]/g, '_').slice(0, 64);
}

export function scopeClassForFinding(findingType: string, category: string): string {
  const t = findingType.toLowerCase();
  if (t.includes('concentration') || t.includes('dependency') || t.includes('dominant') || t.includes('allocation')) {
    return 'allocation_state';
  }
  if (category === 'performance' || t.includes('growth') || t.includes('loss') || t.includes('return')) {
    return 'period_performance';
  }
  if (category === 'flow' || t.includes('inflow') || t.includes('outflow') || t.includes('capital')) {
    return 'flow_pattern';
  }
  if (category === 'behavior' || t.includes('turnover') || t.includes('trading') || t.includes('rotation')) {
    return 'behavior_pattern';
  }
  if (category === 'risk') return 'risk_state';
  if (category === 'counterparty') return 'counterparty_pattern';
  if (category === 'network') return 'network_state';
  return 'general';
}

export function entityTypeForFinding(findingType: string, category: string, refs: EntityRef[]): EntityRef['type'] {
  if (refs[0]?.type) return refs[0].type;
  if (category === 'network' || findingType.includes('network')) return 'network';
  if (category === 'counterparty' || findingType.includes('counterparty')) return 'counterparty';
  if (category === 'behavior' || findingType.includes('turnover') || findingType.includes('trading')) {
    return 'behavior';
  }
  if (refs.some(r => r.symbol && r.symbol.toLowerCase() !== 'portfolio')) return 'asset';
  return 'portfolio';
}

export function buildLifecycleKey(input: {
  walletId: string;
  analysisLevel?: 'wallet' | 'user_portfolio';
  findingType: string;
  category: string;
  entityRefs: EntityRef[];
}): string {
  const level = input.analysisLevel ?? 'wallet';
  const entityType = entityTypeForFinding(input.findingType, input.category, input.entityRefs);
  const entityId = normalizeEntityId(
    input.entityRefs[0]?.symbol ?? input.entityRefs[0]?.id ?? (entityType === 'portfolio' ? 'portfolio' : null),
  );
  const scopeClass = scopeClassForFinding(input.findingType, input.category);
  const type = input.findingType.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `wallet:${input.walletId}:level:${level}:${entityType}:${entityId}:type:${type}:scope:${scopeClass}`;
}

/** Parent concepts that supersede overlapping children. */
export const SUPERSESSION_MAP: Record<string, string[]> = {
  high_asset_dependency: ['extreme_concentration', 'concentration_increase', 'dominant_asset'],
  dominant_asset: ['concentration_increase'],
  extreme_concentration: ['concentration_increase'],
};
