/**
 * Cash-flow movement series from classified wallet transactions.
 *
 * Unlike portfolio-history (market revaluation), this aggregates real
 * revenue / expenses / gas / net flow from the transactions table.
 * Cumulative totals are period-relative (start at 0 for the selected window).
 */

import {
  refineTransactionType,
  resolveGasFeeEth,
  resolveTxValueUsd,
  type TxSummaryInput,
} from '@/lib/finance/summary';

export type CashflowMetric = 'revenue' | 'expenses' | 'netFlow' | 'gas';

export interface CashflowHistoryPoint {
  /** ISO date (YYYY-MM-DD) or hourly ISO datetime */
  date: string;
  /** Running cumulative total for the selected period */
  value: number;
  /** Contribution in this bucket only */
  daily: number;
}

export interface CashflowTxInput extends TxSummaryInput {
  timestamp?: number | null;
  date?: string | null;
}

export interface CashflowHistoryResult {
  points: CashflowHistoryPoint[];
  periodTotal: number;
  metric: CashflowMetric;
  days: number;
  bucket: 'hour' | 'day';
  contributingTxCount: number;
  methodology: string;
}

const REVENUE = new Set(['income', 'staking']);
const EXPENSE = new Set(['expense']);

const METRIC_LABEL: Record<CashflowMetric, string> = {
  revenue: 'Revenue (income + staking)',
  expenses: 'Expenses (expense transfers only)',
  netFlow: 'Net Flow (revenue − expenses; gas not deducted)',
  gas: 'Gas fees (USD, all transactions)',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function txTimeMs(tx: CashflowTxInput): number | null {
  if (typeof tx.timestamp === 'number' && Number.isFinite(tx.timestamp) && tx.timestamp > 0) {
    // DB stores unix seconds
    return tx.timestamp < 1e12 ? tx.timestamp * 1000 : tx.timestamp;
  }
  if (typeof tx.date === 'string' && tx.date.length >= 10) {
    const ms = Date.parse(tx.date.length === 10 ? `${tx.date}T12:00:00.000Z` : tx.date);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function hourKey(ms: number): string {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfUtcHour(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
}

/** Daily (or signed) contribution of one tx toward a metric — same rules as computeFinancialSummary. */
export function txMetricContribution(
  tx: CashflowTxInput,
  metric: CashflowMetric,
  ethPriceUsd: number,
): number {
  const type = refineTransactionType({
    type: tx.type,
    methodId: tx.methodId ?? tx.method_id,
    methodName: tx.methodName ?? tx.method_name,
    protocol: tx.protocol,
    to: tx.to ?? tx.to_addr,
    direction: tx.direction,
  });

  const valueUsd = resolveTxValueUsd(tx);
  const gasEth = resolveGasFeeEth(tx);
  const gasUsd =
    typeof tx.gasFeeUsd === 'number' && tx.gasFeeUsd > 0
      ? tx.gasFeeUsd
      : ethPriceUsd > 0
        ? gasEth * ethPriceUsd
        : 0;

  if (metric === 'gas') {
    return gasUsd > 0 ? gasUsd : 0;
  }

  if (metric === 'revenue') {
    if (!REVENUE.has(type) || valueUsd == null) return 0;
    return valueUsd;
  }

  if (metric === 'expenses') {
    if (!EXPENSE.has(type) || valueUsd == null) return 0;
    return valueUsd;
  }

  // netFlow
  if (REVENUE.has(type) && valueUsd != null) return valueUsd;
  if (EXPENSE.has(type) && valueUsd != null) return -valueUsd;
  return 0;
}

export function buildCashflowHistory(
  txs: CashflowTxInput[],
  options: {
    metric: CashflowMetric;
    days: number;
    ethPriceUsd?: number | null;
    nowMs?: number;
  },
): CashflowHistoryResult {
  const metric = options.metric;
  const days = options.days >= 0 ? Math.floor(options.days) : 30;
  const ethPrice =
    options.ethPriceUsd && options.ethPriceUsd > 0 ? options.ethPriceUsd : 0;
  const nowMs = options.nowMs ?? Date.now();
  const bucket: 'hour' | 'day' = days > 0 && days <= 1 ? 'hour' : 'day';
  const keyFn = bucket === 'hour' ? hourKey : dayKey;
  const stepMs = bucket === 'hour' ? 3_600_000 : 86_400_000;
  const align = bucket === 'hour' ? startOfUtcHour : startOfUtcDay;

  const contributions: Array<{ ms: number; amount: number }> = [];
  for (const tx of txs) {
    const ms = txTimeMs(tx);
    if (ms == null) continue;
    const amount = txMetricContribution(tx, metric, ethPrice);
    if (amount === 0) continue;
    contributions.push({ ms, amount });
  }

  contributions.sort((a, b) => a.ms - b.ms);

  let rangeStart: number;
  if (days > 0) {
    rangeStart = align(nowMs - days * 86_400_000);
  } else if (contributions.length > 0) {
    rangeStart = align(contributions[0].ms);
  } else {
    return {
      points: [],
      periodTotal: 0,
      metric,
      days,
      bucket,
      contributingTxCount: 0,
      methodology: methodologyLine(metric, 0),
    };
  }

  const rangeEnd = align(nowMs);
  const inRange = contributions.filter(c => c.ms >= rangeStart && c.ms <= nowMs);

  if (inRange.length === 0) {
    return {
      points: [],
      periodTotal: 0,
      metric,
      days,
      bucket,
      contributingTxCount: 0,
      methodology: methodologyLine(metric, 0),
    };
  }

  const bucketTotals = new Map<string, number>();
  for (const c of inRange) {
    const k = keyFn(c.ms);
    bucketTotals.set(k, (bucketTotals.get(k) || 0) + c.amount);
  }

  const points: CashflowHistoryPoint[] = [];
  let running = 0;

  // Period-relative baseline: start cumulative at 0 (prepend if first bucket has activity)
  const firstKey = keyFn(rangeStart);
  if ((bucketTotals.get(firstKey) || 0) !== 0) {
    points.push({ date: keyFn(rangeStart - stepMs), value: 0, daily: 0 });
  }

  for (let t = rangeStart; t <= rangeEnd; t += stepMs) {
    const k = keyFn(t);
    const daily = round2(bucketTotals.get(k) || 0);
    running = round2(running + daily);
    points.push({ date: k, value: running, daily });
  }

  const periodTotal = points.length > 0 ? points[points.length - 1].value : 0;

  return {
    points,
    periodTotal,
    metric,
    days,
    bucket,
    contributingTxCount: inRange.length,
    methodology: methodologyLine(metric, inRange.length),
  };
}

function methodologyLine(metric: CashflowMetric, count: number): string {
  return `Based on classified transactions in your synced history · ${METRIC_LABEL[metric]} · ${count} contributing transfer(s) · period-relative cumulative`;
}

export function parseCashflowMetric(raw: string | null): CashflowMetric | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v === 'revenue' || v === 'expenses' || v === 'netFlow' || v === 'gas') return v;
  // aliases
  if (v === 'flow' || v === 'net_flow' || v === 'net-flow') return 'netFlow';
  if (v === 'gasFees' || v === 'gas_fees' || v === 'gas-fees') return 'gas';
  return null;
}
