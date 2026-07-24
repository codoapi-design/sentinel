/**
 * Trading volume detail from synced wallet transactions.
 *
 * Full history of trade-classified txs (not limited to since connected).
 * Volume = sum of positive USD notionals via resolveTxValueUsd — same rule
 * as the dashboard Trading volume card / computeFinancialSummary.
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
  token_address?: string | null;
  tokenAddress?: string | null;
  counterparty?: string | null;
  counterparty_label?: string | null;
  counterpartyLabel?: string | null;
  protocol?: string | null;
  method_name?: string | null;
  methodName?: string | null;
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
  /** Share of priced volume (0–100) */
  pct: number;
}

export interface TradingVolumeTradeRow {
  id: string;
  hash: string;
  date: string;
  timestamp: number;
  tokenSymbol: string;
  network: string;
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

function symbolOf(tx: TradingVolumeTxInput): string {
  const s = (tx.tokenSymbol || tx.token_symbol || '').trim();
  return s || 'UNKNOWN';
}

function addressOf(tx: TradingVolumeTxInput): string | null {
  const a = (tx.tokenAddress || tx.token_address || '').trim();
  return a || null;
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

const MAX_TRADES_RETURNED = 250;

export function computeTradingVolumeDetail(txs: TradingVolumeTxInput[]): TradingVolumeDetail {
  const totalTxCount = txs.length;
  const tradesRaw: Array<{
    tx: TradingVolumeTxInput;
    ms: number;
    valueUsd: number | null;
  }> = [];

  for (const tx of txs) {
    if (!isTrade(tx)) continue;
    const ms = txTimeMs(tx);
    if (ms == null) continue;
    tradesRaw.push({ tx, ms, valueUsd: resolveTxValueUsd(tx) });
  }

  tradesRaw.sort((a, b) => a.ms - b.ms);

  let totalVolumeUsd = 0;
  let pricedTradeCount = 0;
  let unpricedTradeCount = 0;
  const daily = new Map<string, number>();
  const tokenMap = new Map<
    string,
    { tokenSymbol: string; tokenAddress: string | null; network: string; volumeUsd: number; tradeCount: number }
  >();
  const atoms: TradingVolumeAtom[] = [];

  for (const row of tradesRaw) {
    const { tx, ms, valueUsd } = row;
    if (valueUsd != null) {
      totalVolumeUsd += valueUsd;
      pricedTradeCount++;
      const dk = dayKey(ms);
      daily.set(dk, (daily.get(dk) || 0) + valueUsd);

      const network = networkOf(tx);
      const symbol = symbolOf(tx);
      const addr = addressOf(tx);
      const key = `${network}:${(addr || symbol).toLowerCase()}`;
      const existing = tokenMap.get(key);
      if (existing) {
        existing.volumeUsd += valueUsd;
        existing.tradeCount += 1;
      } else {
        tokenMap.set(key, {
          tokenSymbol: symbol,
          tokenAddress: addr,
          network,
          volumeUsd: valueUsd,
          tradeCount: 1,
        });
      }
      atoms.push({
        date: dk,
        tokenSymbol: symbol,
        network,
        volumeUsd: round2(valueUsd),
      });
    } else {
      unpricedTradeCount++;
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
      pct: totalVolumeUsd > 0 ? round2((v.volumeUsd / totalVolumeUsd) * 100) : 0,
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd);

  const tradesNewest = [...tradesRaw].sort((a, b) => b.ms - a.ms).slice(0, MAX_TRADES_RETURNED);
  const trades: TradingVolumeTradeRow[] = tradesNewest.map(({ tx, ms, valueUsd }, i) => {
    const hash = hashOf(tx);
    return {
      id: String(tx.id || hash || `${ms}-${i}`),
      hash,
      date: dayKey(ms),
      timestamp: Math.floor(ms / 1000),
      tokenSymbol: symbolOf(tx),
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
    'All synced trade history (not limited to since connected). ' +
    'Volume sums positive USD notionals on transactions classified as trade ' +
    '(swaps / DEX activity). Excluded from Inflow / Outflow cash flow.';

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
