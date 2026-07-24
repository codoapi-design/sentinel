/**
 * Client-side period filtering for Trading Volume detail.
 * Period pills use earliest trade as the floor; custom range uses user From+To
 * (From ≤ To ≤ today). From before earliest simply yields whatever trades exist.
 */

import {
  clampDateOnly,
  resolvePeriodRange,
  subtractDays,
  todayDateOnly,
  toDateOnly,
  type InvestmentReturnPeriodDays,
  type PeriodRange,
} from '@/lib/finance/investment-return-period';
import type {
  TradingVolumeAtom,
  TradingVolumeByToken,
  TradingVolumeDetail,
  TradingVolumeHistoryPoint,
  TradingVolumeTradeRow,
} from '@/lib/finance/trading-volume';

export { INVESTMENT_RETURN_PERIODS as TRADING_VOLUME_PERIODS } from '@/lib/finance/investment-return-period';
export type TradingVolumePeriodDays = InvestmentReturnPeriodDays;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface TradingVolumePeriodView {
  totalVolumeUsd: number;
  tradeCount: number;
  pricedTradeCount: number;
  unpricedTradeCount: number;
  activityPct: number | null;
  periodLabel: string;
  from: string;
  to: string;
  /** Period-relative cumulative chart (starts at 0) */
  chartHistory: Array<{ date: string; cumulativeUsd: number; dailyUsd: number }>;
  byToken: TradingVolumeByToken[];
  trades: TradingVolumeTradeRow[];
  methodologyNote: string;
}

function formatPeriodLabel(from: string, to: string, isAll: boolean): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00.000Z`).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  if (isAll) return `All history · ${fmt(from)} → ${fmt(to)}`;
  return `${fmt(from)} → ${fmt(to)}`;
}

function rebuildHistoryInWindow(
  history: TradingVolumeHistoryPoint[],
  from: string,
  to: string,
): Array<{ date: string; cumulativeUsd: number; dailyUsd: number }> {
  const inWindow = history.filter(p => p.date >= from && p.date <= to);
  if (inWindow.length === 0) return [];

  const spanDays = Math.max(
    1,
    Math.round(
      (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
    ) + 1,
  );

  // Long spans: emit active days only (period-relative cumulative)
  if (spanDays > 400) {
    let running = 0;
    return inWindow.map(p => {
      running = round2(running + p.dailyUsd);
      return { date: p.date, dailyUsd: p.dailyUsd, cumulativeUsd: running };
    });
  }

  const byDate = new Map(inWindow.map(p => [p.date, p.dailyUsd]));
  const out: Array<{ date: string; cumulativeUsd: number; dailyUsd: number }> = [];
  let running = 0;
  let cursor = from;
  while (cursor <= to) {
    const dailyUsd = round2(byDate.get(cursor) || 0);
    running = round2(running + dailyUsd);
    out.push({ date: cursor, dailyUsd, cumulativeUsd: running });
    const d = new Date(`${cursor}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return out;
}

function atomGroupKey(a: TradingVolumeAtom): string {
  if (a.tokenAddress) return `${a.network}:${a.tokenAddress.toLowerCase()}`;
  return `${a.network}:sym:${a.tokenSymbol.toLowerCase()}`;
}

