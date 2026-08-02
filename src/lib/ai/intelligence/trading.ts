/**
 * Module 06 — Trading Intelligence (Spec §5.82–§5.98).
 *
 * Measures trading *activity* and separates how much of the portfolio result
 * came from activity versus from price movement (Spec §5.89 attribution).
 *
 * Volume is an activity measure, never a profit measure (Spec §5.88 Pattern 6).
 * Profiles describe the behaviour of the wallet, never the person (Spec §5.87).
 */

import { computeTradingVolumeDetail, type TradingVolumeDetail } from '@/lib/finance/trading-volume';
import {
  buildAssetLedger,
  buildDataQuality,
  clamp,
  compactEvidence,
  daysBetween,
  deriveConfidence,
  formatPeriodLabel,
  formatPct,
  formatUsd,
  isInternalCounterparty,
  isoDay,
  lowestConfidence,
  makeInsightId,
  makePatternId,
  mean,
  median,
  ownedAddressSet,
  pctChange,
  resolveHoldings,
  resolvePeriod,
  resolvePortfolioValueUsd,
  resolveTransactions,
  round1,
  round2,
  safeDiv,
  sharePct,
  splitByPeriod,
  sum,
  txDirection,
  txNetwork,
  txTimestampMs,
  txTokenSymbol,
  txType,
  txUsd,
  type ResolvedPeriod,
} from './shared';
import type {
  Confidence,
  Insight,
  IntelligenceInput,
  IntelligenceResult,
  IntelligenceTransaction,
  Pattern,
  PeriodComparison,
} from './types';

/** Wallet behaviour profile — never a label for the account owner (Spec §5.87). */
export type TradingProfile =
  | 'long_term_holder'
  | 'active_trader'
  | 'swing_trader'
  | 'defi_explorer'
  | 'market_participant';

/** How average holding time was derived; drives confidence (Spec §5.86). */
export type HoldingTimeBasis = 'trade_interval' | 'unavailable';

/** Whether the attribution split could be computed from real data (Spec §5.89). */
export type AttributionBasis = 'reconstructed' | 'partial' | 'unavailable';

export interface TradedAssetActivity {
  symbol: string;
  network: string;
  tradeCount: number;
  volumeUsd: number;
  volumeSharePct: number;
  tradeSharePct: number;
  avgTradeSizeUsd: number;
  /** Average gap between consecutive trades of this asset. */
  avgTradeIntervalDays: number | null;
}

export interface TradingAttribution {
  totalChangeUsd: number | null;
  appreciationUsd: number | null;
  netExternalFlowUsd: number;
  /** Residual after appreciation and external flows are removed. */
  tradingResultUsd: number | null;
  basis: AttributionBasis;
  /** Share of the absolute change explained by price movement, 0–100. */
  appreciationSharePct: number | null;
  tradingSharePct: number | null;
}

export interface TradingMetrics {
  periodDays: number;
  portfolioValueUsd: number;
  tradeCount: number;
  volumeUsd: number;
  pricedTradeCount: number;
  unpricedTradeCount: number;
  avgTradeSizeUsd: number;
  medianTradeSizeUsd: number;
  largestTradeUsd: number;
  /** Trades per day inside the window. */
  tradingFrequency: number;
  tradesPerWeek: number;
  tradesPerMonth: number;
  activeTradingDays: number;
  /** Trades on the busiest single day — separates bursts from steady activity. */
  maxTradesInDay: number;
  tradeCountComparison: PeriodComparison;
  volumeComparison: PeriodComparison;
  /** Trades as a share of all recorded activity, 0–100. */
  tradingActivitySharePct: number | null;
  uniqueAssetsTraded: number;
  assetsHeld: number;
  /** Unique traded assets / assets held (Spec §5.86). */
  rotationRate: number | null;
  turnoverRatio: number | null;
  avgHoldingTimeDays: number | null;
  holdingTimeBasis: HoldingTimeBasis;
  networksUsed: string[];
  tradesPerNetwork: Record<string, number>;
  newNetworks: string[];
  protocolsUsed: string[];
  dexInteractionCount: number;
  byAsset: TradedAssetActivity[];
  topTradedAsset: TradedAssetActivity | null;
  attribution: TradingAttribution;
  profile: TradingProfile;
  profileIndicators: string[];
  /** Reused verbatim from `computeTradingVolumeDetail` (Spec: single source of truth). */
  methodology: string;
  allTimeVolumeUsd: number;
  allTimeTradeCount: number;
}

