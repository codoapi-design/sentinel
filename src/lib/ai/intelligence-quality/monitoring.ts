import type { ApprovedInsight, MonitoringPoint } from './types';

export function deriveMonitoringPoints(approved: ApprovedInsight[]): MonitoringPoint[] {
  const points: MonitoringPoint[] = [];

  for (const insight of approved) {
    if (insight.category === 'allocation' || insight.type.includes('concentration')) {
      const current = insight.trigger.observedValue;
      points.push({
        id: `mon:${insight.id}:allocation`,
        relatedFindingId: insight.id,
        metric: 'allocation_pct',
        currentValue: typeof current === 'number' ? current : undefined,
        threshold: typeof current === 'number' ? current + 5 : 60,
        condition: 'increases_above',
        explanation: `Watch whether ${insight.entityIds[0] ?? 'concentration'} rises materially above the current level.`,
      });
    }
    if (insight.category === 'flow' || insight.type === 'one_time_material_event') {
      points.push({
        id: `mon:${insight.id}:flow`,
        relatedFindingId: insight.id,
        metric: 'net_external_flow_usd',
        currentValue: insight.impactUsd ?? undefined,
        condition: 'new_event',
        explanation: 'Watch for a repeat material transfer with the same counterparty.',
      });
    }
    if (insight.novelty.status === 'persistent') {
      points.push({
        id: `mon:${insight.id}:persist`,
        relatedFindingId: insight.id,
        metric: insight.type,
        condition: 'persists',
        explanation: 'Condition has persisted — monitor for resolution or further intensification.',
      });
    }
    if (insight.category === 'performance') {
      points.push({
        id: `mon:${insight.id}:perf`,
        relatedFindingId: insight.id,
        metric: 'portfolio_value_change_usd',
        currentValue: insight.impactUsd ?? undefined,
        condition: 'changes_materially',
        explanation: 'Monitor whether the main performance driver continues to dominate period change.',
      });
    }
  }

  return points.slice(0, 12);
}
