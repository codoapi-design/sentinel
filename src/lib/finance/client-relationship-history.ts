/**
 * Relationship / cashflow time series from an in-memory filtered transaction list.
 * Uses the same revenue/expense classification as filter stats cards.
 */

import { isExpenseType, isRevenueType } from '@/lib/finance/summary';

export interface RelationshipTxInput {
  date?: string | null;
  timestamp?: number | null;
  type?: string | null;
  /** Alias for type (some rows use classification / typeLabel) */
  classification?: string | null;
  typeLabel?: string | null;
  /** USD amount (preferred) */
  value?: number | string | null;
  /** Optional alias used by some portfolio rows */
  valueUsd?: number | string | null;
}

export interface RelationshipHistoryPoint {
  /** ISO date (YYYY-MM-DD) or hourly ISO datetime */
  date: string;
  /** Period-relative cumulative revenue */
  revenue: number;
  /** Period-relative cumulative expenses */
  expense: number;
  /** Period-relative cumulative net (revenue − expense) */
  netFlow: number;
  /** Period-relative cumulative absolute USD volume (all dated txs) */
  volume: number;
  dailyRevenue: number;
  dailyExpense: number;
  dailyNet: number;
  dailyVolume: number;
}

export interface RelationshipHistoryResult {
  points: RelationshipHistoryPoint[];
  periodRevenue: number;
  periodExpense: number;
  periodNet: number;
  /** Sum of |value| for all dated filtered txs in the window */
  periodVolume: number;
  days: number;
  bucket: 'hour' | 'day';
  /** Revenue / expense classified txs in range */
  contributingTxCount: number;
  /** All dated txs with |value| > 0 in range (includes trades, etc.) */
  volumeTxCount: number;
  /** True when there is volume activity but no classified R/E in range */
  volumeOnly: boolean;
  methodology: string;
}

