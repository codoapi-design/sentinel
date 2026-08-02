/**
 * Shared primitives for the Radareum Intelligence engines.
 *
 * Period splitting, safe arithmetic, evidence formatting, confidence derivation,
 * deterministic insight ids, ranking helpers, concentration measures, and the
 * per-asset ledger that Performance / Portfolio / Asset / Risk all read from.
 *
 * Everything here is pure and deterministic: no clock reads unless `now` is
 * omitted by the caller, no network, no storage.
 */

import { isStablecoinSymbol } from '@/lib/finance/stablecoins';
import {
  refineTransactionType,
  resolveGasFeeEth,
  resolveTxValueUsd,
} from '@/lib/finance/summary';
import { filterVisibleTransactions, resolveTxDisplayUsd } from '@/lib/finance/visibility';
import type {
  AssetHolding,
  Confidence,
  DataQuality,
  Evidence,
  Insight,
  InsightSourceRef,
  IntelligenceInput,
  IntelligenceTransaction,
  PeriodComparison,
  Severity,
} from './types';

export const DAY_MS = 86_400_000;
export const DEFAULT_PERIOD_DAYS = 30;

/** Below this USD amount a movement is treated as noise rather than a capital event. */
export const MATERIAL_USD_THRESHOLD = 1;

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function round1(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Score helper — clamps to 0–100 and rounds to a whole point. */
export function score100(n: number): number {
  return Math.round(clamp(n, 0, 100));
}

/** `null` instead of Infinity / NaN when the denominator cannot support a ratio. */
export function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/** Percentage change from `previous` to `current`; `null` when previous is zero. */
export function pctChange(current: number, previous: number): number | null {
  const ratio = safeDiv(current - previous, Math.abs(previous));
  return ratio == null ? null : round2(ratio * 100);
}

/** Share of `total` expressed as 0–100; `0` when the total is not positive. */
export function sharePct(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return round2((value / total) * 100);
}

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) {
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

/** Population standard deviation. */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map(v => (v - avg) ** 2));
  return Math.sqrt(variance);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function buildComparison(current: number, previous: number): PeriodComparison {
  return {
    current: round2(current),
    previous: round2(previous),
    changePct: pctChange(current, previous),
  };
}

/**
 * Herfindahl–Hirschman index over shares expressed as 0–100.
 * Returns 0–1: 1 = everything in a single bucket, → 0 = perfectly spread.
 */
export function herfindahl(sharesPct: number[]): number {
  if (sharesPct.length === 0) return 0;
  const total = sum(sharesPct);
  if (total <= 0) return 0;
  let index = 0;
  for (const s of sharesPct) {
    const normalized = s / total;
    index += normalized * normalized;
  }
  return round2(index * 100) / 100;
}

/**
 * Normalized Shannon entropy of a distribution, 0–100.
 * 100 = value spread evenly, 0 = concentrated in one bucket.
 * This measures distribution of exposure, not the number of buckets
 * (Spec §5.38 "Diversification = Distribution of exposure, NOT number of tokens").
 */
export function distributionScore(sharesPct: number[]): number {
  const positive = sharesPct.filter(s => s > 0);
  if (positive.length <= 1) return 0;
  const total = sum(positive);
  if (total <= 0) return 0;
  let entropy = 0;
  for (const s of positive) {
    const p = s / total;
    entropy -= p * Math.log(p);
  }
  return score100((entropy / Math.log(positive.length)) * 100);
}

// ---------------------------------------------------------------------------
// Formatting (evidence strings only — UI formatting stays in the view layer)
// ---------------------------------------------------------------------------

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 1 ? 2 : 0;
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function formatPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0%';
  const rounded = value.toFixed(digits).replace(/\.0+$/, '');
  return `${rounded}%`;
}

export function formatSignedPct(value: number, digits = 1): string {
  const base = formatPct(Math.abs(value), digits);
  if (value > 0) return `+${base}`;
  if (value < 0) return `-${base}`;
  return base;
}

export function formatDays(days: number): string {
  const rounded = Math.max(0, Math.round(days));
  return rounded === 1 ? '1 day' : `${rounded} days`;
}

export function formatPeriodLabel(days: number): string {
  return `${Math.max(1, Math.round(days))}d`;
}

