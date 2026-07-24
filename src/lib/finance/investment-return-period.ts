/**
 * Client-side period filtering for Investment Return detail.
 *
 * Period total PnL = cumulative pnl(end) − pnl(start) from daily history.
 * Realized in-window uses lot/asset closed_at when available.
 * Unrealized (live mark-to-market) only when the window ends today.
 */

import type {
  InvestmentReturnAsset,
  InvestmentReturnAssetDetail,
  InvestmentReturnDetail,
  InvestmentReturnHistoryPoint,
} from '@/lib/finance/investment-return';

export const INVESTMENT_RETURN_PERIODS = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
] as const;

export type InvestmentReturnPeriodDays = (typeof INVESTMENT_RETURN_PERIODS)[number]['days'];

const USD_EPS = 1e-8;

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toDateOnly(isoOrDate: string): string {
  if (!isoOrDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate.slice(0, 10);
  // Use UTC calendar day to match snapshot_date storage
  return d.toISOString().slice(0, 10);
}

export function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Subtract calendar days from a YYYY-MM-DD string (UTC). */
export function subtractDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function clampDateOnly(value: string, min: string, max: string): string {
  let v = value;
  if (min && v < min) v = min;
  if (max && v > max) v = max;
  return v;
}

export interface PeriodRange {
  /** Effective chart/window start (clamped to baseline). */
  from: string;
  /** Effective window end (≤ today). */
  to: string;
  /** Wallet connect / baseline date (always shown as From in UI). */
  baseline: string;
  /** True when period is All and to is the latest available end. */
  isAll: boolean;
}

/**
 * Resolve effective [from, to] for a period selection.
 * Start is always ≥ baseline. End is customTo (or today), capped at today.
 */
export function resolvePeriodRange(opts: {
  periodDays: number;
  baselineAt: string | null;
  customTo?: string | null;
  today?: string;
}): PeriodRange | null {
  const today = opts.today ?? todayDateOnly();
  const baseline = opts.baselineAt ? toDateOnly(opts.baselineAt) : null;
  if (!baseline) return null;

  const to = clampDateOnly(
    opts.customTo ? toDateOnly(opts.customTo) : today,
    baseline,
    today,
  );

  const isAll = opts.periodDays <= 0;
  const from = isAll
    ? baseline
    : clampDateOnly(subtractDays(to, opts.periodDays), baseline, to);

  return { from, to, baseline, isAll };
}

function findPnlAtOrBefore(
  history: InvestmentReturnHistoryPoint[],
  date: string,
): number | null {
  let found: number | null = null;
  for (const p of history) {
    if (p.date <= date) found = p.totalPnlUsd;
    else break;
  }
  return found;
}

function findPnlAtOrAfter(
  history: InvestmentReturnHistoryPoint[],
  date: string,
): number | null {
  for (const p of history) {
    if (p.date >= date) return p.totalPnlUsd;
  }
  return null;
}

export interface PeriodFilteredView {
  range: PeriodRange;
  totalPnlUsd: number;
  returnPct: number | null;
  /** Live unrealized when window ends today; otherwise mark-to-market residual. */
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  /** True when unrealized is live MTM (to === today). */
  unrealizedIsLive: boolean;
  costBasisOpenUsd: number;
  costBasisClosedUsd: number;
  marketValueOpenUsd: number;
  baselineValueUsd: number | null;
  history: InvestmentReturnHistoryPoint[];
  /** Rebased series starting at 0 for the selected window. */
  chartHistory: InvestmentReturnHistoryPoint[];
  assets: InvestmentReturnAsset[];
  periodLabel: string;
  methodologyNote: string;
}

function formatShort(dateOnly: string): string {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateOnly;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function assetOverlapsRange(
  asset: InvestmentReturnAsset,
  from: string,
  to: string,
): boolean {
  const opened = toDateOnly(asset.openedAt);
  const closed = asset.closedAt ? toDateOnly(asset.closedAt) : null;
  if (opened > to) return false;
  if (closed && closed < from) return false;
  return true;
}

function filterAssetsForPeriod(
  assets: InvestmentReturnAsset[],
  range: PeriodRange,
  windowEndsToday: boolean,
): InvestmentReturnAsset[] {
  const { from, to, isAll } = range;

  if (isAll && windowEndsToday) {
    return assets;
  }

  const out: InvestmentReturnAsset[] = [];

  for (const asset of assets) {
    if (!assetOverlapsRange(asset, from, to)) continue;

    const opened = toDateOnly(asset.openedAt);
    const closed = asset.closedAt ? toDateOnly(asset.closedAt) : null;

    // Realized attributable to closes inside the window (best-effort: full lot realized on closed_at)
    let realizedPnlUsd = 0;
    if (closed && closed >= from && closed <= to) {
      realizedPnlUsd = asset.realizedPnlUsd;
    } else if (
      windowEndsToday &&
      asset.status !== 'closed' &&
      asset.realizedPnlUsd !== 0 &&
      opened <= to
    ) {
      // Partial closes without per-event timestamps — include remaining realized only for live "to today"
      // windows that still have open/mixed status (honest when All/live; omit for historical To).
      if (isAll) realizedPnlUsd = asset.realizedPnlUsd;
    }

    const unrealizedPnlUsd =
      windowEndsToday && asset.status !== 'closed' && opened <= to
        ? asset.unrealizedPnlUsd
        : 0;

    const totalPnlUsd = roundUsd(unrealizedPnlUsd + realizedPnlUsd);

    // Skip assets with no attributable period PnL unless All/live (keep full list there)
    if (!isAll && Math.abs(totalPnlUsd) < USD_EPS && asset.status === 'closed' && !closed) {
      continue;
    }
    if (
      !windowEndsToday &&
      Math.abs(realizedPnlUsd) < USD_EPS &&
      asset.status !== 'closed'
    ) {
      // Historical window: open holdings lack per-day MTM — omit unless closed in range
      continue;
    }
    if (!isAll && !windowEndsToday && Math.abs(totalPnlUsd) < USD_EPS) {
      continue;
    }

    const endIso = closed && closed <= to ? asset.closedAt! : `${to}T23:59:59.000Z`;
    const startIso = opened < from ? `${from}T00:00:00.000Z` : asset.openedAt;
    const periodLabel =
      closed && closed >= from && closed <= to
        ? `From ${formatShort(opened < from ? from : opened)} to ${formatShort(closed)}`
        : `From ${formatShort(opened < from ? from : opened)} to ${formatShort(to)}`;

    const fromMs = new Date(startIso).getTime();
    const toMs = new Date(endIso).getTime();
    const durationDays = Math.max(
      0,
      Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000)),
    );
    let durationLabel = '—';
    if (Number.isFinite(durationDays)) {
      if (durationDays <= 0) durationLabel = '<1 day';
      else if (durationDays === 1) durationLabel = '1 day';
      else if (durationDays < 60) durationLabel = `${durationDays} days`;
      else {
        const months = Math.round(durationDays / 30.437);
        durationLabel =
          months < 24
            ? months === 1
              ? '1 month'
              : `${months} months`
            : (() => {
                const years = Math.round(durationDays / 365.25);
                return years === 1 ? '1 year' : `${years} years`;
              })();
      }
    }

    const capitalBase = asset.costBasisOpenUsd + asset.costBasisClosedUsd;
    const returnPct =
      capitalBase > USD_EPS ? (totalPnlUsd / capitalBase) * 100 : null;

    out.push({
      ...asset,
      unrealizedPnlUsd: roundUsd(unrealizedPnlUsd),
      realizedPnlUsd: roundUsd(realizedPnlUsd),
      totalPnlUsd,
      returnPct: returnPct != null ? Math.round(returnPct * 100) / 100 : null,
      periodLabel,
      durationLabel,
      durationDays,
    });
  }

  out.sort((a, b) => Math.abs(b.totalPnlUsd) - Math.abs(a.totalPnlUsd));
  return out;
}

