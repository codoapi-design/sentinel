/**
 * Trading volume detail from synced wallet transactions.
 *
 * Full history of trade-classified txs across all synced data.
 * Volume = sum of positive USD notionals via resolveTradeVolumeUsd — same rule
 * as the dashboard Trading volume card / computeFinancialSummary (plus safe
 * alternates from price×qty / priced token legs when value_usd is missing).
 *
 * Does NOT invent USD prices for unpriced tokens.
 */

import {
  refineTransactionType,
  resolveTxValueUsd,
  type TxSummaryInput,
} from '@/lib/finance/summary';

export interface TradingVolumeTxInput extends TxSummaryInput {
  id?: string | null;
  tx_hash?: string | null;
  hash?: string | null;
  timestamp?: number | null;
  date?: string | null;
  network?: string | null;
  chain?: string | null;
  token_symbol?: string | null;
  tokenSymbol?: string | null;
  token_name?: string | null;
  tokenName?: string | null;
  token_address?: string | null;
  tokenAddress?: string | null;
  token_value?: number | null;
  tokenValue?: number | null;
  price_usd?: number | null;
  priceUsd?: number | null;
  counterparty?: string | null;
  counterparty_label?: string | null;
  counterpartyLabel?: string | null;
  protocol?: string | null;
  method_name?: string | null;
  methodName?: string | null;
  /** Cached sync payload — may include all token transfer legs */
  raw_data?: unknown;
  rawData?: unknown;
}

export interface TradingVolumeHistoryPoint {
  /** YYYY-MM-DD (UTC) */
  date: string;
  /** Volume contributed on this day */
  dailyUsd: number;
  /** Running cumulative volume from earliest trade through this day */
  cumulativeUsd: number;
}

export interface TradingVolumeByToken {
  key: string;
  tokenSymbol: string;
  tokenAddress: string | null;
  network: string;
  volumeUsd: number;
  tradeCount: number;
  /** Share of priced volume (0–100); 0 when unpriced group */
  pct: number;
  /** True when this group has no priced USD notionals */
  unpriced: boolean;
}

export interface TradingVolumeTradeRow {
  id: string;
  hash: string;
  date: string;
  timestamp: number;
  tokenSymbol: string;
  tokenAddress: string | null;
  network: string;
  /** null = unpriced (never invent $0 as a real notional) */
  volumeUsd: number | null;
  counterparty: string | null;
  counterpartyLabel: string | null;
  protocol: string | null;
  methodName: string | null;
}

/** Lightweight priced-trade atoms for accurate client-side period filters */
export interface TradingVolumeAtom {
  date: string;
  tokenSymbol: string;
  tokenAddress: string | null;
  network: string;
  volumeUsd: number;
}