/**
 * Human label for Investment Return's since-connected window.
 * Returns `null` when the timestamp cannot be parsed.
 */
export function formatSinceConnectedLabel(
  sinceConnectedAt: string | null | undefined,
  now?: number,
): string | null {
  if (!sinceConnectedAt || typeof sinceConnectedAt !== 'string') return null;
  const start = Date.parse(sinceConnectedAt);
  if (!Number.isFinite(start)) return null;
  const end = Number.isFinite(now) ? Number(now) : Date.now();
  const days = Math.max(1, Math.round((end - start) / DAY_MS));
  return `Since connected (${days}d)`;
}

/** Whole days since connect (min 1); `null` when the timestamp is unusable. */
export function daysSinceConnected(
  sinceConnectedAt: string | null | undefined,
  now?: number,
): number | null {
  if (!sinceConnectedAt || typeof sinceConnectedAt !== 'string') return null;
  const start = Date.parse(sinceConnectedAt);
  if (!Number.isFinite(start)) return null;
  const end = Number.isFinite(now) ? Number(now) : Date.now();
  return Math.max(1, Math.round((end - start) / DAY_MS));
}

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, (toMs - fromMs) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Period handling
// ---------------------------------------------------------------------------

export interface ResolvedPeriod {
  now: number;
  days: number;
  currentStart: number;
  currentEnd: number;
  previousStart: number;
  previousEnd: number;
  /** e.g. `30d` — used verbatim in evidence. */
  label: string;
}

export function resolvePeriod(
  input: Pick<IntelligenceInput, 'now' | 'periodDays' | 'periodLabel'>,
): ResolvedPeriod {
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const rawDays = Number.isFinite(input.periodDays) ? Number(input.periodDays) : DEFAULT_PERIOD_DAYS;
  const days = Math.max(1, Math.round(rawDays));
  const currentStart = now - days * DAY_MS;
  const overrideLabel = typeof input.periodLabel === 'string' ? input.periodLabel.trim() : '';
  return {
    now,
    days,
    currentStart,
    currentEnd: now,
    previousStart: currentStart - days * DAY_MS,
    previousEnd: currentStart,
    label: overrideLabel.length > 0 ? overrideLabel : formatPeriodLabel(days),
  };
}