export interface BuildRelationshipHistoryOptions {
  days: number;
  nowMs?: number;
  /** Override methodology one-liner; defaults to client-oriented wording */
  methodology?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Coerce value / valueUsd (number or numeric string) → absolute USD. */
function txUsd(tx: RelationshipTxInput): number {
  const raw = tx.value ?? tx.valueUsd ?? 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return typeof n === 'number' && Number.isFinite(n) ? Math.abs(n) : 0;
}

/** Resolve canonical type from type / classification / typeLabel. */
function txType(tx: RelationshipTxInput): string {
  const raw = String(tx.type || tx.classification || tx.typeLabel || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  if (raw === 'income' || raw.startsWith('income')) return 'income';
  if (raw === 'expense' || raw.startsWith('expense')) return 'expense';
  if (raw === 'staking' || raw.includes('staking')) return 'staking';
  if (raw === 'gas' || raw.includes('gas')) return 'gas';
  if (raw === 'trade' || raw.includes('trade')) return 'trade';
  if (raw === 'defi' || raw.includes('defi')) return 'defi';
  if (raw === 'bridge' || raw.includes('bridge')) return 'bridge';
  if (raw === 'nft' || raw.includes('nft')) return 'nft';
  return raw;
}

function txTimeMs(tx: RelationshipTxInput): number | null {
  if (typeof tx.timestamp === 'number' && Number.isFinite(tx.timestamp) && tx.timestamp > 0) {
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

function zeroPoint(date: string): RelationshipHistoryPoint {
  return {
    date,
    revenue: 0,
    expense: 0,
    netFlow: 0,
    volume: 0,
    dailyRevenue: 0,
    dailyExpense: 0,
    dailyNet: 0,
    dailyVolume: 0,
  };
}

const DEFAULT_METHODOLOGY =
  'Cumulative inflow & outflow from filtered table rows · same classification as stats cards · period-relative';

/**
 * Build cumulative revenue / expense / net (and volume) series from filtered txs.
 * Period-relative: cumulative starts at 0 for the selected window (relative to now).
 *
 * Leading empty buckets are trimmed so sparse / single-day activity still draws a
 * visible ramp (mandatory zero baseline immediately before first activity).
 * Trailing empty buckets after last activity are trimmed so the series stays dense.
 */
export function buildRelationshipHistory(
  txs: RelationshipTxInput[],
  options: BuildRelationshipHistoryOptions = { days: 30 },
): RelationshipHistoryResult {
  const days = options.days >= 0 ? Math.floor(options.days) : 30;
  const nowMs = options.nowMs ?? Date.now();
  const bucket: 'hour' | 'day' = days > 0 && days <= 1 ? 'hour' : 'day';
  const keyFn = bucket === 'hour' ? hourKey : dayKey;
  const stepMs = bucket === 'hour' ? 3_600_000 : 86_400_000;
  const align = bucket === 'hour' ? startOfUtcHour : startOfUtcDay;
  const methodology = options.methodology ?? DEFAULT_METHODOLOGY;

  const empty = (): RelationshipHistoryResult => ({
    points: [],
    periodRevenue: 0,
    periodExpense: 0,
    periodNet: 0,
    periodVolume: 0,
    days,
    bucket,
    contributingTxCount: 0,
    volumeTxCount: 0,
    volumeOnly: false,
    methodology,
  });

  type Contribution = { ms: number; revenue: number; expense: number; volume: number };
  const contributions: Contribution[] = [];

  for (const tx of txs) {
    const ms = txTimeMs(tx);
    if (ms == null) continue;
    const amount = txUsd(tx);
    const type = txType(tx);
    const revenue = isRevenueType(type) ? amount : 0;
    const expense = isExpenseType(type) ? amount : 0;
    const volume = amount || 0;
    if (revenue === 0 && expense === 0 && volume === 0) continue;
    contributions.push({ ms, revenue, expense, volume });
  }

  contributions.sort((a, b) => a.ms - b.ms);

  let rangeStart: number;
  if (days > 0) {
    rangeStart = align(nowMs - days * 86_400_000);
  } else if (contributions.length > 0) {
    rangeStart = align(contributions[0].ms);
  } else {
    return empty();
  }

  const rangeEnd = align(nowMs);
  const inRange = contributions.filter(c => c.ms >= rangeStart && c.ms <= nowMs);

  if (inRange.length === 0) {
    return empty();
  }

  const classified = inRange.filter(c => c.revenue !== 0 || c.expense !== 0);
  const volumeOnly = classified.length === 0;
  // When R/E exist, chart from classified only; volume-only mode charts all volume txs.
  const seriesSource = volumeOnly ? inRange : classified;

  const bucketRev = new Map<string, number>();
  const bucketExp = new Map<string, number>();
  const bucketVol = new Map<string, number>();
  for (const c of inRange) {
    const k = keyFn(c.ms);
    bucketVol.set(k, (bucketVol.get(k) || 0) + c.volume);
  }
  for (const c of seriesSource) {
    const k = keyFn(c.ms);
    bucketRev.set(k, (bucketRev.get(k) || 0) + c.revenue);
    bucketExp.set(k, (bucketExp.get(k) || 0) + c.expense);
  }

  // Start plotting at first activity — skip a long flat zero lead-in that looks "empty".
  const firstActivityMs = align(Math.min(...seriesSource.map(c => c.ms)));
  const lastActivityMs = align(Math.max(...seriesSource.map(c => c.ms)));
  // Include one bucket after last activity so cumulative plateau is visible (≥2 steps).
  const plotEnd = Math.min(rangeEnd, lastActivityMs + stepMs);
  const plotStart = firstActivityMs;

  const points: RelationshipHistoryPoint[] = [];
  let runningRev = 0;
  let runningExp = 0;
  let runningVol = 0;

  // Mandatory zero baseline so monotone/area always has ≥2 points and a visible ramp.
  points.push(zeroPoint(keyFn(plotStart - stepMs)));

  for (let t = plotStart; t <= plotEnd; t += stepMs) {
    const k = keyFn(t);
    const dailyRevenue = round2(bucketRev.get(k) || 0);
    const dailyExpense = round2(bucketExp.get(k) || 0);
    const dailyVolume = round2(bucketVol.get(k) || 0);
    const dailyNet = round2(dailyRevenue - dailyExpense);
    runningRev = round2(runningRev + dailyRevenue);
    runningExp = round2(runningExp + dailyExpense);
    runningVol = round2(runningVol + dailyVolume);
    points.push({
      date: k,
      revenue: runningRev,
      expense: runningExp,
      netFlow: round2(runningRev - runningExp),
      volume: runningVol,
      dailyRevenue,
      dailyExpense,
      dailyNet,
      dailyVolume,
    });
  }

  // Guarantee a non-flat series when all activity lands in one bucket (e.g. "All" = 1 day).
  if (points.length === 1) {
    points.unshift(zeroPoint(keyFn(plotStart - stepMs)));
  }

  // If somehow still flat (single activity bucket with no baseline ramp), force a zero→value pair.
  if (points.length >= 2) {
    const last = points[points.length - 1];
    const hasProgression =
      points.some(p => p.revenue !== last.revenue || p.expense !== last.expense || p.volume !== last.volume) ||
      (last.revenue === 0 && last.expense === 0 && last.volume === 0);
    if (!hasProgression && (last.revenue > 0 || last.expense > 0 || last.volume > 0)) {
      points[0] = zeroPoint(keyFn(plotStart - stepMs));
    }
  }

  const periodRevenue = points.length > 0 ? points[points.length - 1].revenue : 0;
  const periodExpense = points.length > 0 ? points[points.length - 1].expense : 0;
  const periodVolume = points.length > 0 ? points[points.length - 1].volume : 0;

  return {
    points,
    periodRevenue,
    periodExpense,
    periodNet: round2(periodRevenue - periodExpense),
    periodVolume,
    days,
    bucket,
    contributingTxCount: classified.length,
    volumeTxCount: inRange.filter(c => c.volume > 0).length,
    volumeOnly,
    methodology,
  };
}

/** @deprecated Prefer buildRelationshipHistory — kept for existing client imports */
export function buildClientRelationshipHistory(
  txs: RelationshipTxInput[],
  options: BuildRelationshipHistoryOptions = { days: 30 },
): RelationshipHistoryResult {
  return buildRelationshipHistory(txs, {
    ...options,
    methodology:
      options.methodology ??
      'Cumulative inflow & outflow from filtered table rows · same classification as client cards · period-relative',
  });
}
