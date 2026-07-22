/**
 * Real portfolio performance history.
 *
 * Sources (merged):
 * 1. Stored daily snapshots from sync (ground truth when present)
 * 2. CoinGecko market charts × current holdings (fills gaps / cold start)
 *
 * Note on (2): uses *current* balances revalued at historical prices —
 * accurate for market moves of today’s holdings, not for past deposits/withdrawals.
 */

import { getPricingService } from '@/lib/pricing/service';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const MAX_SERIES_TOKENS = 15; // rate-limit friendly; covers most portfolio value
const CHART_CONCURRENCY = 3;

export interface HistoryHolding {
  symbol: string;
  address: string;
  balance: number;
  valueUsd: number;
  chainId: number;
  chain?: string;
}

export interface PortfolioHistoryPoint {
  date: string; // YYYY-MM-DD
  value: number;
  /** true when the point comes from a stored sync snapshot */
  fromSnapshot?: boolean;
}

export interface PortfolioHistoryResult {
  points: PortfolioHistoryPoint[];
  source: 'snapshots' | 'market' | 'hybrid' | 'empty';
  methodology: string;
  coverageUsd: number;
  totalValueUsd: number;
  tokensPriced: number;
  tokensSkipped: number;
}

function toDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysToCoinGeckoParam(days: number): number | 'max' {
  if (days <= 0 || days >= 3650) return 'max';
  if (days <= 1) return 1;
  if (days <= 7) return 7;
  if (days <= 14) return 14;
  if (days <= 30) return 30;
  if (days <= 90) return 90;
  if (days <= 180) return 180;
  if (days <= 365) return 365;
  return 'max';
}