/**
 * Apply period filter to a full InvestmentReturnDetail payload (client-side).
 */
export function applyInvestmentReturnPeriod(
  detail: InvestmentReturnDetail,
  opts: {
    periodDays: number;
    customTo?: string | null;
    today?: string;
  },
): PeriodFilteredView | null {
  const range = resolvePeriodRange({
    periodDays: opts.periodDays,
    baselineAt: detail.sinceConnectedAt,
    customTo: opts.customTo,
    today: opts.today,
  });
  if (!range) return null;

  const today = opts.today ?? todayDateOnly();
  const windowEndsToday = range.to >= today;
  const history = detail.history ?? [];

  // All + live end: always use API totals. Never derive via history delta —
  // same-day connect pads history as [{date:today, totalPnlUsd:live}], which
  // would make pnl(end)−pnl(start)=0 and zero the hero incorrectly.
  if (range.isAll && windowEndsToday) {
    const assets = detail.assets ?? [];
    const denom =
      (detail.costBasisOpenUsd + detail.costBasisClosedUsd > USD_EPS
        ? detail.costBasisOpenUsd + detail.costBasisClosedUsd
        : detail.baselineValueUsd) || 0;
    const returnPct =
      detail.returnPct != null
        ? detail.returnPct
        : denom > USD_EPS
          ? Math.round((detail.totalPnlUsd / denom) * 10000) / 100
          : null;

    let windowPoints = history.filter(p => p.date >= range.from && p.date <= range.to);
    if (windowPoints.length === 0 && history.length > 0) {
      const before = [...history].reverse().find(p => p.date <= range.to);
      if (before) windowPoints = [before];
    }
    const byDate = new Map(windowPoints.map(p => [p.date, p.totalPnlUsd]));
    // Baseline is the zero reference for investment return (even if history
    // was overwritten with today's live PnL when baseline === today).
    byDate.set(range.from, 0);
    byDate.set(range.to, detail.totalPnlUsd);

    const chartHistory: InvestmentReturnHistoryPoint[] = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, totalPnlUsd]) => ({
        date,
        totalPnlUsd: roundUsd(totalPnlUsd),
      }));

    // Same calendar day can't hold both 0 and live on one key — synthesize
    // a two-point curve so the chart isn't a flat live-only stub.
    const chartForDisplay =
      range.from === range.to
        ? [
            { date: range.from, totalPnlUsd: 0 },
            { date: range.to, totalPnlUsd: roundUsd(detail.totalPnlUsd) },
          ]
        : chartHistory;

    return {
      range,
      totalPnlUsd: roundUsd(detail.totalPnlUsd),
      returnPct,
      unrealizedPnlUsd: detail.unrealizedPnlUsd,
      realizedPnlUsd: detail.realizedPnlUsd,
      unrealizedIsLive: true,
      costBasisOpenUsd: detail.costBasisOpenUsd,
      costBasisClosedUsd: detail.costBasisClosedUsd,
      marketValueOpenUsd: detail.marketValueOpenUsd,
      baselineValueUsd: detail.baselineValueUsd,
      history: chartForDisplay.map(p => ({
        date: p.date,
        totalPnlUsd: roundUsd(p.totalPnlUsd),
      })),
      chartHistory: chartForDisplay,
      assets,
      periodLabel: `From ${formatShort(range.baseline)} to ${formatShort(range.to)}`,
      methodologyNote:
        'Total return since connect uses live mark-to-market vs lot cost basis. Chart shows cumulative PnL from the connect baseline.',
    };
  }

  // Anchor start PnL: cumulative value at window open.
  // Connect/baseline day is always the $0 reference for investment return
  // (history may incorrectly store live PnL on the baseline date when
  // baseline === today via ensureBaselineAndToday).
  let pnlStart: number;
  if (range.from === range.baseline) {
    pnlStart = 0;
  } else {
    pnlStart =
      findPnlAtOrBefore(history, range.from) ??
      findPnlAtOrAfter(history, range.from) ??
      0;
  }

  // Prefer live total when window ends today (fresher than last snapshot)
  const pnlEnd = windowEndsToday
    ? detail.totalPnlUsd
    : (findPnlAtOrBefore(history, range.to) ?? pnlStart);

  let totalPnlUsd = roundUsd(pnlEnd - pnlStart);

  // Short windows with no history before `from`: avoid a fake $0 hero when live
  // total is non-zero — fall back to live since-connect (best-effort).
  let usedLiveFallback = false;
  if (
    windowEndsToday &&
    range.from !== range.baseline &&
    Math.abs(totalPnlUsd) < USD_EPS &&
    Math.abs(detail.totalPnlUsd) > USD_EPS &&
    !history.some(p => p.date < range.from)
  ) {
    totalPnlUsd = roundUsd(detail.totalPnlUsd);
    usedLiveFallback = true;
  }

  // Chart: points in [from, to], rebased to period start
  let windowPoints = history.filter(p => p.date >= range.from && p.date <= range.to);
  if (windowPoints.length === 0 && history.length > 0) {
    const before = [...history].reverse().find(p => p.date <= range.to);
    if (before) windowPoints = [before];
  }
  // Ensure endpoints exist for a readable curve
  const byDate = new Map(windowPoints.map(p => [p.date, p.totalPnlUsd]));
  if (!byDate.has(range.from)) byDate.set(range.from, pnlStart);
  if (windowEndsToday) {
    byDate.set(range.to, detail.totalPnlUsd);
  } else if (!byDate.has(range.to)) {
    byDate.set(range.to, pnlEnd);
  }
  const chartHistory: InvestmentReturnHistoryPoint[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalPnlUsd]) => ({
      date,
      totalPnlUsd: roundUsd(totalPnlUsd - pnlStart),
    }));

  const filteredHistory: InvestmentReturnHistoryPoint[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalPnlUsd]) => ({ date, totalPnlUsd: roundUsd(totalPnlUsd) }));

  // Realized in window from assets (closed_at timestamps)
  const assets = filterAssetsForPeriod(detail.assets ?? [], range, windowEndsToday);
  const realizedFromAssets = roundUsd(
    assets.reduce((s, a) => s + a.realizedPnlUsd, 0),
  );

  let realizedPnlUsd: number;
  let unrealizedPnlUsd: number;
  const unrealizedIsLive = windowEndsToday;

  if (windowEndsToday) {
    // Live end: realized ≈ closes in window (asset heuristic); residual → unrealized/MTM change
    realizedPnlUsd = realizedFromAssets;
    unrealizedPnlUsd = roundUsd(totalPnlUsd - realizedPnlUsd);
  } else {
    // Historical end: prefer realized-in-window; residual is period MTM change (not live unrealized)
    realizedPnlUsd = realizedFromAssets;
    unrealizedPnlUsd = roundUsd(totalPnlUsd - realizedPnlUsd);
  }

  const denom =
    (detail.costBasisOpenUsd + detail.costBasisClosedUsd > USD_EPS
      ? detail.costBasisOpenUsd + detail.costBasisClosedUsd
      : detail.baselineValueUsd) || 0;
  const returnPct =
    denom > USD_EPS
      ? Math.round((totalPnlUsd / denom) * 10000) / 100
      : null;

  const periodLabel = range.isAll
    ? `From ${formatShort(range.baseline)} to ${formatShort(range.to)}`
    : `${formatShort(range.from)} → ${formatShort(range.to)}`;

  const methodologyNote = usedLiveFallback
    ? 'Limited daily history for this window — showing best-effort live return since connect until more sync snapshots accumulate.'
    : windowEndsToday
      ? 'Period total is change in cumulative return over the selected window (pnl_end − pnl_start). Realized uses lot exit dates in range; unrealized is the remaining mark-to-market change.'
      : 'Period total is change in cumulative return to the selected end date (pnl_end − pnl_start). Unrealized is not reconstructed historically — residual after realized-in-window is period mark-to-market change.';

  return {
    range,
    totalPnlUsd,
    returnPct,
    unrealizedPnlUsd,
    realizedPnlUsd,
    unrealizedIsLive,
    costBasisOpenUsd: detail.costBasisOpenUsd,
    costBasisClosedUsd: detail.costBasisClosedUsd,
    marketValueOpenUsd: windowEndsToday ? detail.marketValueOpenUsd : 0,
    baselineValueUsd: detail.baselineValueUsd,
    history: filteredHistory,
    chartHistory,
    assets,
    periodLabel,
    methodologyNote,
  };
}