function rebuildByTokenFromAtoms(
  atoms: TradingVolumeAtom[],
  from: string,
  to: string,
  unpricedTrades: TradingVolumeTradeRow[],
): { byToken: TradingVolumeByToken[]; totalVolumeUsd: number; pricedCount: number } {
  const map = new Map<
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
  let total = 0;
  let pricedCount = 0;
  for (const a of atoms) {
    if (a.date < from || a.date > to || a.volumeUsd <= 0) continue;
    pricedCount++;
    total += a.volumeUsd;
    const key = atomGroupKey(a);
    const existing = map.get(key);
    if (existing) {
      existing.volumeUsd += a.volumeUsd;
      existing.tradeCount += 1;
      existing.unpriced = false;
      if (!existing.tokenAddress && a.tokenAddress) existing.tokenAddress = a.tokenAddress;
    } else {
      map.set(key, {
        tokenSymbol: a.tokenSymbol,
        tokenAddress: a.tokenAddress,
        network: a.network,
        volumeUsd: a.volumeUsd,
        tradeCount: 1,
        unpriced: false,
      });
    }
  }

  // Fold unpriced trades into by-token (excluded from volume totals)
  for (const t of unpricedTrades) {
    if (t.volumeUsd != null) continue;
    const key = t.tokenAddress
      ? `${t.network}:${t.tokenAddress.toLowerCase()}`
      : `${t.network}:sym:${t.tokenSymbol.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.tradeCount += 1;
    } else {
      map.set(key, {
        tokenSymbol: t.tokenSymbol,
        tokenAddress: t.tokenAddress,
        network: t.network,
        volumeUsd: 0,
        tradeCount: 1,
        unpriced: true,
      });
    }
  }

  total = round2(total);
  const byToken = Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      tokenSymbol: v.tokenSymbol,
      tokenAddress: v.tokenAddress,
      network: v.network,
      volumeUsd: round2(v.volumeUsd),
      tradeCount: v.tradeCount,
      pct: !v.unpriced && total > 0 ? round2((v.volumeUsd / total) * 100) : 0,
      unpriced: v.unpriced,
    }))
    .sort((a, b) => {
      if (a.unpriced !== b.unpriced) return a.unpriced ? 1 : -1;
      if (b.volumeUsd !== a.volumeUsd) return b.volumeUsd - a.volumeUsd;
      return b.tradeCount - a.tradeCount;
    });
  return { byToken, totalVolumeUsd: total, pricedCount };
}

/**
 * Resolve [from, to] for trading volume.
 * Custom range uses user From+To with From ≤ To ≤ today (no earliest lock).
 * Period pills still floor at earliest trade when present.
 */
export function resolveTradingVolumeRange(opts: {
  periodDays: number;
  earliestTradeAt: string | null;
  customFrom?: string | null;
  customTo?: string | null;
  today?: string;
}): PeriodRange | null {
  const today = opts.today ?? todayDateOnly();
  const earliest = opts.earliestTradeAt ? toDateOnly(opts.earliestTradeAt) : null;

  if (opts.customFrom) {
    let to = opts.customTo ? toDateOnly(opts.customTo) : today;
    if (to > today) to = today;
    let from = toDateOnly(opts.customFrom);
    if (from > to) from = to;
    return {
      from,
      to,
      baseline: earliest ?? from,
      isAll: false,
    };
  }

  if (!earliest) return null;

  return resolvePeriodRange({
    periodDays: opts.periodDays,
    baselineAt: earliest,
    customTo: opts.customTo,
    today,
  });
}

/**
 * Apply period / custom From+To filter to a full TradingVolumeDetail payload.
 */
export function applyTradingVolumePeriod(
  detail: TradingVolumeDetail,
  opts: {
    periodDays: TradingVolumePeriodDays;
    customFrom?: string | null;
    customTo?: string | null;
    today?: string;
  },
): TradingVolumePeriodView | null {
  const today = opts.today ?? todayDateOnly();
  const earliest = detail.earliestTradeAt ? toDateOnly(detail.earliestTradeAt) : null;
  const hasCustomRange = Boolean(opts.customFrom);

  if (!earliest && !hasCustomRange) {
    return {
      totalVolumeUsd: 0,
      tradeCount: 0,
      pricedTradeCount: 0,
      unpricedTradeCount: 0,
      activityPct: null,
      periodLabel: 'No trades',
      from: today,
      to: today,
      chartHistory: [],
      byToken: [],
      trades: [],
      methodologyNote: 'No trade-classified transactions in synced history.',
    };
  }

  const range = resolveTradingVolumeRange({
    periodDays: opts.periodDays,
    earliestTradeAt: detail.earliestTradeAt,
    customFrom: opts.customFrom,
    customTo: opts.customTo,
    today,
  });
  if (!range) return null;

  const { from, to, isAll } = range;
  const showingLiveAll = isAll && !hasCustomRange && !opts.customTo;

  const chartHistory = rebuildHistoryInWindow(detail.history, from, to);
  const trades = detail.trades.filter(t => {
    const d = toDateOnly(t.date || new Date(t.timestamp * 1000).toISOString());
    return d >= from && d <= to;
  });

  if (showingLiveAll) {
    return {
      totalVolumeUsd: detail.totalVolumeUsd,
      tradeCount: detail.tradeCount,
      pricedTradeCount: detail.pricedTradeCount,
      unpricedTradeCount: detail.unpricedTradeCount,
      activityPct: detail.activityPct,
      periodLabel: formatPeriodLabel(from, to, true),
      from,
      to,
      chartHistory,
      byToken: detail.byToken,
      trades,
      methodologyNote: 'Full synced trade history.',
    };
  }

  const unpricedInList = trades.filter(t => t.volumeUsd == null);
  const { byToken, totalVolumeUsd, pricedCount } = rebuildByTokenFromAtoms(
    detail.atoms,
    from,
    to,
    unpricedInList,
  );
  const tradeCount = pricedCount + unpricedInList.length;
  const activityPct =
    detail.totalTxCount > 0 && tradeCount > 0
      ? round2((tradeCount / detail.totalTxCount) * 100)
      : null;

  return {
    totalVolumeUsd,
    tradeCount,
    pricedTradeCount: pricedCount,
    unpricedTradeCount: unpricedInList.length,
    activityPct,
    periodLabel: formatPeriodLabel(from, to, false),
    from,
    to,
    chartHistory,
    byToken,
    trades,
    methodologyNote: hasCustomRange
      ? 'Custom range volume from synced trade aggregates.'
      : 'Period volume from synced trade aggregates.',
  };
}

export { toDateOnly, todayDateOnly, subtractDays, clampDateOnly };