function priceOnOrBefore(
  series: Array<[number, number]>,
  dayEndMs: number,
): number | null {
  if (series.length === 0) return null;
  let best: [number, number] | null = null;
  for (const p of series) {
    if (p[0] <= dayEndMs) best = p;
    else break;
  }
  if (best) return best[1];
  // If chart starts after this day, use first available (cold start)
  return series[0][1];
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Build a daily USD series from current holdings × historical market prices.
 */
export async function buildMarketRevaluedHistory(
  holdings: HistoryHolding[],
  days: number,
  liveTotalUsd: number,
): Promise<{
  points: PortfolioHistoryPoint[];
  coverageUsd: number;
  tokensPriced: number;
  tokensSkipped: number;
}> {
  const pricing = getPricingService();
  const sorted = [...holdings]
    .filter(h => h.balance > 0 && h.valueUsd > 0)
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const selected = sorted.slice(0, MAX_SERIES_TOKENS);
  const coverageUsd = selected.reduce((s, h) => s + h.valueUsd, 0);
  const tokensSkipped = Math.max(0, sorted.length - selected.length);
  const cgDays = daysToCoinGeckoParam(days);
  const spanDays = cgDays === 'max' ? 365 : Number(cgDays);

  const charts = await mapPool(selected, CHART_CONCURRENCY, async (h) => {
    const addr = (h.address || '').toLowerCase();
    const isNative = !addr || addr === ZERO_ADDR;

    if (pricing.isStablecoinSymbol(h.symbol)) {
      // Flat $1 series — synthesize from today backwards
      const now = Date.now();
      const synthetic: Array<[number, number]> = [];
      for (let i = spanDays; i >= 0; i--) {
        synthetic.push([now - i * 86_400_000, 1]);
      }
      return { holding: h, series: synthetic };
    }

    let series: Array<[number, number]> = [];
    if (isNative) {
      const coinId = pricing.getNativeCoinId(h.chainId || 1);
      series = await pricing.getCoinMarketChart(coinId, cgDays);
    } else {
      series = await pricing.getTokenMarketChart(h.chainId || 1, addr, cgDays);
      // Fallback: if contract chart empty, try native for well-known wrapped symbols
      if (series.length === 0 && ['WETH', 'ETH'].includes(h.symbol.toUpperCase())) {
        series = await pricing.getCoinMarketChart('ethereum', cgDays);
      }
      if (series.length === 0 && ['WBNB', 'BNB'].includes(h.symbol.toUpperCase())) {
        series = await pricing.getCoinMarketChart('binancecoin', cgDays);
      }
      if (series.length === 0 && ['SOL', 'WSOL'].includes(h.symbol.toUpperCase())) {
        series = await pricing.getCoinMarketChart('solana', cgDays);
      }
    }

    return { holding: h, series };
  });

  const priced = charts.filter(c => c.series.length > 0);
  if (priced.length === 0) {
    return { points: [], coverageUsd: 0, tokensPriced: 0, tokensSkipped: sorted.length };
  }

  const scale =
    liveTotalUsd > 0 && coverageUsd > 0 ? liveTotalUsd / coverageUsd : 1;

  // 24H: use hourly buckets from CoinGecko series (more useful than 2 daily points)
  if (days > 0 && days <= 1) {
    const buckets = new Map<string, number>();
    const now = Date.now();
    const start = now - 24 * 3_600_000;
    for (let t = start; t <= now; t += 3_600_000) {
      const key = new Date(t).toISOString().slice(0, 13); // YYYY-MM-DDTHH
      let sum = 0;
      for (const { holding, series } of priced) {
        const px = priceOnOrBefore(series, t);
        if (px != null) sum += holding.balance * px;
      }
      buckets.set(key, Math.round(sum * scale * 100) / 100);
    }
    const points: PortfolioHistoryPoint[] = Array.from(buckets.entries()).map(([hour, value]) => ({
      date: `${hour}:00:00.000Z`,
      value,
      fromSnapshot: false,
    }));
    if (liveTotalUsd > 0 && points.length > 0) {
      points[points.length - 1] = {
        ...points[points.length - 1],
        value: Math.round(liveTotalUsd * 100) / 100,
      };
    }
    return {
      points,
      coverageUsd,
      tokensPriced: priced.length,
      tokensSkipped,
    };
  }

  // Build day keys from the densest series (or last N days)
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const dayKeys: string[] = [];
  const span = days <= 0 ? 365 : Math.min(days, 365);
  for (let i = span; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const points: PortfolioHistoryPoint[] = dayKeys.map((date) => {
    const dayEndMs = Date.parse(`${date}T23:59:59.999Z`);
    let sum = 0;
    for (const { holding, series } of priced) {
      const px = priceOnOrBefore(series, dayEndMs);
      if (px != null) sum += holding.balance * px;
    }
    return {
      date,
      value: Math.round(sum * scale * 100) / 100,
      fromSnapshot: false,
    };
  });

  // Anchor last point to live portfolio total when available
  if (liveTotalUsd > 0 && points.length > 0) {
    points[points.length - 1] = {
      ...points[points.length - 1],
      value: Math.round(liveTotalUsd * 100) / 100,
    };
  }

  return {
    points,
    coverageUsd,
    tokensPriced: priced.length,
    tokensSkipped,
  };
}

/**
 * Merge stored snapshots with market-revalued series.
 * Snapshots win on overlapping dates.
 */
export function mergeHistorySeries(
  market: PortfolioHistoryPoint[],
  snapshots: PortfolioHistoryPoint[],
): { points: PortfolioHistoryPoint[]; source: PortfolioHistoryResult['source'] } {
  if (snapshots.length === 0 && market.length === 0) {
    return { points: [], source: 'empty' };
  }
  if (snapshots.length === 0) return { points: market, source: 'market' };
  if (market.length === 0) return { points: snapshots, source: 'snapshots' };

  const byDate = new Map<string, PortfolioHistoryPoint>();
  for (const p of market) byDate.set(p.date, p);
  for (const p of snapshots) {
    byDate.set(p.date, { ...p, fromSnapshot: true });
  }

  const points = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return { points, source: 'hybrid' };
}

export function filterPointsByDays(
  points: PortfolioHistoryPoint[],
  days: number,
): PortfolioHistoryPoint[] {
  if (days <= 0 || points.length === 0) return points;
  const cutoffMs = Date.now() - days * 86_400_000;
  return points.filter(p => {
    const t = Date.parse(p.date.length === 10 ? `${p.date}T00:00:00.000Z` : p.date);
    return Number.isFinite(t) ? t >= cutoffMs : true;
  });
}

export function methodologyFor(
  source: PortfolioHistoryResult['source'],
  tokensPriced: number,
  tokensSkipped: number,
): string {
  switch (source) {
    case 'snapshots':
      return 'Daily sync snapshots of your portfolio value';
    case 'market':
      return `Market revaluation of current holdings (${tokensPriced} priced${tokensSkipped ? `, ${tokensSkipped} smaller skipped` : ''}) via CoinGecko`;
    case 'hybrid':
      return `Sync snapshots where available, otherwise market revaluation of current holdings (${tokensPriced} tokens)`;
    default:
      return 'No history available yet';
  }
}
