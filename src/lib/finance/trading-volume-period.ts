/**
 * Client-side period filtering for Trading Volume detail.
 * From is clamped to earliest trade (full synced history), never wallet connect.
 */

import {
  clampDateOnly,
  resolvePeriodRange,
  subtractDays,
  todayDateOnly,
  toDateOnly,
  type InvestmentReturnPeriodDays,
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

function rebuildByTokenFromAtoms(
  atoms: TradingVolumeAtom[],
  from: string,
  to: string,
): { byToken: TradingVolumeByToken[]; totalVolumeUsd: number; pricedCount: number } {
  const map = new Map<
    string,
    { tokenSymbol: string; network: string; volumeUsd: number; tradeCount: number }
  >();
  let total = 0;
  let pricedCount = 0;
  for (const a of atoms) {
    if (a.date < from || a.date > to || a.volumeUsd <= 0) continue;
    pricedCount++;
    total += a.volumeUsd;
    const key = `${a.network}:${a.tokenSymbol.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.volumeUsd += a.volumeUsd;
      existing.tradeCount += 1;
    } else {
      map.set(key, {
        tokenSymbol: a.tokenSymbol,
        network: a.network,
        volumeUsd: a.volumeUsd,
        tradeCount: 1,
      });
    }
  }
  total = round2(total);
  const byToken = Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      tokenSymbol: v.tokenSymbol,
      tokenAddress: null as string | null,
      network: v.network,
      volumeUsd: round2(v.volumeUsd),
      tradeCount: v.tradeCount,
      pct: total > 0 ? round2((v.volumeUsd / total) * 100) : 0,
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd);
  return { byToken, totalVolumeUsd: total, pricedCount };
}

/**
 * Apply period / custom To filter to a full TradingVolumeDetail payload.
 */
export function applyTradingVolumePeriod(
  detail: TradingVolumeDetail,
  opts: {
    periodDays: TradingVolumePeriodDays;
    customTo?: string | null;
    today?: string;
  },
): TradingVolumePeriodView | null {
  const today = opts.today ?? todayDateOnly();
  const earliest = detail.earliestTradeAt ? toDateOnly(detail.earliestTradeAt) : null;
  if (!earliest) {
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

  const range = resolvePeriodRange({
    periodDays: opts.periodDays,
    baselineAt: earliest,
    customTo: opts.customTo,
    today,
  });
  if (!range) return null;

  const { from, to, isAll } = range;
  const showingLiveAll = isAll && !opts.customTo;

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
      methodologyNote:
        'Full synced trade history · From = earliest trade (not wallet connect).',
    };
  }

  const { byToken, totalVolumeUsd, pricedCount } = rebuildByTokenFromAtoms(
    detail.atoms,
    from,
    to,
  );
  // Approximate unpriced in-window from ratio if needed; prefer counting from filtered trades list
  const unpricedInList = trades.filter(t => t.volumeUsd == null).length;
  const tradeCount = pricedCount + unpricedInList;
  const activityPct =
    detail.totalTxCount > 0 && tradeCount > 0
      ? round2((tradeCount / detail.totalTxCount) * 100)
      : null;

  return {
    totalVolumeUsd,
    tradeCount,
    pricedTradeCount: pricedCount,
    unpricedTradeCount: unpricedInList,
    activityPct,
    periodLabel: formatPeriodLabel(from, to, false),
    from,
    to,
    chartHistory,
    byToken,
    trades,
    methodologyNote:
      'Period volume from synced trade aggregates · From = earliest trade (not wallet connect).',
  };
}

export function resolveTradingVolumeRange(opts: {
  periodDays: number;
  earliestTradeAt: string | null;
  customTo?: string | null;
  today?: string;
}) {
  return resolvePeriodRange({
    periodDays: opts.periodDays,
    baselineAt: opts.earliestTradeAt,
    customTo: opts.customTo,
    today: opts.today,
  });
}

export { toDateOnly, todayDateOnly, subtractDays, clampDateOnly };