/**
 * Period filter for a single-asset investment-return detail payload.
 * Reuses wallet-level period math by projecting the asset into a mini detail shape.
 */
export function applyInvestmentReturnAssetPeriod(
  detail: InvestmentReturnAssetDetail,
  opts: {
    periodDays: number;
    customTo?: string | null;
    today?: string;
  },
): PeriodFilteredView | null {
  const asset = detail.asset;
  const capitalBase = asset.costBasisOpenUsd + asset.costBasisClosedUsd;
  const mini: InvestmentReturnDetail = {
    totalPnlUsd: asset.totalPnlUsd,
    unrealizedPnlUsd: asset.unrealizedPnlUsd,
    realizedPnlUsd: asset.realizedPnlUsd,
    costBasisOpenUsd: asset.costBasisOpenUsd,
    costBasisClosedUsd: asset.costBasisClosedUsd,
    marketValueOpenUsd: asset.marketValueOpenUsd,
    returnPct: asset.returnPct,
    methodology: detail.methodology,
    lotsCount: asset.lotsCount,
    openLotsCount: asset.status === 'closed' ? 0 : 1,
    sinceConnectedAt: detail.sinceConnectedAt || asset.openedAt,
    baselineValueUsd: capitalBase > USD_EPS ? capitalBase : null,
    trackingActive: detail.trackingActive,
    assets: [asset],
    history: detail.history,
    historySource: detail.historySource === 'lot_lifecycle' ? 'daily' : detail.historySource,
    historyMethodology: detail.historyMethodology,
  };

  // Prefer asset open date as period baseline floor when later than wallet connect
  const walletBaseline = detail.sinceConnectedAt
    ? toDateOnly(detail.sinceConnectedAt)
    : null;
  const assetOpen = toDateOnly(asset.openedAt);
  const effectiveBaseline =
    walletBaseline && assetOpen && assetOpen > walletBaseline
      ? asset.openedAt
      : detail.sinceConnectedAt || asset.openedAt;

  return applyInvestmentReturnPeriod(
    { ...mini, sinceConnectedAt: effectiveBaseline },
    opts,
  );
}