export interface TradingVolumeDetail {
  totalVolumeUsd: number;
  tradeCount: number;
  pricedTradeCount: number;
  unpricedTradeCount: number;
  /** All synced wallet txs (any type) — for activity share */
  totalTxCount: number;
  /** tradeCount / totalTxCount * 100 when totalTxCount > 0 */
  activityPct: number | null;
  earliestTradeAt: string | null;
  latestTradeAt: string | null;
  methodology: string;
  history: TradingVolumeHistoryPoint[];
  byToken: TradingVolumeByToken[];
  /** All priced trades (compact) for period re-aggregation */
  atoms: TradingVolumeAtom[];
  /** Recent trades, newest first (capped for UI table) */
  trades: TradingVolumeTradeRow[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function txTimeMs(tx: TradingVolumeTxInput): number | null {
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

function networkOf(tx: TradingVolumeTxInput): string {
  return (tx.network || tx.chain || '').toLowerCase() || 'unknown';
}

function shortAddress(addr: string): string {
  const a = addr.trim();
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Treat provider "UNKNOWN" / empty as missing metadata */
function isMissingSymbol(s: string | null | undefined): boolean {
  const t = (s || '').trim();
  if (!t) return true;
  const u = t.toUpperCase();
  return u === 'UNKNOWN' || u === 'UNKNOWN TOKEN' || u === '?' || u === '-';
}

interface TransferLeg {
  tokenSymbol?: string | null;
  tokenName?: string | null;
  tokenAddress?: string | null;
  valueUsd?: number | null;
  priceUsd?: number | null;
  valueFormatted?: number | null;
}

function rawDataOf(tx: TradingVolumeTxInput): Record<string, unknown> | null {
  const raw = tx.raw_data ?? tx.rawData;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function transferLegs(tx: TradingVolumeTxInput): TransferLeg[] {
  const raw = rawDataOf(tx);
  const legs = raw?.tokenTransfers;
  if (!Array.isArray(legs)) return [];
  return legs.filter((l): l is TransferLeg => l != null && typeof l === 'object');
}

function positiveUsd(n: unknown): number | null {
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
  return null;
}

/**
 * Resolve trade notional in USD without inventing prices.
 * 1) Explicit value_usd / valueUsd / value (resolveTxValueUsd)
 * 2) price_usd × token_value on the row
 * 3) Best priced leg from raw_data.tokenTransfers
 */
export function resolveTradeVolumeUsd(tx: TradingVolumeTxInput): number | null {
  const primary = resolveTxValueUsd(tx);
  if (primary != null) return primary;

  const price = positiveUsd(tx.priceUsd ?? tx.price_usd);
  const qty = positiveUsd(tx.tokenValue ?? tx.token_value);
  if (price != null && qty != null) return price * qty;

  let best: number | null = null;
  for (const leg of transferLegs(tx)) {
    const legUsd = positiveUsd(leg.valueUsd);
    if (legUsd != null && (best == null || legUsd > best)) best = legUsd;
    else {
      const lp = positiveUsd(leg.priceUsd);
      const lq = positiveUsd(leg.valueFormatted);
      if (lp != null && lq != null) {
        const v = lp * lq;
        if (best == null || v > best) best = v;
      }
    }
  }
  return best;
}

function addressOf(tx: TradingVolumeTxInput): string | null {
  const direct = (tx.tokenAddress || tx.token_address || '').trim();
  if (direct) return direct;

  // Prefer address from the highest-priced / first named leg
  const legs = transferLegs(tx);
  let bestAddr: string | null = null;
  let bestUsd = -1;
  for (const leg of legs) {
    const addr = (leg.tokenAddress || '').trim();
    if (!addr) continue;
    const usd = positiveUsd(leg.valueUsd) ?? 0;
    if (!bestAddr || usd > bestUsd) {
      bestAddr = addr;
      bestUsd = usd;
    }
  }
  return bestAddr;
}

/**
 * Human-readable token label for UI.
 * Prefer real symbol → name → truncated address → "Unknown token".
 * Never emit the raw "UNKNOWN" placeholder from providers.
 */
export function displayTokenLabel(tx: TradingVolumeTxInput): string {
  const rowSym = (tx.tokenSymbol || tx.token_symbol || '').trim();
  if (!isMissingSymbol(rowSym)) return rowSym;

  const rowName = (tx.tokenName || tx.token_name || '').trim();
  if (rowName && !isMissingSymbol(rowName)) return rowName;

  const legs = transferLegs(tx);
  // Prefer symbol on the highest-USD leg, then any real symbol/name
  let bestSym: string | null = null;
  let bestUsd = -1;
  for (const leg of legs) {
    const usd = positiveUsd(leg.valueUsd) ?? 0;
    const sym = (leg.tokenSymbol || '').trim();
    const name = (leg.tokenName || '').trim();
    if (!isMissingSymbol(sym) && usd >= bestUsd) {
      bestSym = sym;
      bestUsd = usd;
    } else if (!bestSym && name && !isMissingSymbol(name) && usd >= bestUsd) {
      bestSym = name;
      bestUsd = usd;
    }
  }
  if (bestSym) return bestSym;

  for (const leg of legs) {
    const sym = (leg.tokenSymbol || '').trim();
    if (!isMissingSymbol(sym)) return sym;
    const name = (leg.tokenName || '').trim();
    if (name && !isMissingSymbol(name)) return name;
  }

  const addr = addressOf(tx);
  if (addr) return shortAddress(addr);

  return 'Unknown token';
}

function hashOf(tx: TradingVolumeTxInput): string {
  return (tx.hash || tx.tx_hash || '').trim();
}

function isTrade(tx: TradingVolumeTxInput): boolean {
  return (
    refineTransactionType({
      type: tx.type,
      methodId: tx.methodId ?? tx.method_id,
      methodName: tx.methodName ?? tx.method_name,
      protocol: tx.protocol,
      to: tx.to ?? tx.to_addr,
      direction: tx.direction,
    }) === 'trade'
  );
}

/** Group key: prefer contract address so distinct unknown tokens do not collapse */
function tokenGroupKey(network: string, addr: string | null, label: string): string {
  if (addr) return `${network}:${addr.toLowerCase()}`;
  return `${network}:sym:${label.toLowerCase()}`;
}

const MAX_TRADES_RETURNED = 250;

export function computeTradingVolumeDetail(txs: TradingVolumeTxInput[]): TradingVolumeDetail {
  const totalTxCount = txs.length;
  const tradesRaw: Array<{
    tx: TradingVolumeTxInput;
    ms: number;
    valueUsd: number | null;
    label: string;
    addr: string | null;
  }> = [];

  for (const tx of txs) {
    if (!isTrade(tx)) continue;
    const ms = txTimeMs(tx);
    if (ms == null) continue;
    tradesRaw.push({
      tx,
      ms,
      valueUsd: resolveTradeVolumeUsd(tx),
      label: displayTokenLabel(tx),
      addr: addressOf(tx),
    });
  }

  tradesRaw.sort((a, b) => a.ms - b.ms);

  let totalVolumeUsd = 0;
  let pricedTradeCount = 0;
  let unpricedTradeCount = 0;
  const daily = new Map<string, number>();
  const tokenMap = new Map<
    string,
    {
      tokenSymbol: string;
      tokenAddress: string | null;
      network: string;
      volumeUsd: number;
      tradeCount: number;
      unpriced: boolean;
    }
  >();
  const atoms: TradingVolumeAtom[] = [];

  for (const row of tradesRaw) {
    const { tx, ms, valueUsd, label, addr } = row;
    const network = networkOf(tx);
    const key = tokenGroupKey(network, addr, label);

    if (valueUsd != null) {
      totalVolumeUsd += valueUsd;
      pricedTradeCount++;
      const dk = dayKey(ms);
      daily.set(dk, (daily.get(dk) || 0) + valueUsd);

      const existing = tokenMap.get(key);
      if (existing) {
        existing.volumeUsd += valueUsd;
        existing.tradeCount += 1;
        existing.unpriced = false;
        // Prefer a non-address label when we later resolve a real symbol
        if (isMissingSymbol(existing.tokenSymbol) || existing.tokenSymbol.includes('…')) {
          if (!isMissingSymbol(label) && !label.includes('…')) {
            existing.tokenSymbol = label;
          }
        }
        if (!existing.tokenAddress && addr) existing.tokenAddress = addr;
      } else {
        tokenMap.set(key, {
          tokenSymbol: label,
          tokenAddress: addr,
          network,
          volumeUsd: valueUsd,
          tradeCount: 1,
          unpriced: false,
        });
      }
      atoms.push({
        date: dk,
        tokenSymbol: label,
        tokenAddress: addr,
        network,
        volumeUsd: round2(valueUsd),
      });
    } else {
      unpricedTradeCount++;
      const existing = tokenMap.get(key);
      if (existing) {
        existing.tradeCount += 1;
      } else {
        tokenMap.set(key, {
          tokenSymbol: label,
          tokenAddress: addr,
          network,
          volumeUsd: 0,
          tradeCount: 1,
          unpriced: true,
        });
      }
    }
  }

  totalVolumeUsd = round2(totalVolumeUsd);
  const tradeCount = tradesRaw.length;

  const history: TradingVolumeHistoryPoint[] = [];
  let running = 0;
  const sortedDays = Array.from(daily.keys()).sort();
  for (const date of sortedDays) {
    const dailyUsd = round2(daily.get(date) || 0);
    running = round2(running + dailyUsd);
    history.push({ date, dailyUsd, cumulativeUsd: running });
  }

  const byToken: TradingVolumeByToken[] = Array.from(tokenMap.entries())
    .map(([key, v]) => ({
      key,
      tokenSymbol: v.tokenSymbol,
      tokenAddress: v.tokenAddress,
      network: v.network,
      volumeUsd: round2(v.volumeUsd),
      tradeCount: v.tradeCount,
      pct:
        !v.unpriced && totalVolumeUsd > 0
          ? round2((v.volumeUsd / totalVolumeUsd) * 100)
          : 0,
      unpriced: v.unpriced,
    }))
    // Priced first (by volume), then unpriced groups by trade count
    .sort((a, b) => {
      if (a.unpriced !== b.unpriced) return a.unpriced ? 1 : -1;
      if (b.volumeUsd !== a.volumeUsd) return b.volumeUsd - a.volumeUsd;
      return b.tradeCount - a.tradeCount;
    });

  const tradesNewest = [...tradesRaw].sort((a, b) => b.ms - a.ms).slice(0, MAX_TRADES_RETURNED);
  const trades: TradingVolumeTradeRow[] = tradesNewest.map(({ tx, ms, valueUsd, label, addr }, i) => {
    const hash = hashOf(tx);
    return {
      id: String(tx.id || hash || `${ms}-${i}`),
      hash,
      date: dayKey(ms),
      timestamp: Math.floor(ms / 1000),
      tokenSymbol: label,
      tokenAddress: addr,
      network: networkOf(tx),
      volumeUsd: valueUsd != null ? round2(valueUsd) : null,
      counterparty: tx.counterparty ?? null,
      counterpartyLabel: tx.counterpartyLabel ?? tx.counterparty_label ?? tx.protocol ?? null,
      protocol: tx.protocol ?? null,
      methodName: tx.methodName ?? tx.method_name ?? null,
    };
  });

  const earliestMs = tradesRaw[0]?.ms ?? null;
  const latestMs = tradesRaw.length ? tradesRaw[tradesRaw.length - 1].ms : null;

  const activityPct =
    totalTxCount > 0 && tradeCount > 0 ? round2((tradeCount / totalTxCount) * 100) : null;

  const methodology =
    'All synced trade history. ' +
    'Volume sums positive USD notionals on transactions classified as trade ' +
    '(swaps / DEX activity). Unpriced trades are listed but excluded from totals. ' +
    'Excluded from Inflow / Outflow cash flow.';

  return {
    totalVolumeUsd,
    tradeCount,
    pricedTradeCount,
    unpricedTradeCount,
    totalTxCount,
    activityPct,
    earliestTradeAt: earliestMs != null ? new Date(earliestMs).toISOString() : null,
    latestTradeAt: latestMs != null ? new Date(latestMs).toISOString() : null,
    methodology,
    history,
    byToken,
    atoms,
    trades,
  };
}
