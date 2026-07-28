/**
 * Module 01 — Performance Intelligence (Spec §5.1–§5.14).
 *
 * Answers how the portfolio performed, when it changed, and what drove the
 * change: value, ROI, period changes, growth, per-asset contribution,
 * volatility, drawdown, and recovery.
 *
 * `Performance = Value + Trend + Drivers + Context` (Spec §5.2).
 */

import { computeFinancialSummary } from '@/lib/finance/summary';
import {
  buildAssetLedger,
  buildComparison,
  clamp,
  compactEvidence,
  daysBetween,
  deriveConfidence,
  buildDataQuality,
  formatPct,
  formatSignedPct,
  formatUsd,
  lowestConfidence,
  makeInsightId,
  makePatternId,
  pctChange,
  resolvePeriod,
  resolvePortfolioValueUsd,
  resolveSnapshots,
  resolveTransactions,
  round1,
  round2,
  score100,
  sharePct,
  splitByPeriod,
  stdDev,
  sum,
  topN,
  txTimestampMs,
  type AssetLedgerEntry,
  type ResolvedPeriod,
} from './shared';
import type {
  Confidence,
  Insight,
  IntelligenceInput,
  IntelligenceResult,
  InvestmentReturnLike,
  Pattern,
  PeriodComparison,
} from './types';

/** Neutral direction label — never a verdict on quality. */
export type PerformanceDirection =
  | 'improving'
  | 'declining'
  | 'stable'
  | 'volatile'
  | 'recovering'
  | 'unknown';

/** How a contributor's value change was derived — surfaced so callers can gate confidence. */
export type ContributionBasis = 'observed_price' | 'cost_basis_pnl' | 'net_flow' | 'unavailable';

export interface PerformanceContributor {
  symbol: string;
  valueUsd: number;
  allocationPct: number;
  /** Total value change over the window (Spec §5.53). */
  contributionUsd: number;
  /** Share of the portfolio's total change; `null` when the portfolio did not move. */
  contributionPct: number | null;
  /** Value change from price movement alone, excluding transfers. */
  appreciationUsd: number | null;
  priceChangePct: number | null;
  basis: ContributionBasis;
}

export interface PerformanceMetrics {
  periodDays: number;
  currentValueUsd: number;
  previousValueUsd: number | null;
  valueChangeUsd: number | null;
  growthPct: number | null;
  /** Return percentage from the investment-return payload when supplied. */
  roiPct: number | null;
  totalPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  realizedPnlUsd: number | null;
  dailyChange: PeriodComparison | null;
  weeklyChange: PeriodComparison | null;
  monthlyChange: PeriodComparison | null;
  /** Inflow − outflow over the window, from classified transfers. */
  netFlowUsd: number;
  inflowUsd: number;
  outflowUsd: number;
  /** Value change not explained by capital movement. */
  appreciationUsd: number | null;
  /** Standard deviation of daily percentage changes over the window. */
  volatilityPct: number | null;
  /** 0–100 restatement of `volatilityPct`; higher = wider swings. */
  volatilityScore: number | null;
  peakValueUsd: number | null;
  peakDate: string | null;
  troughValueUsd: number | null;
  maxDrawdownPct: number | null;
  currentDrawdownPct: number | null;
  recoveredFromDrawdown: boolean | null;
  recoveryPct: number | null;
  direction: PerformanceDirection;
  snapshotCount: number;
  contributors: PerformanceContributor[];
  topContributor: PerformanceContributor | null;
  topDetractor: PerformanceContributor | null;
}

export type PerformanceIntelligence = IntelligenceResult<PerformanceMetrics>;

const GROWTH_NOISE_PCT = 2;
const DEPOSIT_DRIVEN_SHARE = 40;
const CONCENTRATED_GROWTH_SHARE = 50;
/** Ignore "concentrated" claims when the leader's absolute contribution is noise. */
const MIN_CONCENTRATED_CONTRIBUTION_USD = 25;
/** For IR, leader must also explain a meaningful share of |total PnL|. */
const MIN_IR_CONCENTRATION_OF_TOTAL_PNL_PCT = 20;
const DRAWDOWN_MATERIAL_PCT = 10;
const RECOVERY_MATERIAL_PCT = 5;