/** Epoch ms for a transaction, tolerating unix seconds and date-only strings. */
export function txTimestampMs(tx: IntelligenceTransaction): number | null {
  const ts = tx.timestamp;
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    return ts < 1e12 ? ts * 1000 : ts;
  }
  if (typeof tx.date === 'string' && tx.date.length >= 10) {
    const parsed = Date.parse(tx.date.length === 10 ? `${tx.date}T12:00:00.000Z` : tx.date);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export interface PeriodSplit<T> {
  current: T[];
  previous: T[];
  /** Everything older than the previous window. */
  older: T[];
  /** Rows whose timestamp could not be resolved — excluded from both windows. */
  undated: T[];
}

export function splitByPeriod<T>(
  items: T[],
  getMs: (item: T) => number | null,
  period: ResolvedPeriod,
): PeriodSplit<T> {
  const split: PeriodSplit<T> = { current: [], previous: [], older: [], undated: [] };
  for (const item of items) {
    const ms = getMs(item);
    if (ms == null) {
      split.undated.push(item);
      continue;
    }
    if (ms > period.currentEnd) continue;
    if (ms >= period.currentStart) split.current.push(item);
    else if (ms >= period.previousStart) split.previous.push(item);
    else split.older.push(item);
  }
  return split;
}

// ---------------------------------------------------------------------------
// Transaction normalisation
// ---------------------------------------------------------------------------

/** Applies the app's spam / dust visibility convention unless the caller opts in. */
export function resolveTransactions(input: IntelligenceInput): IntelligenceTransaction[] {
  const txs = Array.isArray(input.transactions) ? input.transactions : [];
  return filterVisibleTransactions(txs, input.includeHidden === true);
}

/** USD amount that matches the Transactions table Value column; `null` when unpriced. */
export function txUsd(tx: IntelligenceTransaction): number | null {
  const display = resolveTxDisplayUsd(tx);
  if (display != null && Number.isFinite(display) && Math.abs(display) > 0) return Math.abs(display);
  const explicit = resolveTxValueUsd(tx);
  return explicit != null && Number.isFinite(explicit) ? Math.abs(explicit) : null;
}

/** Accounting classification, upgraded from method / protocol hints. */
export function txType(tx: IntelligenceTransaction): string {
  return refineTransactionType({
    type: tx.type,
    methodId: tx.methodId ?? tx.method_id,
    methodName: tx.methodName ?? tx.method_name,
    protocol: tx.protocol,
    to: tx.to ?? tx.to_addr,
    direction: tx.direction,
  });
}

/** Movement direction relative to the wallet; `null` when the row is not a transfer. */
export function txDirection(tx: IntelligenceTransaction): 'in' | 'out' | null {
  const raw = (tx.direction ?? '').toString().toLowerCase();
  if (raw === 'in') return 'in';
  if (raw === 'out') return 'out';
  const type = txType(tx);
  if (type === 'income' || type === 'staking') return 'in';
  if (type === 'expense') return 'out';
  return null;
}

/** Gas paid in USD, converting from ETH only when an ETH price is supplied. */
export function txGasUsd(tx: IntelligenceTransaction, ethPriceUsd: number): number {
  const direct = tx.gasFeeUsd ?? tx.gas_fee_usd ?? tx.gasUsd ?? tx.gas_usd;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return direct;
  if (ethPriceUsd > 0) {
    const eth = resolveGasFeeEth(tx);
    if (eth > 0) return eth * ethPriceUsd;
  }
  return 0;
}

export function resolveEthPriceUsd(input: IntelligenceInput): number {
  const explicit = input.ethPriceUsd;
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return explicit;
  for (const asset of input.assets ?? []) {
    if ((asset.symbol || '').toUpperCase() === 'ETH') {
      const price = asset.priceUsd;
      if (typeof price === 'number' && Number.isFinite(price) && price > 0) return price;
    }
  }
  return 0;
}

export function txNetwork(tx: IntelligenceTransaction): string {
  const raw = (tx.network || tx.chain || '').toString().trim().toLowerCase();
  return raw || 'unknown';
}

export function txNetworkLabel(tx: IntelligenceTransaction): string {
  const label = (tx.networkLabel || '').toString().trim();
  if (label) return label;
  const network = txNetwork(tx);
  return network === 'unknown' ? 'Unknown network' : network.charAt(0).toUpperCase() + network.slice(1);
}

export function txTokenSymbol(tx: IntelligenceTransaction): string {
  const raw = (tx.token || tx.tokenSymbol || tx.token_symbol || '').toString().trim();
  if (!raw) return 'UNKNOWN';
  const upper = raw.toUpperCase();
  return upper === 'UNKNOWN TOKEN' || upper === '?' || upper === '-' ? 'UNKNOWN' : upper;
}

/** Per-unit USD price observed on the row, when it is usable. */
export function txUnitPriceUsd(tx: IntelligenceTransaction): number | null {
  const candidates = [tx.price, tx.priceUsd, tx.price_usd];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  const qty = tx.quantity ?? tx.tokenValue ?? tx.token_value;
  const usd = txUsd(tx);
  if (typeof qty === 'number' && Number.isFinite(qty) && qty > 0 && usd != null && usd > 0) {
    return usd / qty;
  }
  return null;
}

export function txQuantity(tx: IntelligenceTransaction): number | null {
  const candidates = [tx.quantity, tx.tokenValue, tx.token_value];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return null;
}

export function normalizeAddress(value: string | null | undefined): string {
  return (value ?? '').toString().trim().toLowerCase();
}

/** True when the counterparty is one of the user's own wallets (Spec §5.120 Type 5). */
export function isInternalCounterparty(
  tx: IntelligenceTransaction,
  ownedAddresses: Set<string>,
): boolean {
  if (ownedAddresses.size === 0) return false;
  const candidates = [tx.counterparty, tx.to, tx.to_addr, tx.from];
  for (const candidate of candidates) {
    const addr = normalizeAddress(candidate);
    if (addr && ownedAddresses.has(addr)) return true;
  }
  return false;
}

export function ownedAddressSet(input: IntelligenceInput): Set<string> {
  const set = new Set<string>();
  for (const addr of input.walletAddresses ?? []) {
    const normalized = normalizeAddress(addr);
    if (normalized) set.add(normalized);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Data quality & confidence
// ---------------------------------------------------------------------------

export function buildDataQuality(txs: IntelligenceTransaction[]): DataQuality {
  let priced = 0;
  for (const tx of txs) {
    if (txUsd(tx) != null) priced += 1;
  }
  const total = txs.length;
  return {
    transactionCount: total,
    pricedCount: priced,
    unpricedCount: total - priced,
    completeness: total === 0 ? 0 : round2((priced / total) * 100),
  };
}

export function mergeDataQuality(parts: DataQuality[]): DataQuality {
  const transactionCount = sum(parts.map(p => p.transactionCount));
  const pricedCount = sum(parts.map(p => p.pricedCount));
  return {
    transactionCount,
    pricedCount,
    unpricedCount: transactionCount - pricedCount,
    completeness: transactionCount === 0 ? 0 : round2((pricedCount / transactionCount) * 100),
  };
}

export interface ConfidenceOptions {
  /** Minimum priced rows required before `high` is possible. */
  minSampleForHigh?: number;
  /** Minimum priced rows required before `medium` is possible. */
  minSampleForMedium?: number;
  /** Extra caps applied by the caller (e.g. no snapshots available). */
  cap?: Confidence;
}

/**
 * Confidence follows data completeness and sample size (Spec §5.70 Data Confidence Score).
 * Sparse or largely unpriced data can never produce `high`.
 */
export function deriveConfidence(quality: DataQuality, options: ConfidenceOptions = {}): Confidence {
  const minHigh = options.minSampleForHigh ?? 20;
  const minMedium = options.minSampleForMedium ?? 5;
  let level: Confidence = 'low';
  if (quality.pricedCount >= minHigh && quality.completeness >= 80) level = 'high';
  else if (quality.pricedCount >= minMedium && quality.completeness >= 50) level = 'medium';
  return options.cap ? lowestConfidence(level, options.cap) : level;
}

export function confidenceRank(confidence: Confidence): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

export function lowestConfidence(...levels: Confidence[]): Confidence {
  let lowest: Confidence = 'high';
  for (const level of levels) {
    if (confidenceRank(level) < confidenceRank(lowest)) lowest = level;
  }
  return lowest;
}

export function severityRank(severity: Severity): number {
  switch (severity) {
    case 'critical':
      return 5;
    case 'high':
      return 4;
    case 'medium':
      return 3;
    case 'low':
      return 2;
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Ids & ranking
// ---------------------------------------------------------------------------

export function slug(value: string): string {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Deterministic id: same module + type + subject always produces the same value. */
export function makeInsightId(
  category: string,
  type: string,
  subject?: string | null,
): string {
  const parts = [slug(category), slug(type)];
  const subjectSlug = subject ? slug(subject) : '';
  if (subjectSlug) parts.push(subjectSlug);
  return parts.join(':');
}

export function makePatternId(category: string, type: string, subject?: string | null): string {
  return makeInsightId(`${category}-pattern`, type, subject);
}

/** Highest-scoring `n` items, ties broken by the original order for determinism. */
export function topN<T>(items: T[], n: number, score: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, value: score(item) }))
    .sort((a, b) => (b.value === a.value ? a.index - b.index : b.value - a.value))
    .slice(0, Math.max(0, n))
    .map(entry => entry.item);
}

// ---------------------------------------------------------------------------
// Asset ledger — the per-asset view shared by several engines
// ---------------------------------------------------------------------------

export type AssetCategory = 'stablecoin' | 'native' | 'wrapped' | 'defi' | 'other' | 'unknown';

const NATIVE_SYMBOLS = new Set(['ETH', 'BTC', 'SOL', 'MATIC', 'POL', 'AVAX', 'BNB']);
const WRAPPED_SYMBOLS = new Set(['WETH', 'WBTC', 'STETH', 'WSTETH', 'CBETH', 'RETH', 'WMATIC']);
const DEFI_SYMBOLS = new Set([
  'UNI', 'AAVE', 'COMP', 'CRV', 'MKR', 'SNX', 'LDO', 'SUSHI', 'BAL', 'GMX', 'PENDLE', '1INCH',
]);

export function resolveAssetCategory(symbol: string, priceKnown: boolean): AssetCategory {
  const upper = (symbol || '').toUpperCase();
  if (!upper || upper === 'UNKNOWN' || !priceKnown) return 'unknown';
  if (isStablecoinSymbol(upper)) return 'stablecoin';
  if (NATIVE_SYMBOLS.has(upper)) return 'native';
  if (WRAPPED_SYMBOLS.has(upper)) return 'wrapped';
  if (DEFI_SYMBOLS.has(upper)) return 'defi';
  return 'other';
}

export interface AssetLedgerEntry {
  /** `symbol` (uppercase) — the grouping key across holdings and transactions. */
  key: string;
  symbol: string;
  name: string | null;
  network: string;
  tokenAddress: string | null;
  /** False when the asset only appears in transactions and is no longer held. */
  held: boolean;
  quantity: number | null;
  priceUsd: number | null;
  valueUsd: number;
  allocationPct: number;
  category: AssetCategory;
  isStablecoin: boolean;

  /** Reconstructed start-of-period state; `null` when it could not be derived. */
  quantityStart: number | null;
  priceStartUsd: number | null;
  valueStartUsd: number | null;
  allocationStartPct: number | null;
  allocationDriftPct: number | null;
  /** Total value change over the window (Spec §5.53 Performance Contribution). */
  valueChangeUsd: number | null;
  /** Value change attributable to price movement alone, excluding flows. */
  appreciationUsd: number | null;
  priceChangePct: number | null;

  inflowUsd: number;
  outflowUsd: number;
  netFlowUsd: number;
  volumeUsd: number;
  txCount: number;
  periodTxCount: number;
  tradeCount: number;
  pricedTxCount: number;
  unpricedTxCount: number;
  firstSeenMs: number | null;
  lastActivityMs: number | null;
  daysSinceLastActivity: number | null;
  holdingDurationDays: number | null;
  turnoverRate: number | null;
}

export interface AssetLedger {
  entries: AssetLedgerEntry[];
  totalValueUsd: number;
  /** Sum of reconstructed start values; `null` when no asset could be reconstructed. */
  totalStartValueUsd: number | null;
  /** Share of value held in assets that carry a usable price, 0–100. */
  pricedValueSharePct: number;
  unpricedAssetCount: number;
  reconstructedAssetCount: number;
}

interface LedgerAccumulator {
  symbol: string;
  name: string | null;
  network: string;
  tokenAddress: string | null;
  holdingQuantity: number | null;
  holdingPrice: number | null;
  holdingValue: number;
  held: boolean;
  inflowUsd: number;
  outflowUsd: number;
  volumeUsd: number;
  netQuantity: number;
  netQuantityKnown: boolean;
  txCount: number;
  periodTxCount: number;
  tradeCount: number;
  pricedTxCount: number;
  unpricedTxCount: number;
  firstSeenMs: number | null;
  lastActivityMs: number | null;
  priceObservations: Array<{ ms: number; price: number }>;
}

function ensureAccumulator(
  map: Map<string, LedgerAccumulator>,
  symbol: string,
): LedgerAccumulator {
  const existing = map.get(symbol);
  if (existing) return existing;
  const created: LedgerAccumulator = {
    symbol,
    name: null,
    network: 'unknown',
    tokenAddress: null,
    holdingQuantity: null,
    holdingPrice: null,
    holdingValue: 0,
    held: false,
    inflowUsd: 0,
    outflowUsd: 0,
    volumeUsd: 0,
    netQuantity: 0,
    netQuantityKnown: true,
    txCount: 0,
    periodTxCount: 0,
    tradeCount: 0,
    pricedTxCount: 0,
    unpricedTxCount: 0,
    firstSeenMs: null,
    lastActivityMs: null,
    priceObservations: [],
  };
  map.set(symbol, created);
  return created;
}

/** Visible holdings only, unless the caller opted into spam / dust. */
export function resolveHoldings(input: IntelligenceInput): AssetHolding[] {
  const holdings = Array.isArray(input.assets) ? input.assets : [];
  if (input.includeHidden === true) return holdings;
  return holdings.filter(a => a.isSpam !== true && Number.isFinite(a.valueUsd) && a.valueUsd > 0);
}

export function resolvePortfolioValueUsd(input: IntelligenceInput): number {
  const explicit = input.portfolioValueUsd;
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return round2(explicit);
  const holdings = resolveHoldings(input);
  if (holdings.length > 0) {
    const holdingsTotal = round2(sum(holdings.map(a => a.valueUsd)));
    if (holdingsTotal > 0) return holdingsTotal;
  }
  const snapshots = resolveSnapshots(input);
  if (snapshots.length > 0) {
    const snapshotValue = round2(snapshots[snapshots.length - 1].value);
    if (snapshotValue > 0) return snapshotValue;
  }
  // When holdings/snapshots are empty or unpriced, prefer open lot market value.
  const marketValueOpenUsd = readInvestmentReturnMarketValue(input.investmentReturn);
  if (marketValueOpenUsd != null && marketValueOpenUsd > 0) return marketValueOpenUsd;
  return 0;
}

function readInvestmentReturnMarketValue(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = (raw as Record<string, unknown>).marketValueOpenUsd;
  return typeof value === 'number' && Number.isFinite(value) ? round2(value) : null;
}

/** Snapshots sorted ascending by date, with unusable points dropped. */
export function resolveSnapshots(input: IntelligenceInput): Array<{ date: string; value: number; ms: number }> {
  const raw = Array.isArray(input.snapshots) ? input.snapshots : [];
  const points: Array<{ date: string; value: number; ms: number }> = [];
  for (const point of raw) {
    if (!point || typeof point.date !== 'string') continue;
    const value = Number(point.value);
    if (!Number.isFinite(value)) continue;
    const ms = Date.parse(point.date.length === 10 ? `${point.date}T00:00:00.000Z` : point.date);
    if (!Number.isFinite(ms)) continue;
    points.push({ date: point.date.slice(0, 10), value, ms });
  }
  return points.sort((a, b) => a.ms - b.ms);
}

/**
 * Builds the per-asset view used by Performance, Portfolio, Asset, and Risk.
 *
 * Start-of-period state is reconstructed, never invented:
 * quantity is rolled back through signed transfers inside the window, and the
 * start price is the closest price actually observed on a transaction. When
 * either input is missing the entry keeps `null` and confidence drops.
 */
export function buildAssetLedger(input: IntelligenceInput, period: ResolvedPeriod): AssetLedger {
  const txs = resolveTransactions(input);
  const holdings = resolveHoldings(input);
  const accumulators = new Map<string, LedgerAccumulator>();

  for (const holding of holdings) {
    const symbol = (holding.symbol || 'UNKNOWN').toUpperCase();
    const acc = ensureAccumulator(accumulators, symbol);
    acc.held = true;
    acc.name = holding.name ?? acc.name;
    acc.network = (holding.network || acc.network || 'unknown').toLowerCase();
    acc.tokenAddress = holding.tokenAddress ?? acc.tokenAddress;
    acc.holdingValue += Number.isFinite(holding.valueUsd) ? holding.valueUsd : 0;
    const qty = holding.quantity;
    if (typeof qty === 'number' && Number.isFinite(qty)) {
      acc.holdingQuantity = (acc.holdingQuantity ?? 0) + qty;
    }
    const price = holding.priceUsd;
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) acc.holdingPrice = price;
  }

  for (const tx of txs) {
    const symbol = txTokenSymbol(tx);
    const acc = ensureAccumulator(accumulators, symbol);
    const ms = txTimestampMs(tx);
    const usd = txUsd(tx);
    const type = txType(tx);
    const direction = txDirection(tx);
    const quantity = txQuantity(tx);
    const price = txUnitPriceUsd(tx);

    if (acc.network === 'unknown') acc.network = txNetwork(tx);
    if (!acc.tokenAddress) acc.tokenAddress = tx.tokenAddress ?? tx.token_address ?? null;

    acc.txCount += 1;
    if (usd != null) acc.pricedTxCount += 1;
    else acc.unpricedTxCount += 1;
    if (type === 'trade') acc.tradeCount += 1;

    if (ms != null) {
      if (acc.firstSeenMs == null || ms < acc.firstSeenMs) acc.firstSeenMs = ms;
      if (acc.lastActivityMs == null || ms > acc.lastActivityMs) acc.lastActivityMs = ms;
      if (price != null) acc.priceObservations.push({ ms, price });
    }

    const inPeriod = ms != null && ms >= period.currentStart && ms <= period.currentEnd;
    if (!inPeriod) continue;

    acc.periodTxCount += 1;
    if (usd != null) acc.volumeUsd += usd;

    if (direction === 'in') {
      if (usd != null) acc.inflowUsd += usd;
      if (quantity != null) acc.netQuantity += quantity;
      else acc.netQuantityKnown = false;
    } else if (direction === 'out') {
      if (usd != null) acc.outflowUsd += usd;
      if (quantity != null) acc.netQuantity -= quantity;
      else acc.netQuantityKnown = false;
    } else if (type === 'trade' || type === 'defi' || type === 'bridge') {
      // Swap / protocol legs move quantity in an unknown direction for this symbol.
      acc.netQuantityKnown = false;
    }
  }

  const totalValueUsd = round2(sum([...accumulators.values()].map(a => a.holdingValue)));
  const entries: AssetLedgerEntry[] = [];
  let totalStartValueUsd = 0;
  let reconstructedAssetCount = 0;
  let unpricedAssetCount = 0;
  let pricedValueUsd = 0;

  for (const acc of accumulators.values()) {
    const priceUsd =
      acc.holdingPrice ??
      (acc.holdingQuantity != null && acc.holdingQuantity > 0 && acc.holdingValue > 0
        ? acc.holdingValue / acc.holdingQuantity
        : null);
    const priceKnown = priceUsd != null && priceUsd > 0;
    if (acc.held && !priceKnown) unpricedAssetCount += 1;
    if (acc.held && priceKnown) pricedValueUsd += acc.holdingValue;

    const priceStartUsd = resolveStartPrice(acc.priceObservations, period.currentStart);
    const quantityStart =
      acc.holdingQuantity != null && acc.netQuantityKnown
        ? acc.holdingQuantity - acc.netQuantity
        : null;
    const valueStartUsd =
      quantityStart != null && quantityStart >= 0 && priceStartUsd != null
        ? round2(quantityStart * priceStartUsd)
        : null;
    const appreciationUsd =
      quantityStart != null && quantityStart >= 0 && priceStartUsd != null && priceKnown
        ? round2(quantityStart * ((priceUsd as number) - priceStartUsd))
        : null;
    const valueChangeUsd = valueStartUsd != null ? round2(acc.holdingValue - valueStartUsd) : null;
    const priceChangePct =
      priceStartUsd != null && priceStartUsd > 0 && priceKnown
        ? pctChange(priceUsd as number, priceStartUsd)
        : null;

    if (valueStartUsd != null) {
      totalStartValueUsd += valueStartUsd;
      reconstructedAssetCount += 1;
    }

    const averageValue =
      valueStartUsd != null ? (acc.holdingValue + valueStartUsd) / 2 : acc.holdingValue;

    entries.push({
      key: acc.symbol,
      symbol: acc.symbol,
      name: acc.name,
      network: acc.network,
      tokenAddress: acc.tokenAddress,
      held: acc.held && acc.holdingValue > 0,
      quantity: acc.holdingQuantity,
      priceUsd: priceKnown ? round2(priceUsd as number) : null,
      valueUsd: round2(acc.holdingValue),
      allocationPct: sharePct(acc.holdingValue, totalValueUsd),
      category: resolveAssetCategory(acc.symbol, priceKnown),
      isStablecoin: isStablecoinSymbol(acc.symbol),
      quantityStart,
      priceStartUsd: priceStartUsd != null ? round2(priceStartUsd) : null,
      valueStartUsd,
      allocationStartPct: null,
      allocationDriftPct: null,
      valueChangeUsd,
      appreciationUsd,
      priceChangePct,
      inflowUsd: round2(acc.inflowUsd),
      outflowUsd: round2(acc.outflowUsd),
      netFlowUsd: round2(acc.inflowUsd - acc.outflowUsd),
      volumeUsd: round2(acc.volumeUsd),
      txCount: acc.txCount,
      periodTxCount: acc.periodTxCount,
      tradeCount: acc.tradeCount,
      pricedTxCount: acc.pricedTxCount,
      unpricedTxCount: acc.unpricedTxCount,
      firstSeenMs: acc.firstSeenMs,
      lastActivityMs: acc.lastActivityMs,
      daysSinceLastActivity:
        acc.lastActivityMs != null ? round1(daysBetween(acc.lastActivityMs, period.now)) : null,
      holdingDurationDays:
        acc.firstSeenMs != null ? round1(daysBetween(acc.firstSeenMs, period.now)) : null,
      turnoverRate: averageValue > 0 ? round2(acc.volumeUsd / averageValue) : null,
    });
  }

  const startTotal = reconstructedAssetCount > 0 ? round2(totalStartValueUsd) : null;
  for (const entry of entries) {
    if (entry.valueStartUsd != null && startTotal != null && startTotal > 0) {
      entry.allocationStartPct = sharePct(entry.valueStartUsd, startTotal);
      entry.allocationDriftPct = round2(entry.allocationPct - entry.allocationStartPct);
    }
  }

  entries.sort((a, b) => (b.valueUsd === a.valueUsd ? a.symbol.localeCompare(b.symbol) : b.valueUsd - a.valueUsd));

  return {
    entries,
    totalValueUsd,
    totalStartValueUsd: startTotal,
    pricedValueSharePct: sharePct(pricedValueUsd, totalValueUsd),
    unpricedAssetCount,
    reconstructedAssetCount,
  };
}

/** Closest observed price at or before the window start, otherwise the earliest after it. */
function resolveStartPrice(
  observations: Array<{ ms: number; price: number }>,
  startMs: number,
): number | null {
  if (observations.length === 0) return null;
  const sorted = [...observations].sort((a, b) => a.ms - b.ms);
  let before: number | null = null;
  for (const observation of sorted) {
    if (observation.ms <= startMs) before = observation.price;
    else break;
  }
  if (before != null) return before;
  return sorted[0].price;
}

// ---------------------------------------------------------------------------
// Evidence helpers
// ---------------------------------------------------------------------------

/** Drops `null` / `undefined` / non-finite entries so evidence never carries holes. */
export function compactEvidence(
  raw: Record<string, EvidenceInputValue>,
): Evidence {
  const evidence: Evidence = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue;
      evidence[key] = value;
      continue;
    }
    const text = value.toString().trim();
    if (text) evidence[key] = text;
  }
  return evidence;
}

