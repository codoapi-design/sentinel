/**
 * Domain availability + analysis eligibility matrix.
 */

import type { AnalysisCompletionStatus, DataDomain, DomainStatus } from './types';

export function domain(
  name: DataDomain,
  status: DomainStatus['status'],
  extras: Partial<Omit<DomainStatus, 'domain' | 'status'>> = {},
): DomainStatus {
  return {
    domain: name,
    status,
    notes: extras.notes ?? [],
    asOf: extras.asOf,
    completeness: extras.completeness,
    recordsProcessed: extras.recordsProcessed,
    errorCode: extras.errorCode,
  };
}

export interface Eligibility {
  allowHoldings: boolean;
  allowAllocation: boolean;
  allowFlow: boolean;
  allowCounterparty: boolean;
  allowHistoricalTimeline: boolean;
  allowUsdPerformance: boolean;
  allowInvestmentReturn: boolean;
  prohibitedFindingCategories: string[];
  limitations: string[];
}

export function evaluateEligibility(statuses: DomainStatus[]): Eligibility {
  const by = new Map(statuses.map(s => [s.domain, s]));
  const holdings = by.get('holdings');
  const txs = by.get('transactions');
  const snaps = by.get('snapshots');
  const pricing = by.get('pricing');
  const ir = by.get('investment_return');

  const holdingsOk = holdings?.status === 'available' || holdings?.status === 'partial';
  const txsOk = txs?.status === 'available';
  const txsPartial = txs?.status === 'partial';
  const txsFailed = txs?.status === 'unavailable' && Boolean(txs.errorCode);
  const snapsOk = snaps?.status === 'available' || snaps?.status === 'partial';
  const pricingOk = pricing?.status === 'available';
  const pricingPartial = pricing?.status === 'partial';
  const irOk = ir?.status === 'available' || ir?.status === 'partial';

  const prohibited: string[] = [];
  const limitations: string[] = [];

  if (!holdingsOk) {
    prohibited.push('allocation', 'holdings');
    limitations.push('Holdings data is unavailable; allocation findings are prohibited.');
  }
  if (txsFailed || txs?.status === 'unavailable') {
    prohibited.push('flow', 'counterparty', 'trading', 'transaction_behavior');
    limitations.push('Transaction retrieval failed or was unavailable; flow and counterparty findings are prohibited.');
  } else if (txsPartial) {
    prohibited.push('full_history_flow');
    limitations.push('Transaction coverage is partial; full-history flow conclusions are prohibited.');
  }
  if (!snapsOk) {
    prohibited.push('historical_allocation', 'portfolio_timeline');
    limitations.push('Portfolio snapshots are unavailable; historical allocation drift is prohibited.');
  }
  if (!pricingOk) {
    if (pricingPartial) {
      limitations.push('Pricing is partial; USD totals are marked partial.');
      prohibited.push('total_usd_performance');
    } else if (pricing?.status === 'unavailable') {
      prohibited.push('usd_performance', 'total_usd_performance');
      limitations.push('Pricing is unavailable; USD performance conclusions are prohibited.');
    }
  }
  if (!irOk) {
    prohibited.push('cost_basis', 'investment_return');
    limitations.push('Investment-return lots are unavailable; cost basis must not be inferred from portfolio value change.');
  }

  return {
    allowHoldings: holdingsOk,
    allowAllocation: holdingsOk,
    allowFlow: txsOk || txsPartial,
    allowCounterparty: txsOk || txsPartial,
    allowHistoricalTimeline: snapsOk,
    allowUsdPerformance: pricingOk,
    allowInvestmentReturn: irOk,
    prohibitedFindingCategories: prohibited,
    limitations,
  };
}

export function deriveCompletionStatus(args: {
  domainStatuses: DomainStatus[];
  pending?: boolean;
  failed?: boolean;
}): AnalysisCompletionStatus {
  if (args.failed) return 'failed';
  if (args.pending) return 'pending';

  const required = args.domainStatuses.filter(d => d.status !== 'not_required');
  if (required.length === 0) return 'insufficient_data';

  const anyUnavailable = required.some(d => d.status === 'unavailable');
  const anyPartial = required.some(d => d.status === 'partial');
  const anyAvailable = required.some(d => d.status === 'available' || d.status === 'partial');

  if (!anyAvailable) return 'insufficient_data';
  if (anyUnavailable || anyPartial) return 'partial';
  return 'complete';
}

/** Filter engine findings that violate the eligibility matrix. */
export function filterProhibitedFindings<T extends { type?: string; category?: string | null; id?: string }>(
  findings: T[],
  eligibility: Eligibility,
): T[] {
  if (eligibility.prohibitedFindingCategories.length === 0) return findings;
  const banned = new Set(eligibility.prohibitedFindingCategories.map(s => s.toLowerCase()));

  return findings.filter(f => {
    const hay = `${f.type ?? ''} ${f.category ?? ''} ${f.id ?? ''}`.toLowerCase();
    for (const b of banned) {
      if (hay.includes(b.replace(/_/g, '')) || hay.includes(b)) return false;
    }
    // Explicit category checks
    if (banned.has('flow') && /flow|inflow|outflow|net_flow/.test(hay)) return false;
    if (banned.has('counterparty') && /counterparty|counterpart/.test(hay)) return false;
    if (banned.has('allocation') && /allocation|concentration|holding/.test(hay)) return false;
    if (banned.has('investment_return') && /investment_return|cost_basis|roi|realized/.test(hay)) {
      return false;
    }
    return true;
  });
}