export type TradingIntelligence = IntelligenceResult<TradingMetrics>;

const ACTIVITY_INCREASE_FACTOR = 1.5;
const TRADING_CONCENTRATION_PCT = 60;
const HIGH_TURNOVER_RATIO = 3;
const HIGH_ROTATION_RATE = 0.5;
const SHORT_HOLDING_DAYS = 7;
const ACTIVE_TRADES_PER_WEEK = 5;
const PASSIVE_TRADES_PER_WEEK = 0.5;
const DEFI_PROTOCOL_COUNT = 4;
const DEFI_AVG_TRADE_USD = 1_000;
const BURST_TRADES_PER_ACTIVE_DAY = 2;

interface TradeRecord {
  ms: number;
  usd: number | null;
  symbol: string;
  network: string;
  protocol: string | null;
}

export function analyzeTrading(input: IntelligenceInput): TradingIntelligence {
  const period = resolvePeriod(input);
  const txs = resolveTransactions(input);
  const dataQuality = buildDataQuality(txs);
  const portfolioValueUsd = resolvePortfolioValueUsd(input);
  const owned = ownedAddressSet(input);

  // Single source of truth for what counts as a trade and how it is valued.
  const detail: TradingVolumeDetail = computeTradingVolumeDetail(txs);

  const periodTxCount = splitByPeriod(txs, txTimestampMs, period).current.length;
  const tradeTxs = txs.filter(tx => txType(tx) === 'trade' && !isInternalCounterparty(tx, owned));
  const split = splitByPeriod(tradeTxs, txTimestampMs, period);
  const current = toRecords(split.current);
  const previous = toRecords(split.previous);

  const pricedCurrent = current.filter(t => t.usd != null).map(t => t.usd as number);
  const volumeUsd = round2(sum(pricedCurrent));
  const previousVolumeUsd = round2(
    sum(previous.filter(t => t.usd != null).map(t => t.usd as number)),
  );

  const dayBuckets = new Map<string, number>();
  for (const trade of current) {
    const day = isoDay(trade.ms);
    dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
  }

  const byAsset = buildAssetActivity(current, volumeUsd);
  const ledger = buildAssetLedger(input, period);
  const heldAssets = ledger.entries.filter(e => e.held).length || resolveHoldings(input).length;
  const uniqueAssetsTraded = byAsset.length;

  const networksUsed = [...new Set(current.map(t => t.network))].sort();
  const previousNetworks = new Set(previous.map(t => t.network));
  const tradesPerNetwork: Record<string, number> = {};
  for (const trade of current) {
    tradesPerNetwork[trade.network] = (tradesPerNetwork[trade.network] ?? 0) + 1;
  }
  const protocolsUsed = [
    ...new Set(current.map(t => t.protocol).filter((p): p is string => Boolean(p))),
  ].sort();

  const holdingTime = computeHoldingTime(byAsset);
  const rotationRate = heldAssets > 0 ? round2(uniqueAssetsTraded / heldAssets) : null;
  const turnoverRatio = portfolioValueUsd > 0 ? round2(volumeUsd / portfolioValueUsd) : null;
  const tradingFrequency = round2(current.length / period.days);
  const avgTradeSizeUsd = pricedCurrent.length > 0 ? round2(mean(pricedCurrent)) : 0;

  const attribution = buildAttribution(ledger, txs, period, owned);

  const profileResult = classifyProfile({
    tradeCount: current.length,
    tradesPerWeek: round2(tradingFrequency * 7),
    turnoverRatio,
    rotationRate,
    avgTradeSizeUsd,
    protocolCount: protocolsUsed.length,
    networkCount: networksUsed.length,
    activeTradingDays: dayBuckets.size,
    avgHoldingTimeDays: holdingTime.days,
  });

  const metrics: TradingMetrics = {
    periodDays: period.days,
    portfolioValueUsd,
    tradeCount: current.length,
    volumeUsd,
    pricedTradeCount: pricedCurrent.length,
    unpricedTradeCount: current.length - pricedCurrent.length,
    avgTradeSizeUsd,
    medianTradeSizeUsd: pricedCurrent.length > 0 ? round2(median(pricedCurrent)) : 0,
    largestTradeUsd: pricedCurrent.length > 0 ? round2(Math.max(...pricedCurrent)) : 0,
    tradingFrequency,
    tradesPerWeek: round2(tradingFrequency * 7),
    tradesPerMonth: round2(tradingFrequency * 30),
    activeTradingDays: dayBuckets.size,
    maxTradesInDay: dayBuckets.size > 0 ? Math.max(...dayBuckets.values()) : 0,
    tradeCountComparison: {
      current: current.length,
      previous: previous.length,
      changePct: pctChange(current.length, previous.length),
    },
    volumeComparison: {
      current: volumeUsd,
      previous: previousVolumeUsd,
      changePct: pctChange(volumeUsd, previousVolumeUsd),
    },
    tradingActivitySharePct: periodTxCount > 0 ? sharePct(current.length, periodTxCount) : null,
    uniqueAssetsTraded,
    assetsHeld: heldAssets,
    rotationRate,
    turnoverRatio,
    avgHoldingTimeDays: holdingTime.days,
    holdingTimeBasis: holdingTime.basis,
    networksUsed,
    tradesPerNetwork,
    newNetworks: networksUsed.filter(n => !previousNetworks.has(n) && previous.length > 0),
    protocolsUsed,
    dexInteractionCount: current.filter(t => t.protocol != null).length,
    byAsset,
    topTradedAsset: byAsset[0] ?? null,
    attribution,
    profile: profileResult.profile,
    profileIndicators: profileResult.indicators,
    methodology: detail.methodology,
    allTimeVolumeUsd: round2(detail.totalVolumeUsd),
    allTimeTradeCount: detail.tradeCount,
  };

  const confidence = lowestConfidence(
    input.dataGrounding === 'screen' && dataQuality.completeness >= 50
      ? 'high'
      : deriveConfidence(dataQuality, { minSampleForHigh: 20, minSampleForMedium: 5 }),
    current.length === 0 ? 'low' : current.length >= 5 ? 'high' : 'medium',
    input.dataGrounding === 'screen'
      ? metrics.unpricedTradeCount > metrics.pricedTradeCount
        ? 'medium'
        : 'high'
      : metrics.unpricedTradeCount > metrics.pricedTradeCount
        ? 'low'
        : 'high',
  );

  const patterns = detectPatterns(metrics, period, confidence);
  const insights = buildInsights(metrics, patterns, period, confidence);

  return {
    summary: buildSummary(metrics, period),
    metrics,
    patterns,
    insights,
    confidence,
    evidence: compactEvidence({
      period: formatPeriodLabel(period.days),
      trade_count: metrics.tradeCount,
      volume_usd: metrics.volumeUsd,
      avg_trade_size_usd: metrics.avgTradeSizeUsd,
      trades_per_week: metrics.tradesPerWeek,
      turnover_ratio: metrics.turnoverRatio,
      rotation_rate: metrics.rotationRate,
      unique_assets_traded: metrics.uniqueAssetsTraded,
      network_count: metrics.networksUsed.length,
      trading_profile: metrics.profile,
      trading_result_usd: metrics.attribution.tradingResultUsd,
      appreciation_usd: metrics.attribution.appreciationUsd,
    }),
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Trade records & per-asset activity (Spec §5.84–§5.86)
// ---------------------------------------------------------------------------

function toRecords(txs: IntelligenceTransaction[]): TradeRecord[] {
  const records: TradeRecord[] = [];
  for (const tx of txs) {
    const ms = txTimestampMs(tx);
    if (ms == null) continue;
    const protocol = (tx.protocol ?? '').toString().trim();
    records.push({
      ms,
      usd: txUsd(tx),
      symbol: txTokenSymbol(tx),
      network: txNetwork(tx),
      protocol: protocol ? protocol.toLowerCase() : null,
    });
  }
  return records.sort((a, b) => a.ms - b.ms);
}

function buildAssetActivity(trades: TradeRecord[], totalVolumeUsd: number): TradedAssetActivity[] {
  const groups = new Map<string, { network: string; volumeUsd: number; count: number; times: number[] }>();
  for (const trade of trades) {
    const existing = groups.get(trade.symbol) ?? {
      network: trade.network,
      volumeUsd: 0,
      count: 0,
      times: [],
    };
    existing.volumeUsd += trade.usd ?? 0;
    existing.count += 1;
    existing.times.push(trade.ms);
    groups.set(trade.symbol, existing);
  }

  const activity: TradedAssetActivity[] = [];
  for (const [symbol, group] of groups) {
    activity.push({
      symbol,
      network: group.network,
      tradeCount: group.count,
      volumeUsd: round2(group.volumeUsd),
      volumeSharePct: sharePct(group.volumeUsd, totalVolumeUsd),
      tradeSharePct: sharePct(group.count, trades.length),
      avgTradeSizeUsd: group.count > 0 ? round2(group.volumeUsd / group.count) : 0,
      avgTradeIntervalDays: averageIntervalDays(group.times),
    });
  }

  return activity.sort((a, b) =>
    b.volumeUsd === a.volumeUsd
      ? b.tradeCount === a.tradeCount
        ? a.symbol.localeCompare(b.symbol)
        : b.tradeCount - a.tradeCount
      : b.volumeUsd - a.volumeUsd,
  );
}

function averageIntervalDays(timestamps: number[]): number | null {
  if (timestamps.length < 2) return null;
  const sorted = [...timestamps].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(daysBetween(sorted[i - 1], sorted[i]));
  }
  return round1(mean(gaps));
}

/**
 * Entry / exit pairs are not tracked in the available data, so holding time is
 * approximated by the gap between consecutive trades on the same asset and the
 * basis is reported explicitly (Spec §5.86: state the limitation, lower confidence).
 */
function computeHoldingTime(byAsset: TradedAssetActivity[]): {
  days: number | null;
  basis: HoldingTimeBasis;
} {
  const intervals = byAsset
    .map(a => a.avgTradeIntervalDays)
    .filter((v): v is number => v != null);
  if (intervals.length === 0) return { days: null, basis: 'unavailable' };
  return { days: round1(mean(intervals)), basis: 'trade_interval' };
}

// ---------------------------------------------------------------------------
// Attribution (Spec §5.89)
// ---------------------------------------------------------------------------

function buildAttribution(
  ledger: ReturnType<typeof buildAssetLedger>,
  txs: IntelligenceTransaction[],
  period: ResolvedPeriod,
  owned: Set<string>,
): TradingAttribution {
  const netExternalFlowUsd = round2(computeNetExternalFlow(txs, period, owned));

  const totalChangeUsd =
    ledger.totalStartValueUsd != null
      ? round2(ledger.totalValueUsd - ledger.totalStartValueUsd)
      : null;

  const appreciationParts = ledger.entries
    .map(e => e.appreciationUsd)
    .filter((v): v is number => v != null);
  const appreciationUsd = appreciationParts.length > 0 ? round2(sum(appreciationParts)) : null;

  if (totalChangeUsd == null || appreciationUsd == null) {
    return {
      totalChangeUsd,
      appreciationUsd,
      netExternalFlowUsd,
      tradingResultUsd: null,
      basis: totalChangeUsd == null && appreciationUsd == null ? 'unavailable' : 'partial',
      appreciationSharePct: null,
      tradingSharePct: null,
    };
  }

  const tradingResultUsd = round2(totalChangeUsd - appreciationUsd - netExternalFlowUsd);
  const magnitude = Math.abs(appreciationUsd) + Math.abs(tradingResultUsd);
  const complete =
    appreciationParts.length === ledger.reconstructedAssetCount &&
    ledger.reconstructedAssetCount === ledger.entries.filter(e => e.held).length;

  return {
    totalChangeUsd,
    appreciationUsd,
    netExternalFlowUsd,
    tradingResultUsd,
    basis: complete ? 'reconstructed' : 'partial',
    appreciationSharePct: magnitude > 0 ? sharePct(Math.abs(appreciationUsd), magnitude) : null,
    tradingSharePct: magnitude > 0 ? sharePct(Math.abs(tradingResultUsd), magnitude) : null,
  };
}

/** External deposits minus external withdrawals; internal transfers are excluded. */
function computeNetExternalFlow(
  txs: IntelligenceTransaction[],
  period: ResolvedPeriod,
  owned: Set<string>,
): number {
  let net = 0;
  for (const tx of splitByPeriod(txs, txTimestampMs, period).current) {
    if (isInternalCounterparty(tx, owned)) continue;
    const type = txType(tx);
    if (type === 'trade' || type === 'fee') continue;
    const usd = txUsd(tx);
    if (usd == null) continue;
    const direction = txDirection(tx);
    if (direction === 'in') net += usd;
    else if (direction === 'out') net -= usd;
  }
  return net;
}

// ---------------------------------------------------------------------------
// Profiles (Spec §5.87)
// ---------------------------------------------------------------------------

interface ProfileInputs {
  tradeCount: number;
  tradesPerWeek: number;
  turnoverRatio: number | null;
  rotationRate: number | null;
  avgTradeSizeUsd: number;
  protocolCount: number;
  networkCount: number;
  activeTradingDays: number;
  avgHoldingTimeDays: number | null;
}

function classifyProfile(inputs: ProfileInputs): {
  profile: TradingProfile;
  indicators: string[];
} {
  const indicators: string[] = [];

  if (inputs.tradeCount === 0 || inputs.tradesPerWeek < PASSIVE_TRADES_PER_WEEK) {
    indicators.push('low_trade_count', 'low_frequency');
    if ((inputs.rotationRate ?? 0) < 0.2) indicators.push('low_rotation_rate');
    return { profile: 'long_term_holder', indicators };
  }

  if (
    inputs.protocolCount >= DEFI_PROTOCOL_COUNT &&
    inputs.networkCount >= 2 &&
    inputs.avgTradeSizeUsd > 0 &&
    inputs.avgTradeSizeUsd < DEFI_AVG_TRADE_USD
  ) {
    indicators.push('many_distinct_protocols', 'multiple_networks', 'low_average_trade_size');
    return { profile: 'defi_explorer', indicators };
  }

  if (inputs.tradesPerWeek >= ACTIVE_TRADES_PER_WEEK && (inputs.turnoverRatio ?? 0) >= 0.5) {
    indicators.push('high_trade_count', 'high_frequency', 'high_volume_vs_portfolio');
    if (inputs.avgHoldingTimeDays != null && inputs.avgHoldingTimeDays <= SHORT_HOLDING_DAYS) {
      indicators.push('short_holding_time');
    }
    return { profile: 'active_trader', indicators };
  }

  const perActiveDay =
    inputs.activeTradingDays > 0 ? inputs.tradeCount / inputs.activeTradingDays : 0;
  if (perActiveDay >= BURST_TRADES_PER_ACTIVE_DAY && inputs.tradesPerWeek < ACTIVE_TRADES_PER_WEEK) {
    indicators.push('medium_trade_count', 'trades_occur_in_bursts');
    if (inputs.avgHoldingTimeDays != null) indicators.push('medium_holding_time');
    return { profile: 'swing_trader', indicators };
  }

  indicators.push('moderate_activity', 'no_dominant_pattern');
  return { profile: 'market_participant', indicators };
}

export function describeTradingProfile(profile: TradingProfile): string {
  switch (profile) {
    case 'long_term_holder':
      return 'The wallet data shows a long-term holding pattern with limited trading activity.';
    case 'active_trader':
      return 'The wallet shows high and continuous trading activity during the period.';
    case 'swing_trader':
      return 'Activity appears in separated bursts rather than continuous daily trading.';
    case 'defi_explorer':
      return 'The wallet interacts with a wide range of protocols at relatively small sizes.';
    default:
      return 'Wallet activity sits in a moderate range with no dominant trading pattern.';
  }
}

// ---------------------------------------------------------------------------
// Patterns (Spec §5.88)
// ---------------------------------------------------------------------------

function detectPatterns(
  metrics: TradingMetrics,
  period: ResolvedPeriod,
  confidence: Confidence,
): Pattern[] {
  const patterns: Pattern[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  // Pattern 1 — Increasing Trading Activity
  const previousCount = metrics.tradeCountComparison.previous;
  if (previousCount > 0 && metrics.tradeCount > previousCount * ACTIVITY_INCREASE_FACTOR) {
    patterns.push({
      id: makePatternId('trading', 'increasing_trading_activity'),
      type: 'increasing_trading_activity',
      name: 'Increasing Trading Activity',
      description: 'Trading activity increased significantly compared to the previous period.',
      category: 'trading',
      confidence,
      evidence: compactEvidence({
        current_trade_count: metrics.tradeCount,
        previous_trade_count: previousCount,
        change_pct: metrics.tradeCountComparison.changePct,
        current_volume_usd: metrics.volumeUsd,
        previous_volume_usd: metrics.volumeComparison.previous,
        period: periodLabel,
      }),
    });
  }

  // Pattern 2 — Asset Rotation Behavior
  if (
    metrics.rotationRate != null &&
    metrics.rotationRate >= HIGH_ROTATION_RATE &&
    metrics.avgHoldingTimeDays != null &&
    metrics.avgHoldingTimeDays <= SHORT_HOLDING_DAYS
  ) {
    patterns.push({
      id: makePatternId('trading', 'asset_rotation_behavior'),
      type: 'asset_rotation_behavior',
      name: 'Asset Rotation Behavior',
      description: 'Exposure moves between assets frequently rather than being held.',
      category: 'trading',
      confidence: metrics.holdingTimeBasis === 'trade_interval' ? confidence : 'low',
      evidence: compactEvidence({
        rotation_rate: metrics.rotationRate,
        unique_assets_traded: metrics.uniqueAssetsTraded,
        assets_held: metrics.assetsHeld,
        avg_holding_time_days: metrics.avgHoldingTimeDays,
        holding_time_basis: metrics.holdingTimeBasis,
        period: periodLabel,
      }),
    });
  }

  // Pattern 3 — Trading Concentration
  const top = metrics.topTradedAsset;
  if (
    top &&
    metrics.tradeCount > 1 &&
    (top.volumeSharePct >= TRADING_CONCENTRATION_PCT ||
      top.tradeSharePct >= TRADING_CONCENTRATION_PCT)
  ) {
    patterns.push({
      id: makePatternId('trading', 'trading_concentration', top.symbol),
      type: 'trading_concentration',
      name: 'Trading Concentration',
      description: 'Most trading activity is concentrated in one asset.',
      category: 'trading',
      confidence,
      evidence: compactEvidence({
        asset: top.symbol,
        volume_share_pct: top.volumeSharePct,
        trade_share_pct: top.tradeSharePct,
        trade_count: top.tradeCount,
        volume_usd: top.volumeUsd,
        period: periodLabel,
      }),
    });
  }

  // Pattern 4 — Network Expansion
  if (metrics.newNetworks.length > 0) {
    patterns.push({
      id: makePatternId('trading', 'network_expansion'),
      type: 'network_expansion',
      name: 'Network Expansion',
      description: 'Trading activity expanded to networks not used in the previous period.',
      category: 'trading',
      confidence,
      evidence: compactEvidence({
        new_networks: metrics.newNetworks.join(', '),
        new_network_count: metrics.newNetworks.length,
        network_count: metrics.networksUsed.length,
        period: periodLabel,
      }),
    });
  }

  // Pattern 5 — Trading Dormancy
  if (metrics.tradeCount === 0 && metrics.assetsHeld > 0) {
    patterns.push({
      id: makePatternId('trading', 'trading_dormancy'),
      type: 'trading_dormancy',
      name: 'Trading Dormancy',
      description:
        'No trading activity was recorded during this period while holdings remained.',
      category: 'trading',
      confidence,
      evidence: compactEvidence({
        trade_count: 0,
        assets_held: metrics.assetsHeld,
        portfolio_value_usd: metrics.portfolioValueUsd,
        period: periodLabel,
      }),
    });
  }

  // Pattern 6 — High Turnover Behavior
  if (metrics.turnoverRatio != null && metrics.turnoverRatio >= HIGH_TURNOVER_RATIO) {
    patterns.push({
      id: makePatternId('trading', 'high_turnover_behavior'),
      type: 'high_turnover_behavior',
      name: 'High Turnover Behavior',
      description: 'Traded volume during the period is several times the portfolio value.',
      category: 'trading',
      confidence,
      evidence: compactEvidence({
        turnover_ratio: metrics.turnoverRatio,
        volume_usd: metrics.volumeUsd,
        portfolio_value_usd: metrics.portfolioValueUsd,
        trade_count: metrics.tradeCount,
        period: periodLabel,
      }),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Insights (Spec §5.91)
// ---------------------------------------------------------------------------

function buildInsights(
  metrics: TradingMetrics,
  patterns: Pattern[],
  period: ResolvedPeriod,
  confidence: Confidence,
): Insight[] {
  const insights: Insight[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  for (const pattern of patterns) {
    insights.push(insightFromPattern(pattern, metrics, periodLabel));
  }

  // Attribution insight — the bridge to Module 01 (Spec §5.89).
  const attr = metrics.attribution;
  if (attr.tradingResultUsd != null && attr.totalChangeUsd != null && attr.appreciationUsd != null) {
    const driver =
      Math.abs(attr.appreciationUsd) >= Math.abs(attr.tradingResultUsd) ? 'price movement' : 'trading activity';
    insights.push({
      id: makeInsightId('trading', 'result_attribution'),
      type: 'result_attribution',
      category: 'trading',
      title: `Value change over ${periodLabel} came mainly from ${driver}`,
      description: `Portfolio value changed by ${formatUsd(attr.totalChangeUsd)} over the period. Of that, ${formatUsd(attr.appreciationUsd)} corresponds to price movement on held assets and ${formatUsd(attr.tradingResultUsd)} remains after removing price movement and net external flows of ${formatUsd(attr.netExternalFlowUsd)}. This shows where the result came from, not whether the activity was effective.`,
      severity: 'informational',
      confidence: attr.basis === 'reconstructed' ? confidence : 'low',
      impact: 'Identifies whether the period result is driven by market movement or by activity.',
      impactUsd: Math.abs(attr.tradingResultUsd),
      evidence: compactEvidence({
        total_change_usd: attr.totalChangeUsd,
        appreciation_usd: attr.appreciationUsd,
        trading_result_usd: attr.tradingResultUsd,
        net_external_flow_usd: attr.netExternalFlowUsd,
        appreciation_share_pct: attr.appreciationSharePct,
        trading_share_pct: attr.tradingSharePct,
        basis: attr.basis,
        period: periodLabel,
      }),
    });
  }

  if (metrics.unpricedTradeCount > 0) {
    insights.push({
      id: makeInsightId('trading', 'unpriced_trades'),
      type: 'unpriced_trades',
      category: 'trading',
      title: `${metrics.unpricedTradeCount} trade(s) carry no USD value`,
      description: `${metrics.unpricedTradeCount} of ${metrics.tradeCount} trades recorded during ${periodLabel} have no usable USD amount, so reported volume covers only part of the activity.`,
      severity: metrics.unpricedTradeCount > metrics.pricedTradeCount ? 'medium' : 'low',
      confidence,
      impact: 'Reported trading volume understates total activity.',
      impactUsd: null,
      evidence: compactEvidence({
        unpriced_trade_count: metrics.unpricedTradeCount,
        priced_trade_count: metrics.pricedTradeCount,
        trade_count: metrics.tradeCount,
        volume_usd: metrics.volumeUsd,
        methodology: metrics.methodology,
      }),
    });
  }

  return insights;
}

function insightFromPattern(
  pattern: Pattern,
  metrics: TradingMetrics,
  periodLabel: string,
): Insight {
  const subject = typeof pattern.evidence.asset === 'string' ? pattern.evidence.asset : null;
  const base = {
    id: makeInsightId('trading', pattern.type, subject),
    type: pattern.type,
    category: 'trading' as const,
    confidence: pattern.confidence,
    evidence: pattern.evidence,
  };

  switch (pattern.type) {
    case 'increasing_trading_activity':
      return {
        ...base,
        title: `Trading activity increased over ${periodLabel}`,
        description: `${metrics.tradeCount} trades were recorded in the current period against ${metrics.tradeCountComparison.previous} in the previous one. The wallet is being managed more actively than before; the data does not show the reason.`,
        severity: 'low',
        impact: 'Operational activity on the wallet increased.',
        impactUsd: metrics.volumeUsd,
      };
    case 'asset_rotation_behavior':
      return {
        ...base,
        title: 'Exposure moves between assets rather than being held',
        description: `${metrics.uniqueAssetsTraded} of ${metrics.assetsHeld} held assets were traded during ${periodLabel}, with an average gap of ${round1(metrics.avgHoldingTimeDays ?? 0)} days between trades on the same asset. Portfolio composition is driven by activity rather than accumulation.`,
        severity: 'medium',
        impact: 'Composition reflects recent activity more than long-term positions.',
        impactUsd: metrics.volumeUsd,
      };
    case 'trading_concentration':
      return {
        ...base,
        title: `Trading activity is concentrated in ${subject ?? 'one asset'}`,
        description: `${subject ?? 'One asset'} accounts for ${formatPct(Number(pattern.evidence.volume_share_pct ?? 0))} of traded volume and ${formatPct(Number(pattern.evidence.trade_share_pct ?? 0))} of trades during ${periodLabel}. Trading results are largely tied to the behaviour of a single asset.`,
        severity: 'medium',
        impact: 'Trading outcomes depend on one asset.',
        impactUsd: Number(pattern.evidence.volume_usd ?? 0),
        relatedEntities: subject ? [subject] : undefined,
      };
    case 'network_expansion':
      return {
        ...base,
        title: 'Trading expanded to additional networks',
        description: `Trades were recorded on ${metrics.newNetworks.length} network(s) that showed no trading activity in the previous period. The operational surface of the wallet increased.`,
        severity: 'low',
        impact: 'More networks are now in use, which widens operational exposure.',
        impactUsd: null,
        relatedEntities: metrics.newNetworks,
      };
    case 'trading_dormancy':
      return {
        ...base,
        title: `No trading activity was recorded during ${periodLabel}`,
        description: `Holdings worth ${formatUsd(metrics.portfolioValueUsd)} remained in place with no trades recorded. Any change in portfolio value during this period came from price movement rather than activity.`,
        severity: 'informational',
        impact: 'Period results are driven entirely by market movement.',
        impactUsd: metrics.portfolioValueUsd,
      };
    default:
      return {
        ...base,
        title: 'Traded volume is several times the portfolio value',
        description: `Volume of ${formatUsd(metrics.volumeUsd)} was recorded against a portfolio value of ${formatUsd(metrics.portfolioValueUsd)} over ${periodLabel}, a ratio of ${round1(metrics.turnoverRatio ?? 0)}x. The same capital was recycled multiple times through trades. Volume measures activity only; it does not indicate profit or loss.`,
        severity: 'medium',
        impact: 'Activity level is high relative to the size of the portfolio.',
        impactUsd: metrics.volumeUsd,
      };
  }
}

// ---------------------------------------------------------------------------
// Summary (Spec §5.93)
// ---------------------------------------------------------------------------

function buildSummary(metrics: TradingMetrics, period: ResolvedPeriod): string {
  if (metrics.tradeCount === 0) {
    return metrics.assetsHeld > 0
      ? `No trades were recorded in the last ${period.days} days while ${metrics.assetsHeld} asset(s) worth ${formatUsd(metrics.portfolioValueUsd)} remained held. Value changes during the period came from price movement rather than activity.`
      : `No trading activity was recorded in the last ${period.days} days.`;
  }

  const parts: string[] = [];
  parts.push(
    `${metrics.tradeCount} trades totalling ${formatUsd(metrics.volumeUsd)} were recorded in the last ${period.days} days, averaging ${formatUsd(metrics.avgTradeSizeUsd)} per trade and ${round1(metrics.tradesPerWeek)} trades per week.`,
  );
  parts.push(describeTradingProfile(metrics.profile));

  if (metrics.topTradedAsset) {
    parts.push(
      `${metrics.topTradedAsset.symbol} carried the largest share of traded volume at ${formatPct(metrics.topTradedAsset.volumeSharePct)}.`,
    );
  }
  if (metrics.turnoverRatio != null && metrics.portfolioValueUsd > 0) {
    parts.push(`Traded volume equals ${round1(metrics.turnoverRatio)}x the current portfolio value.`);
  }
  const attr = metrics.attribution;
  if (attr.tradingResultUsd != null && attr.appreciationUsd != null) {
    parts.push(
      `After removing price movement (${formatUsd(attr.appreciationUsd)}) and net external flows (${formatUsd(attr.netExternalFlowUsd)}), the residual attributable to activity is ${formatUsd(attr.tradingResultUsd)}.`,
    );
  }

  return parts.join(' ');
}

/** Activity intensity 0–100, exposed for Risk Intelligence Layer 4. */
export function tradingActivityScore(metrics: TradingMetrics): number {
  const frequencyPart = clamp((metrics.tradesPerWeek / ACTIVE_TRADES_PER_WEEK) * 60, 0, 60);
  const turnoverPart = clamp(((metrics.turnoverRatio ?? 0) / HIGH_TURNOVER_RATIO) * 40, 0, 40);
  return Math.round(frequencyPart + turnoverPart);
}

/** Volume relative to portfolio value; `null` when the portfolio value is unknown. */
export function tradingTurnoverRatio(metrics: TradingMetrics): number | null {
  return safeDiv(metrics.volumeUsd, metrics.portfolioValueUsd);
}