type EvidenceInputValue = string | number | null | undefined;

export const ENGINE_SEMVER: Record<string, string> = {
  performance: '2.0.0',
  flow: '2.0.0',
  portfolio: '2.0.0',
  asset: '2.0.0',
  risk: '2.0.0',
  trading: '2.0.0',
  network: '2.0.0',
  counterparty: '2.0.0',
};

/** Attach native source references to engine findings. */
export function withNativeSourceRefs(
  insights: Insight[],
  engine: keyof typeof ENGINE_SEMVER | string,
  refsFor: (insight: Insight) => InsightSourceRef[],
): Insight[] {
  const version = ENGINE_SEMVER[engine] ?? '2.0.0';
  return insights.map(insight => ({
    ...insight,
    engineVersion: insight.engineVersion ?? version,
    sourceRefs:
      insight.sourceRefs && insight.sourceRefs.length > 0
        ? insight.sourceRefs
        : refsFor(insight),
  }));
}

export function calculationRef(engine: string, formulaId?: string): InsightSourceRef {
  return {
    type: 'calculation',
    table: engine,
    id: formulaId,
  };
}

export function aggregateRef(queryId: string, table = 'transactions'): InsightSourceRef {
  return {
    type: 'aggregate',
    table,
    queryId,
    id: queryId,
  };
}

export function positionRef(symbol: string, network?: string): InsightSourceRef {
  return {
    type: 'asset_position',
    table: 'asset_positions',
    id: network ? `${symbol}:${network}` : symbol,
  };
}

export function snapshotRef(date: string): InsightSourceRef {
  return {
    type: 'portfolio_snapshot',
    table: 'portfolio_snapshots',
    id: date,
    timestamp: date,
  };
}

export function counterpartyRef(key: string): InsightSourceRef {
  return {
    type: 'counterparty',
    table: 'transactions',
    id: key,
  };
}

export function transactionRef(id?: string, hash?: string, timestamp?: string): InsightSourceRef {
  return {
    type: 'transaction',
    table: 'transactions',
    id,
    hash,
    timestamp,
  };
}
