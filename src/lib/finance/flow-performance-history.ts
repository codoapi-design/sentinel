/**
 * Flow Performance cumulative series — Inflow / Outflow / Net Flow / Volume
 * from filtered table rows (Asset Details / Client Details, DB-synced wallet data).
 * Reuses relationship history bucketing; aliases revenue→inflow, expense→outflow.
 */

import {
  buildRelationshipHistory,
  type RelationshipTxInput,
  type BuildRelationshipHistoryOptions,
} from '@/lib/finance/client-relationship-history';

export type FlowPerfTxInput = RelationshipTxInput;

export interface FlowPerfPoint {
  /** ISO date (YYYY-MM-DD) or hourly ISO datetime */
  date: string;
  /** Cumulative revenue-type USD */
  inflow: number;
  /** Cumulative expense-type USD */
  outflow: number;
  /** Cumulative net (inflow − outflow) */
  netFlow: number;
  /** Cumulative |value| volume */
  volume: number;
}

export interface FlowPerfResult {
  points: FlowPerfPoint[];
  periodInflow: number;
  periodOutflow: number;
  periodNet: number;
  periodVolume: number;
  days: number;
  bucket: 'hour' | 'day';
  contributingTxCount: number;
  volumeTxCount: number;
  volumeOnly: boolean;
  methodology: string;
}

const DEFAULT_METHODOLOGY =
  'Based on filtered table txs from synced DB · cumulative Inflow / Outflow / Net / Volume · period-relative';

/**
 * Build cumulative Inflow / Outflow / Net Flow / Volume for flow performance charts.
 */
export function buildFlowPerformanceHistory(
  txs: FlowPerfTxInput[],
  options: BuildRelationshipHistoryOptions = { days: 30 },
): FlowPerfResult {
  const history = buildRelationshipHistory(txs, {
    ...options,
    methodology: options.methodology ?? DEFAULT_METHODOLOGY,
  });

  return {
    points: history.points.map(p => ({
      date: p.date,
      inflow: p.revenue,
      outflow: p.expense,
      netFlow: p.netFlow,
      volume: p.volume,
    })),
    periodInflow: history.periodRevenue,
    periodOutflow: history.periodExpense,
    periodNet: history.periodNet,
    periodVolume: history.periodVolume,
    days: history.days,
    bucket: history.bucket,
    contributingTxCount: history.contributingTxCount,
    volumeTxCount: history.volumeTxCount,
    volumeOnly: history.volumeOnly,
    methodology: history.methodology,
  };
}
