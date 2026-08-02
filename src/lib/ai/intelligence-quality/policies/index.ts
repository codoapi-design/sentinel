import type { RelevanceContext } from '../ranking';

export interface DomainPolicy {
  id: string;
  context: RelevanceContext;
  mustEvaluate: string[];
}

export const PORTFOLIO_POLICY: DomainPolicy = {
  id: 'policy.portfolio.v1',
  context: 'portfolio',
  mustEvaluate: [
    'overall_result',
    'contributors_detractors',
    'external_vs_return',
    'concentration',
    'risk_change',
    'activity_change',
    'offsets',
  ],
};

export const ASSET_POLICY: DomainPolicy = {
  id: 'policy.asset.v1',
  context: 'asset',
  mustEvaluate: [
    'value_allocation',
    'contribution',
    'price_vs_quantity',
    'allocation_drift',
    'external_flow',
    'counterparties',
    'relative_performance',
    'risk_contribution',
  ],
};

export const FLOW_POLICY: DomainPolicy = {
  id: 'policy.flow.v1',
  context: 'flow',
  mustEvaluate: [
    'net_external_flow',
    'internal_vs_external',
    'material_sources_destinations',
    'baseline_change',
    'recurrence',
    'one_time_events',
  ],
};

export const TRANSACTION_POLICY: DomainPolicy = {
  id: 'policy.transaction.v1',
  context: 'transaction',
  mustEvaluate: ['what_happened', 'classification', 'direction', 'entities', 'materiality', 'normality'],
};

export const RISK_POLICY: DomainPolicy = {
  id: 'policy.risk.v1',
  context: 'risk',
  mustEvaluate: ['drivers', 'asset_network_contribution', 'direction', 'persistence', 'data_uncertainty'],
};

export const TRADING_POLICY: DomainPolicy = {
  id: 'policy.trading.v1',
  context: 'trading',
  mustEvaluate: ['volume', 'frequency', 'turnover', 'fees', 'rotation', 'baseline', 'net_effect'],
};

export const NETWORK_POLICY: DomainPolicy = {
  id: 'policy.network.v1',
  context: 'network',
  mustEvaluate: ['value_concentration', 'activity_concentration', 'gas', 'flows', 'dependence', 'coverage'],
};

export const COUNTERPARTY_POLICY: DomainPolicy = {
  id: 'policy.counterparty.v1',
  context: 'counterparty',
  mustEvaluate: [
    'materiality',
    'count',
    'recurrence',
    'direction',
    'classification',
    'new_vs_historical',
    'no_single_event_dependency',
  ],
};

export function resolvePolicyContext(sectionType?: string | null): RelevanceContext {
  const s = (sectionType ?? '').toLowerCase();
  if (s.includes('asset')) return 'asset';
  if (s.includes('flow') || s.includes('transaction')) return 'flow';
  if (s.includes('risk')) return 'risk';
  if (s.includes('trad')) return 'trading';
  if (s.includes('network')) return 'network';
  if (s.includes('counterparty') || s.includes('client')) return 'counterparty';
  if (s.includes('portfolio') || s.includes('dashboard') || s.includes('overview')) return 'portfolio';
  return 'dashboard';
}
