import type { Insight } from '@/lib/ai/intelligence';
import {
  aggregateRef,
  calculationRef,
  counterpartyRef,
  positionRef,
  snapshotRef,
  withNativeSourceRefs,
} from '@/lib/ai/intelligence/shared';

/** Mirrors registry attachEngineSourceRefs for unit coverage. */
export function attachNativeViaEnvelope(engine: string, findings: Insight[]): Insight[] {
  return withNativeSourceRefs(findings, engine, insight => {
    const refs = [calculationRef(engine, insight.type)];
    const entity = insight.relatedEntities?.[0];
    if (engine === 'asset' || engine === 'portfolio') {
      if (entity) refs.push(positionRef(entity));
      refs.push(aggregateRef(`${engine}:holdings`, 'asset_positions'));
    } else if (engine === 'flow' || engine === 'trading' || engine === 'network') {
      refs.push(aggregateRef(`${engine}:transactions`, 'transactions'));
    } else if (engine === 'counterparty') {
      if (entity) refs.push(counterpartyRef(entity));
      refs.push(aggregateRef('counterparty:volume', 'transactions'));
    } else if (engine === 'performance') {
      refs.push(aggregateRef('performance:snapshots', 'portfolio_snapshots'));
      if (typeof insight.evidence?.period_start === 'string') {
        refs.push(snapshotRef(String(insight.evidence.period_start)));
      }
    } else if (engine === 'risk') {
      refs.push(positionRef(entity ?? 'portfolio'));
      refs.push(aggregateRef('risk:structure', 'asset_positions'));
    }
    return refs;
  });
}