export function analyzePerformance(input: IntelligenceInput): PerformanceIntelligence {
  const period = resolvePeriod(input);
  const txs = resolveTransactions(input);
  const dataQuality = buildDataQuality(txs);
  const snapshots = resolveSnapshots(input);
  const currentValueUsd = resolvePortfolioValueUsd(input);

  const split = splitByPeriod(txs, txTimestampMs, period);
  const currentSummary = computeFinancialSummary(split.current, { ethPriceUsd: input.ethPriceUsd ?? null });
  const previousSummary = computeFinancialSummary(split.previous, { ethPriceUsd: input.ethPriceUsd ?? null });
  const netFlowUsd = round2(currentSummary.netFlow);

  const previousValueUsd = valueAt(snapshots, period.currentStart);
  const valueChangeUsd =
    previousValueUsd != null ? round2(currentValueUsd - previousValueUsd) : null;
  const growthPct = previousValueUsd != null ? pctChange(currentValueUsd, previousValueUsd) : null;
  const appreciationUsd = valueChangeUsd != null ? round2(valueChangeUsd - netFlowUsd) : null;

  const investmentReturn = asInvestmentReturn(input.investmentReturn);
  const irFocus = isInvestmentReturnFocus(input, investmentReturn);
  const volatility = computeVolatility(snapshots, period);
  const drawdown = computeDrawdown(snapshots, period);

  const ledger = buildAssetLedger(input, period);
  const irContributors = buildIrContributors(investmentReturn);
  const contributors =
    irContributors.length > 0 ? irContributors : buildContributors(ledger.entries, valueChangeUsd);
  const positiveContributors = contributors.filter(c => c.contributionUsd > 0);
  const negativeContributors = contributors.filter(c => c.contributionUsd < 0);
  const topContributor = positiveContributors[0] ?? null;
  const topDetractor =
    negativeContributors.length > 0
      ? [...negativeContributors].sort((a, b) => a.contributionUsd - b.contributionUsd)[0]
      : null;

  const previousGrowthPct = computePreviousGrowthPct(snapshots, period);
  const direction = resolveDirection({
    growthPct,
    volatilityScore: volatility.score,
    drawdownPct: drawdown.currentDrawdownPct,
    recoveryPct: drawdown.recoveryPct,
    snapshotCount: snapshots.length,
  });

  const metrics: PerformanceMetrics = {
    periodDays: period.days,
    currentValueUsd,
    previousValueUsd,
    valueChangeUsd,
    growthPct,
    roiPct: investmentReturn?.returnPct ?? null,
    totalPnlUsd: investmentReturn?.totalPnlUsd ?? null,
    unrealizedPnlUsd: investmentReturn?.unrealizedPnlUsd ?? null,
    realizedPnlUsd: investmentReturn?.realizedPnlUsd ?? null,
    dailyChange: changeOver(snapshots, currentValueUsd, period, 1),
    weeklyChange: changeOver(snapshots, currentValueUsd, period, 7),
    monthlyChange: changeOver(snapshots, currentValueUsd, period, 30),
    netFlowUsd,
    inflowUsd: round2(currentSummary.totalRevenue),
    outflowUsd: round2(currentSummary.totalExpenses),
    appreciationUsd,
    volatilityPct: volatility.pct,
    volatilityScore: volatility.score,
    peakValueUsd: drawdown.peakValueUsd,
    peakDate: drawdown.peakDate,
    troughValueUsd: drawdown.troughValueUsd,
    maxDrawdownPct: drawdown.maxDrawdownPct,
    currentDrawdownPct: drawdown.currentDrawdownPct,
    recoveredFromDrawdown: drawdown.recovered,
    recoveryPct: drawdown.recoveryPct,
    direction,
    snapshotCount: snapshots.length,
    contributors,
    topContributor,
    topDetractor,
  };

  const confidence = resolveConfidence(
    metrics,
    dataQuality.completeness,
    snapshots.length,
    txs.length,
    investmentReturn,
  );
  const patterns = detectPatterns(metrics, {
    period,
    snapshots,
    previousGrowthPct,
    previousNetFlowUsd: round2(previousSummary.netFlow),
    confidence,
    positiveContributors,
    negativeContributors,
    irFocus,
  });
  const insights = buildInsights(metrics, patterns, period, confidence, irFocus);

  return {
    summary: buildSummary(metrics, period, investmentReturn, irFocus),
    metrics,
    patterns,
    insights,
    confidence,
    evidence: compactEvidence({
      period: period.label,
      current_value_usd: metrics.currentValueUsd,
      previous_value_usd: metrics.previousValueUsd,
      value_change_usd: metrics.valueChangeUsd,
      growth_pct: metrics.growthPct,
      net_flow_usd: metrics.netFlowUsd,
      appreciation_usd: metrics.appreciationUsd,
      roi_pct: metrics.roiPct,
      total_pnl_usd: metrics.totalPnlUsd,
      unrealized_pnl_usd: metrics.unrealizedPnlUsd,
      realized_pnl_usd: metrics.realizedPnlUsd,
      max_drawdown_pct: metrics.maxDrawdownPct,
      volatility_score: metrics.volatilityScore,
      snapshot_count: metrics.snapshotCount,
      direction: metrics.direction,
      since_connected_at: investmentReturn?.sinceConnectedAt,
      cost_basis_open_usd: investmentReturn?.costBasisOpenUsd,
      market_value_open_usd: investmentReturn?.marketValueOpenUsd,
      lots_count: investmentReturn?.lotsCount,
      open_lots_count: investmentReturn?.openLotsCount,
      baseline_value_usd: investmentReturn?.baselineValueUsd,
      history_source: investmentReturn?.historySource,
    }),
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

type SnapshotPoint = { date: string; value: number; ms: number };

/** Latest snapshot value at or before `targetMs`; `null` when history starts later. */
function valueAt(snapshots: SnapshotPoint[], targetMs: number): number | null {
  let found: number | null = null;
  for (const point of snapshots) {
    if (point.ms <= targetMs) found = point.value;
    else break;
  }
  return found != null ? round2(found) : null;
}

function changeOver(
  snapshots: SnapshotPoint[],
  currentValueUsd: number,
  period: ResolvedPeriod,
  days: number,
): PeriodComparison | null {
  if (snapshots.length === 0) return null;
  const previous = valueAt(snapshots, period.now - days * 86_400_000);
  if (previous == null) return null;
  return buildComparison(currentValueUsd, previous);
}

function computeVolatility(
  snapshots: SnapshotPoint[],
  period: ResolvedPeriod,
): { pct: number | null; score: number | null } {
  const window = snapshots.filter(p => p.ms >= period.currentStart && p.ms <= period.currentEnd);
  if (window.length < 3) return { pct: null, score: null };
  const returns: number[] = [];
  for (let i = 1; i < window.length; i += 1) {
    const previous = window[i - 1].value;
    if (previous <= 0) continue;
    returns.push(((window[i].value - previous) / previous) * 100);
  }
  if (returns.length < 2) return { pct: null, score: null };
  const deviation = round2(stdDev(returns));
  // 5% daily standard deviation maps to the top of the 0–100 scale.
  return { pct: deviation, score: score100((deviation / 5) * 100) };
}

interface DrawdownResult {
  peakValueUsd: number | null;
  peakDate: string | null;
  troughValueUsd: number | null;
  maxDrawdownPct: number | null;
  currentDrawdownPct: number | null;
  recovered: boolean | null;
  recoveryPct: number | null;
}

function computeDrawdown(snapshots: SnapshotPoint[], period: ResolvedPeriod): DrawdownResult {
  const window = snapshots.filter(p => p.ms >= period.currentStart && p.ms <= period.currentEnd);
  const empty: DrawdownResult = {
    peakValueUsd: null,
    peakDate: null,
    troughValueUsd: null,
    maxDrawdownPct: null,
    currentDrawdownPct: null,
    recovered: null,
    recoveryPct: null,
  };
  if (window.length < 2) return empty;

  let peak = window[0].value;
  let peakDate = window[0].date;
  let maxDrawdownPct = 0;
  let trough = window[0].value;
  let troughAfterPeak = window[0].value;

  for (const point of window) {
    if (point.value > peak) {
      peak = point.value;
      peakDate = point.date;
      troughAfterPeak = point.value;
    }
    if (point.value < troughAfterPeak) troughAfterPeak = point.value;
    if (point.value < trough) trough = point.value;
    if (peak > 0) {
      const drawdown = ((peak - point.value) / peak) * 100;
      if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
    }
  }

  const last = window[window.length - 1].value;
  const currentDrawdownPct = peak > 0 ? round2(((peak - last) / peak) * 100) : null;
  const recoveryPct = troughAfterPeak > 0 ? round2(((last - troughAfterPeak) / troughAfterPeak) * 100) : null;

  return {
    peakValueUsd: round2(peak),
    peakDate,
    troughValueUsd: round2(trough),
    maxDrawdownPct: round2(maxDrawdownPct),
    currentDrawdownPct,
    recovered: currentDrawdownPct != null ? currentDrawdownPct <= 0.5 : null,
    recoveryPct,
  };
}

function computePreviousGrowthPct(snapshots: SnapshotPoint[], period: ResolvedPeriod): number | null {
  const start = valueAt(snapshots, period.previousStart);
  const end = valueAt(snapshots, period.previousEnd);
  if (start == null || end == null) return null;
  return pctChange(end, start);
}

function buildContributors(
  entries: AssetLedgerEntry[],
  portfolioChangeUsd: number | null,
): PerformanceContributor[] {
  const contributors: PerformanceContributor[] = [];
  for (const entry of entries) {
    const hasValueChange = entry.valueChangeUsd != null;
    const contributionUsd = hasValueChange ? (entry.valueChangeUsd as number) : entry.netFlowUsd;
    const basis: ContributionBasis = hasValueChange
      ? 'observed_price'
      : entry.netFlowUsd !== 0
        ? 'net_flow'
        : 'unavailable';
    if (basis === 'unavailable' && entry.valueUsd <= 0) continue;
    contributors.push({
      symbol: entry.symbol,
      valueUsd: entry.valueUsd,
      allocationPct: entry.allocationPct,
      contributionUsd: round2(contributionUsd),
      contributionPct:
        portfolioChangeUsd != null && portfolioChangeUsd !== 0
          ? round2((contributionUsd / Math.abs(portfolioChangeUsd)) * 100)
          : null,
      appreciationUsd: entry.appreciationUsd,
      priceChangePct: entry.priceChangePct,
      basis,
    });
  }
  return contributors.sort((a, b) =>
    b.contributionUsd === a.contributionUsd
      ? a.symbol.localeCompare(b.symbol)
      : b.contributionUsd - a.contributionUsd,
  );
}

/**
 * Prefer lot-level cost-basis PnL as performance contributors when available.
 * Never mixes transaction net_flow into "share of gain" for these rows.
 */
function buildIrContributors(
  investmentReturn: InvestmentReturnLike | null,
): PerformanceContributor[] {
  const assets = investmentReturn?.assets;
  if (!assets || assets.length === 0) return [];

  const withPnl = assets.filter(
    asset => typeof asset.totalPnlUsd === 'number' && Number.isFinite(asset.totalPnlUsd),
  );
  if (withPnl.length === 0) return [];

  const openMarketTotal = sum(
    withPnl.map(asset =>
      typeof asset.marketValueOpenUsd === 'number' && asset.marketValueOpenUsd > 0
        ? asset.marketValueOpenUsd
        : 0,
    ),
  );
  const totalPnl =
    investmentReturn?.totalPnlUsd != null && Number.isFinite(investmentReturn.totalPnlUsd)
      ? investmentReturn.totalPnlUsd
      : sum(withPnl.map(asset => asset.totalPnlUsd as number));
  const pnlBasis = Math.abs(totalPnl);

  const contributors: PerformanceContributor[] = withPnl.map(asset => {
    const contributionUsd = round2(asset.totalPnlUsd as number);
    const valueUsd =
      typeof asset.marketValueOpenUsd === 'number' && Number.isFinite(asset.marketValueOpenUsd)
        ? round2(asset.marketValueOpenUsd)
        : 0;
    return {
      symbol: asset.tokenSymbol.toUpperCase(),
      valueUsd,
      allocationPct: sharePct(valueUsd, openMarketTotal),
      contributionUsd,
      contributionPct: pnlBasis > 0 ? round2((contributionUsd / pnlBasis) * 100) : null,
      appreciationUsd:
        typeof asset.unrealizedPnlUsd === 'number' && Number.isFinite(asset.unrealizedPnlUsd)
          ? round2(asset.unrealizedPnlUsd)
          : null,
      priceChangePct:
        typeof asset.returnPct === 'number' && Number.isFinite(asset.returnPct)
          ? round2(asset.returnPct)
          : null,
      basis: 'cost_basis_pnl' as const,
    };
  });

  return contributors.sort((a, b) =>
    b.contributionUsd === a.contributionUsd
      ? a.symbol.localeCompare(b.symbol)
      : b.contributionUsd - a.contributionUsd,
  );
}

function isInvestmentReturnFocus(
  input: IntelligenceInput,
  investmentReturn: InvestmentReturnLike | null,
): boolean {
  if (input.analysisFocus === 'investment_return') return true;
  if (!investmentReturn) return false;
  if (investmentReturn.trackingActive !== true) return false;
  const lots = investmentReturn.lotsCount ?? 0;
  return lots > 0 || investmentReturn.returnPct != null || investmentReturn.totalPnlUsd != null;
}

function hasActiveIrTracking(investmentReturn: InvestmentReturnLike | null): boolean {
  if (!investmentReturn || investmentReturn.trackingActive !== true) return false;
  const lots = investmentReturn.lotsCount ?? 0;
  return lots > 0 || investmentReturn.returnPct != null;
}

function resolveDirection(args: {
  growthPct: number | null;
  volatilityScore: number | null;
  drawdownPct: number | null;
  recoveryPct: number | null;
  snapshotCount: number;
}): PerformanceDirection {
  if (args.growthPct == null || args.snapshotCount < 2) return 'unknown';
  if (
    args.drawdownPct != null &&
    args.drawdownPct > DRAWDOWN_MATERIAL_PCT &&
    args.recoveryPct != null &&
    args.recoveryPct >= RECOVERY_MATERIAL_PCT
  ) {
    return 'recovering';
  }
  if (args.volatilityScore != null && args.volatilityScore >= 60) return 'volatile';
  if (args.growthPct > GROWTH_NOISE_PCT) return 'improving';
  if (args.growthPct < -GROWTH_NOISE_PCT) return 'declining';
  return 'stable';
}

function resolveConfidence(
  metrics: PerformanceMetrics,
  completeness: number,
  snapshotCount: number,
  txCount: number,
  investmentReturn: InvestmentReturnLike | null,
): Confidence {
  const base = deriveConfidence(
    {
      transactionCount: txCount,
      pricedCount: Math.round((completeness / 100) * txCount),
      unpricedCount: txCount - Math.round((completeness / 100) * txCount),
      completeness,
    },
    { minSampleForHigh: 15, minSampleForMedium: 3 },
  );
  const irTracked = hasActiveIrTracking(investmentReturn);
  // Trend/drawdown need snapshots. Mark-to-market vs lot cost basis does not —
  // floor IR at medium when lots are active even if daily history is thin.
  const snapshotCap: Confidence = irTracked
    ? snapshotCount >= 14
      ? 'high'
      : 'medium'
    : snapshotCount >= 14
      ? 'high'
      : snapshotCount >= 4
        ? 'medium'
        : 'low';
  // Lot tracking can describe return even when current holdings value is $0.
  const valueCap: Confidence =
    metrics.currentValueUsd > 0 || irTracked ? 'high' : 'low';
  return lowestConfidence(base, snapshotCap, valueCap);
}

// ---------------------------------------------------------------------------
// Patterns (Spec §5.6)
// ---------------------------------------------------------------------------

function detectPatterns(
  metrics: PerformanceMetrics,
  context: {
    period: ResolvedPeriod;
    snapshots: SnapshotPoint[];
    previousGrowthPct: number | null;
    previousNetFlowUsd: number;
    confidence: Confidence;
    positiveContributors: PerformanceContributor[];
    negativeContributors: PerformanceContributor[];
    irFocus: boolean;
  },
): Pattern[] {
  const patterns: Pattern[] = [];
  const { period, confidence } = context;
  const periodLabel = period.label;

  // Pattern 1 — Continuous Growth
  const risingSegments = countRisingSegments(context.snapshots, period);
  const flowShare =
    metrics.valueChangeUsd != null && metrics.valueChangeUsd !== 0
      ? Math.abs(sharePct(Math.abs(metrics.netFlowUsd), Math.abs(metrics.valueChangeUsd)))
      : null;
  if (
    metrics.growthPct != null &&
    metrics.growthPct > GROWTH_NOISE_PCT &&
    risingSegments >= 3 &&
    (flowShare == null || flowShare < DEPOSIT_DRIVEN_SHARE)
  ) {
    patterns.push({
      id: makePatternId('performance', 'continuous_growth'),
      type: 'continuous_growth',
      name: 'Continuous Growth',
      description:
        'Portfolio value rose across consecutive segments of the period without matching capital inflows.',
      category: 'performance',
      confidence,
      evidence: compactEvidence({
        rising_segments: risingSegments,
        growth_pct: metrics.growthPct,
        net_flow_usd: metrics.netFlowUsd,
        period: periodLabel,
      }),
    });
  }

  // Pattern 2 — Deposit Driven Growth
  if (
    metrics.valueChangeUsd != null &&
    metrics.valueChangeUsd > 0 &&
    metrics.netFlowUsd > 0 &&
    flowShare != null &&
    flowShare >= DEPOSIT_DRIVEN_SHARE
  ) {
    patterns.push({
      id: makePatternId('performance', 'deposit_driven_growth'),
      type: 'deposit_driven_growth',
      name: 'Deposit Driven Growth',
      description:
        'A significant share of the value increase is matched by capital that entered the wallet during the period.',
      category: 'performance',
      confidence,
      evidence: compactEvidence({
        value_change_usd: metrics.valueChangeUsd,
        net_flow_usd: metrics.netFlowUsd,
        flow_share_pct: round2(flowShare),
        period: periodLabel,
      }),
    });
  }

  // Pattern 3 — Concentrated Growth (skip net_flow leaders on Investment Return)
  const totalPositive = sum(context.positiveContributors.map(c => c.contributionUsd));
  const leader = context.positiveContributors[0];
  if (leader && totalPositive > 0 && leader.contributionUsd >= MIN_CONCENTRATED_CONTRIBUTION_USD) {
    const leaderShare = sharePct(leader.contributionUsd, totalPositive);
    const irPnlAbs =
      metrics.totalPnlUsd != null && Number.isFinite(metrics.totalPnlUsd)
        ? Math.abs(metrics.totalPnlUsd)
        : null;
    const irShareOfTotalPnl =
      irPnlAbs != null && irPnlAbs > 0
        ? sharePct(Math.abs(leader.contributionUsd), irPnlAbs)
        : null;
    // Tiny positive crumbs among a losing book (e.g. ETH +$0.02) are not concentration.
    const materialForIr =
      !context.irFocus ||
      irShareOfTotalPnl == null ||
      irShareOfTotalPnl >= MIN_IR_CONCENTRATION_OF_TOTAL_PNL_PCT;

    if (leaderShare >= CONCENTRATED_GROWTH_SHARE && materialForIr) {
      if (leader.basis === 'net_flow' && context.irFocus) {
        // Capital inflows are not mark-to-market performance drivers on the IR page.
      } else if (leader.basis === 'net_flow') {
        patterns.push({
          id: makePatternId('performance', 'capital_flow_concentration', leader.symbol),
          type: 'capital_flow_concentration',
          name: 'Capital Flow Concentration',
          description: `Most of the recorded positive net flow over the period came from ${leader.symbol}. This describes capital movement, not mark-to-market performance.`,
          category: 'performance',
          confidence: 'low',
          evidence: compactEvidence({
            asset: leader.symbol,
            contribution_usd: leader.contributionUsd,
            share_of_flow_pct: leaderShare,
            allocation_pct: leader.allocationPct,
            basis: leader.basis,
            period: periodLabel,
          }),
        });
      } else {
        patterns.push({
          id: makePatternId('performance', 'concentrated_growth', leader.symbol),
          type: 'concentrated_growth',
          name: 'Concentrated Growth',
          description: `Most of the positive value change over the period came from ${leader.symbol}.`,
          category: 'performance',
          confidence:
            leader.basis === 'observed_price' || leader.basis === 'cost_basis_pnl'
              ? confidence
              : 'low',
          evidence: compactEvidence({
            asset: leader.symbol,
            contribution_usd: leader.contributionUsd,
            share_of_gain_pct: leaderShare,
            allocation_pct: leader.allocationPct,
            basis: leader.basis,
            period: periodLabel,
          }),
        });
      }
    }
  }

  // Pattern 3b — Concentrated Loss (material detractor among negative PnL)
  const totalNegativeAbs = sum(
    context.negativeContributors.map(c => Math.abs(c.contributionUsd)),
  );
  const detractor = [...context.negativeContributors].sort(
    (a, b) => a.contributionUsd - b.contributionUsd,
  )[0];
  if (
    detractor &&
    totalNegativeAbs > 0 &&
    Math.abs(detractor.contributionUsd) >= MIN_CONCENTRATED_CONTRIBUTION_USD
  ) {
    const detractorShare = sharePct(Math.abs(detractor.contributionUsd), totalNegativeAbs);
    const irPnlAbs =
      metrics.totalPnlUsd != null && Number.isFinite(metrics.totalPnlUsd)
        ? Math.abs(metrics.totalPnlUsd)
        : null;
    const shareOfTotalPnl =
      irPnlAbs != null && irPnlAbs > 0
        ? sharePct(Math.abs(detractor.contributionUsd), irPnlAbs)
        : null;
    const materialForIr =
      !context.irFocus ||
      shareOfTotalPnl == null ||
      shareOfTotalPnl >= MIN_IR_CONCENTRATION_OF_TOTAL_PNL_PCT;

    if (
      detractorShare >= CONCENTRATED_GROWTH_SHARE &&
      materialForIr &&
      detractor.basis !== 'net_flow'
    ) {
      patterns.push({
        id: makePatternId('performance', 'concentrated_loss', detractor.symbol),
        type: 'concentrated_loss',
        name: 'Concentrated Loss',
        description: `Most of the negative mark-to-market change over the period came from ${detractor.symbol}.`,
        category: 'performance',
        confidence:
          detractor.basis === 'observed_price' || detractor.basis === 'cost_basis_pnl'
            ? confidence
            : 'low',
        evidence: compactEvidence({
          asset: detractor.symbol,
          contribution_usd: detractor.contributionUsd,
          share_of_loss_pct: detractorShare,
          allocation_pct: detractor.allocationPct,
          basis: detractor.basis,
          period: periodLabel,
        }),
      });
    }
  }

  // Pattern 4 — Performance Reversal
  if (
    metrics.growthPct != null &&
    context.previousGrowthPct != null &&
    Math.sign(metrics.growthPct) !== Math.sign(context.previousGrowthPct) &&
    Math.abs(metrics.growthPct) > GROWTH_NOISE_PCT &&
    Math.abs(context.previousGrowthPct) > GROWTH_NOISE_PCT
  ) {
    patterns.push({
      id: makePatternId('performance', 'performance_reversal'),
      type: 'performance_reversal',
      name: 'Performance Reversal',
      description: 'The direction of portfolio value change reversed compared with the previous period.',
      category: 'performance',
      confidence,
      evidence: compactEvidence({
        previous_growth_pct: context.previousGrowthPct,
        current_growth_pct: metrics.growthPct,
        period: periodLabel,
      }),
    });
  }

  // Pattern 5 — Recovery Phase
  if (
    metrics.maxDrawdownPct != null &&
    metrics.maxDrawdownPct >= DRAWDOWN_MATERIAL_PCT &&
    metrics.recoveryPct != null &&
    metrics.recoveryPct >= RECOVERY_MATERIAL_PCT
  ) {
    patterns.push({
      id: makePatternId('performance', 'recovery_phase'),
      type: 'recovery_phase',
      name: 'Recovery Phase',
      description: 'Portfolio value rose from its lowest point after a decline within the period.',
      category: 'performance',
      confidence,
      evidence: compactEvidence({
        max_drawdown_pct: metrics.maxDrawdownPct,
        recovery_pct: metrics.recoveryPct,
        peak_value_usd: metrics.peakValueUsd,
        trough_value_usd: metrics.troughValueUsd,
        current_drawdown_pct: metrics.currentDrawdownPct,
        period: periodLabel,
      }),
    });
  }

  return patterns;
}

function countRisingSegments(snapshots: SnapshotPoint[], period: ResolvedPeriod): number {
  const window = snapshots.filter(p => p.ms >= period.currentStart && p.ms <= period.currentEnd);
  if (window.length < 2) return 0;
  const segmentCount = Math.min(6, Math.max(2, Math.round(period.days / 7)));
  const segmentMs = (period.currentEnd - period.currentStart) / segmentCount;
  let rising = 0;
  let previousValue: number | null = null;
  for (let i = 0; i < segmentCount; i += 1) {
    const edge = period.currentStart + segmentMs * (i + 1);
    const value = valueAt(window, edge);
    if (value == null) continue;
    if (previousValue != null && value > previousValue) rising += 1;
    previousValue = value;
  }
  return rising;
}

// ---------------------------------------------------------------------------
// Insights (Spec §5.7 / §5.8)
// ---------------------------------------------------------------------------

function buildInsights(
  metrics: PerformanceMetrics,
  patterns: Pattern[],
  period: ResolvedPeriod,
  confidence: Confidence,
  irFocus: boolean,
): Insight[] {
  const insights: Insight[] = [];
  const periodLabel = period.label;

  // On Investment Return, empty open holdings with lot PnL must not produce
  // a "portfolio value moved from X to $0" story from snapshot math.
  const skipHoldingsValueInsight = irFocus && metrics.currentValueUsd <= 0;

  if (
    !skipHoldingsValueInsight &&
    metrics.growthPct != null &&
    Math.abs(metrics.growthPct) > GROWTH_NOISE_PCT
  ) {
    const rising = metrics.growthPct > 0;
    insights.push({
      id: makeInsightId('performance', rising ? 'value_increase' : 'value_decrease'),
      type: rising ? 'performance_increase' : 'performance_decrease',
      category: 'performance',
      title: rising
        ? `Portfolio value increased ${formatPct(metrics.growthPct)} over ${periodLabel}`
        : `Portfolio value decreased ${formatPct(Math.abs(metrics.growthPct))} over ${periodLabel}`,
      description: `Portfolio value moved from ${formatUsd(metrics.previousValueUsd ?? 0)} to ${formatUsd(metrics.currentValueUsd)} over the last ${period.days} days. Capital movement over the same window was ${formatUsd(metrics.netFlowUsd)}, so ${formatUsd(metrics.appreciationUsd ?? 0)} of the change is not explained by transfers.`,
      severity: Math.abs(metrics.growthPct) >= 20 ? 'medium' : 'low',
      confidence,
      impactUsd: metrics.valueChangeUsd != null ? Math.abs(metrics.valueChangeUsd) : null,
      evidence: compactEvidence({
        previous_value_usd: metrics.previousValueUsd,
        current_value_usd: metrics.currentValueUsd,
        value_change_usd: metrics.valueChangeUsd,
        growth_pct: metrics.growthPct,
        net_flow_usd: metrics.netFlowUsd,
        appreciation_usd: metrics.appreciationUsd,
        period: periodLabel,
      }),
    });
  }

  if (irFocus && metrics.roiPct != null) {
    const pnlParts: string[] = [];
    if (metrics.totalPnlUsd != null) pnlParts.push(`Total PnL is ${formatUsd(metrics.totalPnlUsd)}`);
    if (metrics.unrealizedPnlUsd != null) {
      pnlParts.push(`unrealized ${formatUsd(metrics.unrealizedPnlUsd)}`);
    }
    if (metrics.realizedPnlUsd != null) {
      pnlParts.push(`realized ${formatUsd(metrics.realizedPnlUsd)}`);
    }
    const pnlSentence =
      pnlParts.length === 0
        ? ''
        : pnlParts.length === 1
          ? ` ${pnlParts[0]}.`
          : ` ${pnlParts[0]} (${pnlParts.slice(1).join(', ')}).`;

    insights.push({
      id: makeInsightId('performance', 'investment_return'),
      type: 'investment_return',
      category: 'performance',
      title: `Tracked return since connection is ${formatSignedPct(metrics.roiPct)}`,
      description: `Mark-to-market return versus lot cost basis since wallet connect is ${formatSignedPct(metrics.roiPct)}.${pnlSentence}`,
      severity: Math.abs(metrics.roiPct) >= 20 ? 'medium' : 'informational',
      confidence,
      impactUsd: metrics.totalPnlUsd != null ? Math.abs(metrics.totalPnlUsd) : null,
      evidence: compactEvidence({
        roi_pct: metrics.roiPct,
        total_pnl_usd: metrics.totalPnlUsd,
        unrealized_pnl_usd: metrics.unrealizedPnlUsd,
        realized_pnl_usd: metrics.realizedPnlUsd,
        period: periodLabel,
      }),
    });
  }

  if (metrics.maxDrawdownPct != null && metrics.maxDrawdownPct >= DRAWDOWN_MATERIAL_PCT) {
    insights.push({
      id: makeInsightId('performance', 'drawdown'),
      type: 'performance_drawdown',
      category: 'performance',
      title: `Largest decline from the period peak was ${formatPct(metrics.maxDrawdownPct)}`,
      description: `Within the last ${period.days} days the portfolio fell ${formatPct(metrics.maxDrawdownPct)} from its highest recorded value of ${formatUsd(metrics.peakValueUsd ?? 0)}. Current value stands ${formatPct(Math.max(0, metrics.currentDrawdownPct ?? 0))} below that peak.`,
      severity: metrics.maxDrawdownPct >= 30 ? 'high' : metrics.maxDrawdownPct >= 20 ? 'medium' : 'low',
      confidence,
      impact:
        'Value swings of this size change how much of the portfolio total moves with market prices during the period.',
      impactUsd:
        metrics.peakValueUsd != null && metrics.troughValueUsd != null
          ? round2(metrics.peakValueUsd - metrics.troughValueUsd)
          : null,
      evidence: compactEvidence({
        max_drawdown_pct: metrics.maxDrawdownPct,
        current_drawdown_pct: metrics.currentDrawdownPct,
        peak_value_usd: metrics.peakValueUsd,
        peak_date: metrics.peakDate,
        trough_value_usd: metrics.troughValueUsd,
        period: periodLabel,
      }),
    });
  }

  if (
    !skipHoldingsValueInsight &&
    metrics.topDetractor &&
    metrics.valueChangeUsd != null &&
    metrics.valueChangeUsd > 0
  ) {
    const detractor = metrics.topDetractor;
    insights.push({
      id: makeInsightId('performance', 'hidden_detractor', detractor.symbol),
      type: 'hidden_underperformer',
      category: 'performance',
      title: `${detractor.symbol} declined while total portfolio value rose`,
      description: `Total portfolio value increased ${formatUsd(metrics.valueChangeUsd)} over ${periodLabel}, while ${detractor.symbol} recorded a change of ${formatUsd(detractor.contributionUsd)}. The overall result hides this negative contribution.`,
      severity: 'low',
      confidence:
        detractor.basis === 'observed_price' || detractor.basis === 'cost_basis_pnl'
          ? confidence
          : 'low',
      impactUsd: Math.abs(detractor.contributionUsd),
      relatedEntities: [detractor.symbol],
      evidence: compactEvidence({
        asset: detractor.symbol,
        asset_change_usd: detractor.contributionUsd,
        portfolio_change_usd: metrics.valueChangeUsd,
        allocation_pct: detractor.allocationPct,
        price_change_pct: detractor.priceChangePct,
        period: periodLabel,
      }),
    });
  }

  for (const pattern of patterns) {
    insights.push(insightFromPattern(pattern, metrics, periodLabel));
  }

  return insights;
}

function insightFromPattern(
  pattern: Pattern,
  metrics: PerformanceMetrics,
  periodLabel: string,
): Insight {
  const base = {
    id: makeInsightId('performance', pattern.type),
    type: pattern.type,
    category: 'performance' as const,
    confidence: pattern.confidence,
    evidence: pattern.evidence,
  };

  switch (pattern.type) {
    case 'continuous_growth':
      return {
        ...base,
        title: 'Growth appears driven by asset appreciation',
        description:
          'Portfolio value rose across consecutive segments of the period while net capital movement stayed small relative to the change, so most of the increase is not explained by new transfers.',
        severity: 'informational',
        impactUsd: metrics.valueChangeUsd != null ? Math.abs(metrics.valueChangeUsd) : null,
      };
    case 'deposit_driven_growth':
      return {
        ...base,
        title: 'Part of the increase came from incoming capital',
        description: `Net capital of ${formatUsd(metrics.netFlowUsd)} entered the wallet over ${periodLabel} against a total value change of ${formatUsd(metrics.valueChangeUsd ?? 0)}, so the increase is partly supported by transfers rather than price movement alone.`,
        severity: 'informational',
        impactUsd: Math.abs(metrics.netFlowUsd),
      };
    case 'concentrated_growth':
      return {
        ...base,
        title: 'Value change is concentrated in one asset',
        description:
          'One asset accounts for the majority of the positive value change during the period, so overall results currently follow the movement of that single asset.',
        severity: 'medium',
        impact: 'Portfolio results over this period depend largely on one performance driver.',
        impactUsd: numberFromEvidence(pattern.evidence.contribution_usd),
      };
    case 'concentrated_loss':
      return {
        ...base,
        title: 'Loss is concentrated in one asset',
        description:
          'One asset accounts for the majority of the negative mark-to-market change during the period, so overall results currently follow that single detractor.',
        severity: 'medium',
        impact: 'Portfolio results over this period depend largely on one performance drag.',
        impactUsd:
          numberFromEvidence(pattern.evidence.contribution_usd) != null
            ? Math.abs(numberFromEvidence(pattern.evidence.contribution_usd) as number)
            : null,
      };
    case 'capital_flow_concentration':
      return {
        ...base,
        title: 'Capital movement is concentrated in one asset',
        description:
          'One asset accounts for the majority of recorded positive net flow during the period. This describes where capital moved, not mark-to-market performance contribution.',
        severity: 'informational',
        impactUsd: numberFromEvidence(pattern.evidence.contribution_usd),
      };
    case 'performance_reversal':
      return {
        ...base,
        title: 'Direction of value change reversed',
        description: `The portfolio moved ${formatSignedPct(Number(pattern.evidence.previous_growth_pct ?? 0))} in the previous window and ${formatSignedPct(Number(pattern.evidence.current_growth_pct ?? 0))} in the current one.`,
        severity: 'medium',
        impactUsd: metrics.valueChangeUsd != null ? Math.abs(metrics.valueChangeUsd) : null,
      };
    default:
      return {
        ...base,
        title: 'Value rose from the period low after a decline',
        description: `After a decline of ${formatPct(metrics.maxDrawdownPct ?? 0)} from the period peak, value has risen ${formatPct(metrics.recoveryPct ?? 0)} from its lowest recorded point.`,
        severity: 'informational',
        impactUsd:
          metrics.peakValueUsd != null && metrics.troughValueUsd != null
            ? round2(metrics.peakValueUsd - metrics.troughValueUsd)
            : null,
      };
  }
}

function numberFromEvidence(value: string | number | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.abs(value);
  return null;
}

// ---------------------------------------------------------------------------
// Summary (Spec §5.10)
// ---------------------------------------------------------------------------

function buildSummary(
  metrics: PerformanceMetrics,
  period: ResolvedPeriod,
  investmentReturn: InvestmentReturnLike | null,
  irFocus: boolean,
): string {
  if (irFocus && investmentReturn) {
    return buildInvestmentReturnSummary(metrics, period, investmentReturn);
  }

  if (metrics.currentValueUsd <= 0 && metrics.snapshotCount === 0) {
    return 'No portfolio value or history is available for this period, so performance cannot be described.';
  }

  const parts: string[] = [];
  parts.push(`Portfolio value stands at ${formatUsd(metrics.currentValueUsd)}.`);

  if (metrics.growthPct != null && metrics.valueChangeUsd != null) {
    parts.push(
      `Over the last ${period.days} days it changed by ${formatUsd(metrics.valueChangeUsd)} (${formatSignedPct(metrics.growthPct)}).`,
    );
  } else {
    parts.push(
      `Value history for the last ${period.days} days is incomplete, so the period change could not be measured.`,
    );
  }

  if (metrics.appreciationUsd != null) {
    parts.push(
      `Capital movement over the window was ${formatUsd(metrics.netFlowUsd)}, leaving ${formatUsd(metrics.appreciationUsd)} of the change unexplained by transfers.`,
    );
  }

  if (metrics.topContributor) {
    parts.push(
      `The largest positive contribution came from ${metrics.topContributor.symbol} at ${formatUsd(metrics.topContributor.contributionUsd)}.`,
    );
  }

  if (metrics.maxDrawdownPct != null && metrics.maxDrawdownPct >= DRAWDOWN_MATERIAL_PCT) {
    parts.push(`The largest decline from the period peak was ${formatPct(metrics.maxDrawdownPct)}.`);
  }

  if (metrics.roiPct != null) {
    parts.push(`Tracked return since connection is ${formatSignedPct(metrics.roiPct)}.`);
  }

  return parts.join(' ');
}

function buildInvestmentReturnSummary(
  metrics: PerformanceMetrics,
  period: ResolvedPeriod,
  investmentReturn: InvestmentReturnLike,
): string {
  const parts: string[] = [];
  const windowLabel = /since connected/i.test(period.label)
    ? period.label.charAt(0).toLowerCase() + period.label.slice(1)
    : `over ${period.label}`;

  if (metrics.roiPct != null) {
    parts.push(`Tracked investment return ${windowLabel} is ${formatSignedPct(metrics.roiPct)}.`);
  } else {
    parts.push('Investment return is tracked against lot cost basis since wallet connect.');
  }

  if (metrics.totalPnlUsd != null) {
    const pnlBits = [`Total PnL is ${formatUsd(metrics.totalPnlUsd)}`];
    if (metrics.unrealizedPnlUsd != null) pnlBits.push(`unrealized ${formatUsd(metrics.unrealizedPnlUsd)}`);
    if (metrics.realizedPnlUsd != null) pnlBits.push(`realized ${formatUsd(metrics.realizedPnlUsd)}`);
    parts.push(`${pnlBits[0]}${pnlBits.length > 1 ? ` (${pnlBits.slice(1).join(', ')})` : ''}.`);
  }

  const costBasis = investmentReturn.costBasisOpenUsd;
  const marketOpen = investmentReturn.marketValueOpenUsd;
  if (costBasis != null) {
    parts.push(`Open cost basis stands at ${formatUsd(costBasis)}.`);
  }
  if (marketOpen != null) {
    parts.push(`Open market value stands at ${formatUsd(marketOpen)}.`);
  }

  const lotsCount = investmentReturn.lotsCount ?? 0;
  const openLots = investmentReturn.openLotsCount ?? 0;
  if ((marketOpen == null || marketOpen <= 0) && lotsCount > 0) {
    parts.push(
      `Open holdings are currently empty; the reported PnL comes from ${lotsCount} tracked lot${lotsCount === 1 ? '' : 's'} since connect${openLots > 0 ? ` (${openLots} still open by lot status)` : ''}.`,
    );
  } else if (lotsCount > 0) {
    parts.push(
      `Figures are based on ${lotsCount} tracked lot${lotsCount === 1 ? '' : 's'} since wallet connect.`,
    );
  }

  if (metrics.topContributor && metrics.topContributor.basis !== 'net_flow') {
    const share =
      metrics.topContributor.contributionPct != null
        ? ` (${formatPct(Math.abs(metrics.topContributor.contributionPct))} of total PnL magnitude)`
        : '';
    parts.push(
      `Largest lot-level PnL contribution came from ${metrics.topContributor.symbol} at ${formatUsd(metrics.topContributor.contributionUsd)}${share}.`,
    );
  }

  if (metrics.netFlowUsd !== 0) {
    parts.push(
      `Separately, net capital flow over the window was ${formatUsd(metrics.netFlowUsd)} (deposits and withdrawals, not return).`,
    );
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Input coercion
// ---------------------------------------------------------------------------

function asInvestmentReturn(raw: unknown): InvestmentReturnLike | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const pick = (key: string): number | null => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? round2(value) : null;
  };
  const pickInt = (key: string): number | null => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
  };
  const pickString = (key: string): string | null => {
    const value = source[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  };

  let assets: InvestmentReturnLike['assets'];
  if (Array.isArray(source.assets)) {
    assets = [];
    for (const item of source.assets) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const tokenSymbol =
        typeof row.tokenSymbol === 'string'
          ? row.tokenSymbol.trim()
          : typeof row.symbol === 'string'
            ? row.symbol.trim()
            : '';
      if (!tokenSymbol) continue;
      const num = (key: string): number | null => {
        const value = row[key];
        return typeof value === 'number' && Number.isFinite(value) ? round2(value) : null;
      };
      assets.push({
        tokenSymbol,
        network: typeof row.network === 'string' ? row.network : undefined,
        totalPnlUsd: num('totalPnlUsd'),
        unrealizedPnlUsd: num('unrealizedPnlUsd'),
        realizedPnlUsd: num('realizedPnlUsd'),
        marketValueOpenUsd: num('marketValueOpenUsd'),
        costBasisOpenUsd: num('costBasisOpenUsd'),
        returnPct: num('returnPct'),
        status: typeof row.status === 'string' ? row.status : null,
        quantityOpen: num('quantityOpen'),
      });
    }
  }

  return {
    returnPct: pick('returnPct'),
    totalPnlUsd: pick('totalPnlUsd'),
    unrealizedPnlUsd: pick('unrealizedPnlUsd'),
    realizedPnlUsd: pick('realizedPnlUsd'),
    costBasisOpenUsd: pick('costBasisOpenUsd'),
    marketValueOpenUsd: pick('marketValueOpenUsd'),
    trackingActive: source.trackingActive === true,
    assets,
    sinceConnectedAt: pickString('sinceConnectedAt'),
    baselineValueUsd: pick('baselineValueUsd'),
    lotsCount: pickInt('lotsCount'),
    openLotsCount: pickInt('openLotsCount'),
    methodology: pickString('methodology'),
    historySource: pickString('historySource'),
  };
}

/** Exposed for engines that need the same drawdown / volatility view (e.g. Risk). */
export function performanceStabilityScore(metrics: PerformanceMetrics): number {
  const volatilityPenalty = metrics.volatilityScore ?? 40;
  const drawdownPenalty = clamp(metrics.maxDrawdownPct ?? 15, 0, 100);
  return score100(100 - volatilityPenalty * 0.6 - drawdownPenalty * 0.4);
}

/** Days of value history actually available inside the window. */
export function snapshotCoverageDays(input: IntelligenceInput): number {
  const period = resolvePeriod(input);
  const snapshots = resolveSnapshots(input).filter(
    p => p.ms >= period.currentStart && p.ms <= period.currentEnd,
  );
  if (snapshots.length < 2) return 0;
  return round1(daysBetween(snapshots[0].ms, snapshots[snapshots.length - 1].ms));
}

/** Convenience for callers that only need the ranked drivers. */
export function topPerformanceDrivers(
  metrics: PerformanceMetrics,
  limit = 3,
): PerformanceContributor[] {
  return topN(metrics.contributors, limit, c => Math.abs(c.contributionUsd));
}
