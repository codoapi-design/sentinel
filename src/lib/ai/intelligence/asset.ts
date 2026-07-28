/**
 * Module 04 — Asset Intelligence (Spec §5.49–§5.64).
 *
 * Describes what each asset *does* inside the portfolio: weight, performance
 * contribution, behaviour, activity, turnover, lifecycle stage, and an
 * in-portfolio health score.
 *
 * `Raw Data = What you own · Intelligence = What it does` (Spec §5.50).
 * Classification describes the asset's state inside this portfolio — it is
 * never a judgement about the project (Spec §5.54, §5.58).
 */

import {
  buildAssetLedger,
  buildDataQuality,
  clamp,
  compactEvidence,
  deriveConfidence,
  formatPeriodLabel,
  formatPct,
  formatUsd,
  lowestConfidence,
  makeInsightId,
  makePatternId,
  resolvePeriod,
  resolvePortfolioValueUsd,
  resolveTransactions,
  round1,
  round2,
  score100,
  sharePct,
  sum,
  topN,
  type AssetCategory,
  type AssetLedgerEntry,
  type ResolvedPeriod,
} from './shared';
import type {
  Confidence,
  Insight,
  IntelligenceInput,
  IntelligenceResult,
  Pattern,
} from './types';

/** In-portfolio role, not an investment rating (Spec §5.54). */
export type AssetClassification =
  | 'core'
  | 'trading'
  | 'growth'
  | 'declining'
  | 'dormant'
  | 'suspicious'
  | 'stable';

/** Where the asset stands over time (Spec §5.51 Asset Lifecycle). */
export type AssetLifecycleStage = 'growing' | 'stable' | 'declining' | 'dormant' | 'abandoned';

export interface AssetHealthScore {
  total: number;
  components: {
    contribution: number;
    stability: number;
    allocation: number;
    activity: number;
    dataQuality: number;
  };
  weights: {
    contribution: 30;
    stability: 20;
    allocation: 20;
    activity: 15;
    dataQuality: 15;
  };
}

export interface AssetProfile {
  symbol: string;
  name: string | null;
  network: string;
  category: AssetCategory;
  isStablecoin: boolean;
  held: boolean;
  quantity: number | null;
  priceUsd: number | null;
  valueUsd: number;
  allocationPct: number;
  rank: number;
  /** Total value change over the window; `null` when the start state is unknown. */
  contributionUsd: number | null;
  /** Share of the portfolio's total value change. */
  contributionPct: number | null;
  /** Value change from price movement alone. */
  appreciationUsd: number | null;
  priceChangePct: number | null;
  allocationStartPct: number | null;
  allocationDriftPct: number | null;
  netFlowUsd: number;
  volumeUsd: number;
  txCount: number;
  periodTxCount: number;
  tradeCount: number;
  turnoverRate: number | null;
  holdingDurationDays: number | null;
  daysSinceLastActivity: number | null;
  classification: AssetClassification;
  lifecycle: AssetLifecycleStage;
  healthScore: AssetHealthScore;
  confidence: Confidence;
}

export interface AssetMetrics {
  periodDays: number;
  portfolioValueUsd: number;
  portfolioChangeUsd: number | null;
  assetCount: number;
  heldAssetCount: number;
  assets: AssetProfile[];
  topContributors: AssetProfile[];
  topDetractors: AssetProfile[];
  dominantAsset: AssetProfile | null;
  dormantAssets: AssetProfile[];
  suspiciousAssets: AssetProfile[];
  classificationCounts: Record<AssetClassification, number>;
  /** Share of value in assets whose start state could be reconstructed. */
  reconstructedValueSharePct: number;
}

export type AssetIntelligence = IntelligenceResult<AssetMetrics>;

const DOMINANT_ALLOCATION_PCT = 50;
const CORE_ALLOCATION_PCT = 20;
const CORE_HOLDING_DAYS = 60;
const PERFORMANCE_LEADER_SHARE = 40;
const DORMANT_DAYS = 60;
const FORGOTTEN_DAYS = 90;
const FORGOTTEN_ALLOCATION_PCT = 3;
const ALLOCATION_DRIFT_PP = 10;
const TRADING_TURNOVER = 1.5;

const HEALTH_WEIGHTS = {
  contribution: 30,
  stability: 20,
  allocation: 20,
  activity: 15,
  dataQuality: 15,
} as const;

export function analyzeAssets(input: IntelligenceInput): AssetIntelligence {
  const period = resolvePeriod(input);
  const dataQuality = buildDataQuality(resolveTransactions(input));
  const ledger = buildAssetLedger(input, period);
  const portfolioValueUsd = resolvePortfolioValueUsd(input);
  const portfolioChangeUsd =
    ledger.totalStartValueUsd != null ? round2(ledger.totalValueUsd - ledger.totalStartValueUsd) : null;

  const assets = ledger.entries
    .filter(entry => entry.held || entry.periodTxCount > 0)
    .map((entry, index) => buildProfile(entry, index, portfolioValueUsd, portfolioChangeUsd));

  const heldAssets = assets.filter(a => a.held);
  const withContribution = assets.filter(a => a.contributionUsd != null);
  const topContributors = topN(
    withContribution.filter(a => (a.contributionUsd as number) > 0),
    3,
    a => a.contributionUsd as number,
  );
  const topDetractors = topN(
    withContribution.filter(a => (a.contributionUsd as number) < 0),
    3,
    a => -(a.contributionUsd as number),
  );

  const reconstructedValueUsd = sum(
    ledger.entries.filter(e => e.valueStartUsd != null).map(e => e.valueUsd),
  );

  const metrics: AssetMetrics = {
    periodDays: period.days,
    portfolioValueUsd,
    portfolioChangeUsd,
    assetCount: assets.length,
    heldAssetCount: heldAssets.length,
    assets,
    topContributors,
    topDetractors,
    dominantAsset: heldAssets.find(a => a.allocationPct >= DOMINANT_ALLOCATION_PCT) ?? null,
    dormantAssets: heldAssets.filter(a => a.classification === 'dormant'),
    suspiciousAssets: assets.filter(a => a.classification === 'suspicious'),
    classificationCounts: countClassifications(assets),
    reconstructedValueSharePct: sharePct(reconstructedValueUsd, ledger.totalValueUsd),
  };

  const confidence = lowestConfidence(
    deriveConfidence(dataQuality, { minSampleForHigh: 10, minSampleForMedium: 2 }),
    assets.length === 0 ? 'low' : 'high',
    metrics.reconstructedValueSharePct >= 70
      ? 'high'
      : metrics.reconstructedValueSharePct >= 30
        ? 'medium'
        : 'low',
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
      asset_count: metrics.assetCount,
      held_asset_count: metrics.heldAssetCount,
      portfolio_value_usd: metrics.portfolioValueUsd,
      portfolio_change_usd: metrics.portfolioChangeUsd,
      top_contributor: metrics.topContributors[0]?.symbol,
      top_detractor: metrics.topDetractors[0]?.symbol,
      dormant_asset_count: metrics.dormantAssets.length,
      suspicious_asset_count: metrics.suspiciousAssets.length,
      reconstructed_value_share_pct: metrics.reconstructedValueSharePct,
    }),
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Per-asset profile (Spec §5.53 / §5.54 / §5.56)
// ---------------------------------------------------------------------------

function buildProfile(
  entry: AssetLedgerEntry,
  index: number,
  portfolioValueUsd: number,
  portfolioChangeUsd: number | null,
): AssetProfile {
  const classification = classifyAsset(entry);
  const lifecycle = resolveLifecycle(entry, classification);
  const healthScore = computeAssetHealth(entry);

  return {
    symbol: entry.symbol,
    name: entry.name,
    network: entry.network,
    category: entry.category,
    isStablecoin: entry.isStablecoin,
    held: entry.held,
    quantity: entry.quantity,
    priceUsd: entry.priceUsd,
    valueUsd: entry.valueUsd,
    allocationPct: sharePct(entry.valueUsd, portfolioValueUsd),
    rank: index + 1,
    contributionUsd: entry.valueChangeUsd,
    contributionPct:
      entry.valueChangeUsd != null && portfolioChangeUsd != null && portfolioChangeUsd !== 0
        ? round2((entry.valueChangeUsd / Math.abs(portfolioChangeUsd)) * 100)
        : null,
    appreciationUsd: entry.appreciationUsd,
    priceChangePct: entry.priceChangePct,
    allocationStartPct: entry.allocationStartPct,
    allocationDriftPct: entry.allocationDriftPct,
    netFlowUsd: entry.netFlowUsd,
    volumeUsd: entry.volumeUsd,
    txCount: entry.txCount,
    periodTxCount: entry.periodTxCount,
    tradeCount: entry.tradeCount,
    turnoverRate: entry.turnoverRate,
    holdingDurationDays: entry.holdingDurationDays,
    daysSinceLastActivity: entry.daysSinceLastActivity,
    classification,
    lifecycle,
    healthScore,
    confidence: resolveAssetConfidence(entry),
  };
}

function classifyAsset(entry: AssetLedgerEntry): AssetClassification {
  const unknownToken = entry.symbol === 'UNKNOWN' || entry.category === 'unknown';
  const noPrice = entry.priceUsd == null;
  if (entry.held && unknownToken && noPrice) return 'suspicious';
  if (entry.held && noPrice && entry.unpricedTxCount > entry.pricedTxCount) return 'suspicious';

  const inactive = entry.daysSinceLastActivity == null || entry.daysSinceLastActivity >= DORMANT_DAYS;
  if (entry.held && inactive && entry.periodTxCount === 0) return 'dormant';

  if (entry.tradeCount >= 4 || (entry.turnoverRate != null && entry.turnoverRate >= TRADING_TURNOVER)) {
    return 'trading';
  }

  if (entry.valueChangeUsd != null) {
    if (entry.valueChangeUsd > 0 && (entry.allocationDriftPct ?? 0) > 0) return 'growth';
    if (entry.valueChangeUsd < 0) return 'declining';
  }

  if (
    entry.allocationPct >= CORE_ALLOCATION_PCT &&
    (entry.holdingDurationDays ?? 0) >= CORE_HOLDING_DAYS
  ) {
    return 'core';
  }

  return 'stable';
}

function resolveLifecycle(
  entry: AssetLedgerEntry,
  classification: AssetClassification,
): AssetLifecycleStage {
  if (!entry.held) return 'abandoned';
  if (classification === 'dormant') {
    return (entry.daysSinceLastActivity ?? 0) >= FORGOTTEN_DAYS ? 'abandoned' : 'dormant';
  }
  if (entry.valueChangeUsd != null && entry.valueChangeUsd > 0) return 'growing';
  if (entry.valueChangeUsd != null && entry.valueChangeUsd < 0) return 'declining';
  return 'stable';
}

/**
 * In-portfolio evaluation, not an investment rating (Spec §5.56).
 * Each component is 0–100 before weighting.
 */
function computeAssetHealth(entry: AssetLedgerEntry): AssetHealthScore {
  // Contribution: 50 is neutral; ±20% price movement saturates the component.
  const contribution =
    entry.priceChangePct != null
      ? score100(50 + clamp(entry.priceChangePct, -20, 20) * 2.5)
      : entry.valueChangeUsd != null && entry.valueUsd > 0
        ? score100(50 + clamp((entry.valueChangeUsd / entry.valueUsd) * 100, -20, 20) * 2.5)
        : 50;

  // Stability: wider observed price movement lowers the component in either direction.
  const stability =
    entry.priceChangePct != null
      ? score100(100 - Math.min(100, Math.abs(entry.priceChangePct) * 2))
      : entry.isStablecoin
        ? 90
        : 50;

  // Allocation: balanced weight scores highest; both marginal and dominant positions score lower.
  const allocation = score100(
    entry.allocationPct <= 0
      ? 30
      : entry.allocationPct <= 30
        ? 60 + entry.allocationPct * 1.33
        : 100 - (entry.allocationPct - 30) * 1.1,
  );

  // Activity: whether the position is being operated at all.
  const activity =
    entry.daysSinceLastActivity == null
      ? 20
      : score100(100 - (entry.daysSinceLastActivity / 90) * 100);

  const dataQuality = score100(
    (entry.priceUsd != null ? 60 : 0) +
      (entry.category !== 'unknown' ? 20 : 0) +
      (entry.txCount > 0 ? sharePct(entry.pricedTxCount, entry.txCount) * 0.2 : 20),
  );

  const total = score100(
    (contribution * HEALTH_WEIGHTS.contribution +
      stability * HEALTH_WEIGHTS.stability +
      allocation * HEALTH_WEIGHTS.allocation +
      activity * HEALTH_WEIGHTS.activity +
      dataQuality * HEALTH_WEIGHTS.dataQuality) /
      100,
  );

  return {
    total,
    components: { contribution, stability, allocation, activity, dataQuality },
    weights: HEALTH_WEIGHTS,
  };
}

function resolveAssetConfidence(entry: AssetLedgerEntry): Confidence {
  if (entry.priceUsd == null) return 'low';
  if (entry.valueStartUsd == null) return 'low';
  if (entry.pricedTxCount >= 5) return 'high';
  if (entry.pricedTxCount >= 1) return 'medium';
  return 'medium';
}

function countClassifications(assets: AssetProfile[]): Record<AssetClassification, number> {
  const counts: Record<AssetClassification, number> = {
    core: 0,
    trading: 0,
    growth: 0,
    declining: 0,
    dormant: 0,
    suspicious: 0,
    stable: 0,
  };
  for (const asset of assets) counts[asset.classification] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Patterns (Spec §5.55)
// ---------------------------------------------------------------------------

function detectPatterns(
  metrics: AssetMetrics,
  period: ResolvedPeriod,
  confidence: Confidence,
): Pattern[] {
  const patterns: Pattern[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  // Pattern 1 — Dominant Asset
  if (metrics.dominantAsset) {
    const asset = metrics.dominantAsset;
    patterns.push({
      id: makePatternId('asset', 'dominant_asset', asset.symbol),
      type: 'dominant_asset',
      name: 'Dominant Asset',
      description: `${asset.symbol} represents ${formatPct(asset.allocationPct)} of portfolio value.`,
      category: 'asset',
      confidence,
      evidence: compactEvidence({
        asset: asset.symbol,
        allocation_pct: asset.allocationPct,
        value_usd: asset.valueUsd,
        portfolio_value_usd: metrics.portfolioValueUsd,
      }),
    });
  }

  // Pattern 2 — Performance Leader
  const totalGain = sum(
    metrics.assets
      .map(a => a.contributionUsd ?? 0)
      .filter(value => value > 0),
  );
  const leader = metrics.topContributors[0];
  if (leader && totalGain > 0) {
    const leaderShare = sharePct(leader.contributionUsd ?? 0, totalGain);
    if (leaderShare >= PERFORMANCE_LEADER_SHARE) {
      patterns.push({
        id: makePatternId('asset', 'performance_leader', leader.symbol),
        type: 'performance_leader',
        name: 'Performance Leader',
        description: `${leader.symbol} accounts for most of the positive value change recorded during the period.`,
        category: 'asset',
        confidence: leader.confidence,
        evidence: compactEvidence({
          asset: leader.symbol,
          contribution_usd: leader.contributionUsd,
          share_of_gain_pct: leaderShare,
          allocation_pct: leader.allocationPct,
          price_change_pct: leader.priceChangePct,
          period: periodLabel,
        }),
      });
    }
  }

  // Pattern 3 — Hidden Underperformer
  const detractor = metrics.topDetractors[0];
  if (detractor && metrics.portfolioChangeUsd != null && metrics.portfolioChangeUsd > 0) {
    patterns.push({
      id: makePatternId('asset', 'hidden_underperformer', detractor.symbol),
      type: 'hidden_underperformer',
      name: 'Hidden Underperformer',
      description: `${detractor.symbol} declined while total portfolio value increased.`,
      category: 'asset',
      confidence: detractor.confidence,
      evidence: compactEvidence({
        asset: detractor.symbol,
        asset_change_usd: detractor.contributionUsd,
        portfolio_change_usd: metrics.portfolioChangeUsd,
        allocation_pct: detractor.allocationPct,
        period: periodLabel,
      }),
    });
  }

  // Pattern 4 — Allocation Drift
  const drifted = topN(
    metrics.assets.filter(a => Math.abs(a.allocationDriftPct ?? 0) >= ALLOCATION_DRIFT_PP),
    1,
    a => Math.abs(a.allocationDriftPct ?? 0),
  )[0];
  if (drifted) {
    patterns.push({
      id: makePatternId('asset', 'allocation_drift', drifted.symbol),
      type: 'allocation_drift',
      name: 'Allocation Drift',
      description: `The weight of ${drifted.symbol} inside the portfolio changed significantly during the period.`,
      category: 'asset',
      confidence: drifted.confidence,
      evidence: compactEvidence({
        asset: drifted.symbol,
        previous_allocation_pct: drifted.allocationStartPct,
        current_allocation_pct: drifted.allocationPct,
        drift_pp: drifted.allocationDriftPct,
        net_flow_usd: drifted.netFlowUsd,
        price_change_pct: drifted.priceChangePct,
        period: periodLabel,
      }),
    });
  }

  // Pattern 5 — Forgotten Asset
  const forgotten = metrics.assets.filter(
    a =>
      a.held &&
      a.allocationPct >= FORGOTTEN_ALLOCATION_PCT &&
      (a.daysSinceLastActivity == null || a.daysSinceLastActivity >= FORGOTTEN_DAYS),
  );
  const mostForgotten = topN(forgotten, 1, a => a.valueUsd)[0];
  if (mostForgotten) {
    patterns.push({
      id: makePatternId('asset', 'forgotten_asset', mostForgotten.symbol),
      type: 'forgotten_asset',
      name: 'Forgotten Asset',
      description: `${mostForgotten.symbol} has remained without recorded activity for an extended period while still holding material value.`,
      category: 'asset',
      confidence,
      evidence: compactEvidence({
        asset: mostForgotten.symbol,
        days_since_last_activity: mostForgotten.daysSinceLastActivity,
        value_usd: mostForgotten.valueUsd,
        allocation_pct: mostForgotten.allocationPct,
      }),
    });
  }

  // Pattern 6 — Asset Rotation
  const rotation = detectRotation(metrics.assets);
  if (rotation) {
    patterns.push({
      id: makePatternId('asset', 'asset_rotation', `${rotation.from.symbol}-${rotation.to.symbol}`),
      type: 'asset_rotation',
      name: 'Asset Rotation',
      description: `Exposure appears to have shifted from ${rotation.from.symbol} toward ${rotation.to.symbol} during the period.`,
      category: 'asset',
      confidence: lowestConfidence(rotation.from.confidence, rotation.to.confidence),
      evidence: compactEvidence({
        from_asset: rotation.from.symbol,
        from_drift_pp: rotation.from.allocationDriftPct,
        from_net_flow_usd: rotation.from.netFlowUsd,
        to_asset: rotation.to.symbol,
        to_drift_pp: rotation.to.allocationDriftPct,
        to_net_flow_usd: rotation.to.netFlowUsd,
        period: periodLabel,
      }),
    });
  }

  return patterns;
}

function detectRotation(
  assets: AssetProfile[],
): { from: AssetProfile; to: AssetProfile } | null {
  const decreasing = assets
    .filter(a => (a.allocationDriftPct ?? 0) <= -ALLOCATION_DRIFT_PP && a.periodTxCount > 0)
    .sort((a, b) => (a.allocationDriftPct ?? 0) - (b.allocationDriftPct ?? 0));
  const increasing = assets
    .filter(a => (a.allocationDriftPct ?? 0) >= ALLOCATION_DRIFT_PP && a.periodTxCount > 0)
    .sort((a, b) => (b.allocationDriftPct ?? 0) - (a.allocationDriftPct ?? 0));
  if (decreasing.length === 0 || increasing.length === 0) return null;
  if (decreasing[0].symbol === increasing[0].symbol) return null;
  return { from: decreasing[0], to: increasing[0] };
}

// ---------------------------------------------------------------------------
// Insights (Spec §5.57 / §5.58)
// ---------------------------------------------------------------------------

function buildInsights(
  metrics: AssetMetrics,
  patterns: Pattern[],
  period: ResolvedPeriod,
  confidence: Confidence,
): Insight[] {
  const insights: Insight[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  if (metrics.assetCount === 0) {
    insights.push({
      id: makeInsightId('asset', 'no_assets'),
      type: 'no_assets',
      category: 'asset',
      title: 'No assets were available for analysis',
      description: 'No holdings or token activity were supplied, so per-asset analysis could not run.',
      severity: 'informational',
      confidence: 'low',
      impactUsd: null,
      evidence: compactEvidence({ asset_count: 0 }),
    });
    return insights;
  }

  for (const pattern of patterns) {
    insights.push(insightFromPattern(pattern, metrics, periodLabel));
  }

  if (metrics.suspiciousAssets.length > 0) {
    const value = round2(sum(metrics.suspiciousAssets.map(a => a.valueUsd)));
    insights.push({
      id: makeInsightId('asset', 'unclassified_assets'),
      type: 'unclassified_assets',
      category: 'asset',
      title: `${metrics.suspiciousAssets.length} asset(s) could not be classified`,
      description: `Some holdings carry no reliable price or token metadata in the available data. They are excluded from detailed per-asset analysis and reduce analysis confidence. This is a data limitation, not a judgement about the tokens.`,
      severity: 'low',
      confidence,
      impact: 'Part of the holdings could not be analysed in detail.',
      impactUsd: value,
      relatedEntities: metrics.suspiciousAssets.map(a => a.symbol),
      evidence: compactEvidence({
        unclassified_asset_count: metrics.suspiciousAssets.length,
        unclassified_value_usd: value,
        portfolio_value_usd: metrics.portfolioValueUsd,
      }),
    });
  }

  const leadDormant = topN(metrics.dormantAssets, 1, a => a.valueUsd)[0];
  if (leadDormant && !patterns.some(p => p.type === 'forgotten_asset')) {
    insights.push({
      id: makeInsightId('asset', 'dormant_asset', leadDormant.symbol),
      type: 'dormant_asset',
      category: 'asset',
      title: `${leadDormant.symbol} recorded no activity during the period`,
      description: `${leadDormant.symbol} holds ${formatUsd(leadDormant.valueUsd)} (${formatPct(leadDormant.allocationPct)} of value) with no transactions recorded in the last ${period.days} days. The holding continues to affect portfolio exposure despite the absence of activity.`,
      severity: 'informational',
      confidence,
      impactUsd: leadDormant.valueUsd,
      relatedEntities: [leadDormant.symbol],
      evidence: compactEvidence({
        asset: leadDormant.symbol,
        value_usd: leadDormant.valueUsd,
        allocation_pct: leadDormant.allocationPct,
        days_since_last_activity: leadDormant.daysSinceLastActivity,
        period: periodLabel,
      }),
    });
  }

  return insights;
}

function insightFromPattern(
  pattern: Pattern,
  metrics: AssetMetrics,
  periodLabel: string,
): Insight {
  const asset = String(pattern.evidence.asset ?? pattern.evidence.from_asset ?? '');
  const base = {
    id: makeInsightId('asset', pattern.type, asset),
    type: pattern.type,
    category: 'asset' as const,
    confidence: pattern.confidence,
    evidence: pattern.evidence,
    relatedEntities: asset ? [asset] : undefined,
  };

  switch (pattern.type) {
    case 'dominant_asset':
      return {
        ...base,
        title: `${asset} represents the majority of portfolio value`,
        description: `${asset} accounts for ${formatPct(Number(pattern.evidence.allocation_pct ?? 0))} of total value, so overall portfolio behaviour is largely determined by the behaviour of this asset.`,
        severity: 'medium',
        impact: 'Portfolio value follows the movement of this asset closely.',
        impactUsd: Number(pattern.evidence.value_usd ?? 0),
      };
    case 'performance_leader':
      return {
        ...base,
        title: `${asset} drove most of the value increase`,
        description: `${asset} contributed ${formatUsd(Number(pattern.evidence.contribution_usd ?? 0))}, which is ${formatPct(Number(pattern.evidence.share_of_gain_pct ?? 0))} of the total positive change recorded over ${periodLabel}.`,
        severity: 'informational',
        impact: 'Results during the period depend on a single performance driver.',
        impactUsd: Math.abs(Number(pattern.evidence.contribution_usd ?? 0)),
      };
    case 'hidden_underperformer':
      return {
        ...base,
        title: `${asset} reduced the overall portfolio result`,
        description: `Total portfolio value increased ${formatUsd(Number(pattern.evidence.portfolio_change_usd ?? 0))} over ${periodLabel} while ${asset} recorded a change of ${formatUsd(Number(pattern.evidence.asset_change_usd ?? 0))}. The overall result hides this negative contribution.`,
        severity: 'medium',
        impact: 'The headline result understates a decline in one position.',
        impactUsd: Math.abs(Number(pattern.evidence.asset_change_usd ?? 0)),
      };
    case 'allocation_drift':
      return {
        ...base,
        title: `The weight of ${asset} in the portfolio changed significantly`,
        description: `${asset} moved from ${formatPct(Number(pattern.evidence.previous_allocation_pct ?? 0))} to ${formatPct(Number(pattern.evidence.current_allocation_pct ?? 0))} of portfolio value over ${periodLabel}. The change may come from price movement, additional inflows, or reduction in other assets.`,
        severity: 'low',
        impact: 'Exposure to this asset differs from the start of the window.',
        impactUsd: Math.abs(Number(pattern.evidence.net_flow_usd ?? 0)),
      };
    case 'forgotten_asset':
      return {
        ...base,
        title: `${asset} has been without recorded activity for an extended period`,
        description: `No transactions were recorded for ${asset} in ${formatDaysLabel(pattern.evidence.days_since_last_activity)}, while it still holds ${formatUsd(Number(pattern.evidence.value_usd ?? 0))} (${formatPct(Number(pattern.evidence.allocation_pct ?? 0))} of value).`,
        severity: 'low',
        impact: 'The holding continues to affect exposure despite no recent activity.',
        impactUsd: Number(pattern.evidence.value_usd ?? 0),
      };
    default: {
      const to = String(pattern.evidence.to_asset ?? '');
      return {
        ...base,
        title: `Exposure shifted between ${asset} and ${to}`,
        description: `Over ${periodLabel}, the weight of ${asset} fell by ${round1(Math.abs(Number(pattern.evidence.from_drift_pp ?? 0)))} percentage points while ${to} rose by ${round1(Number(pattern.evidence.to_drift_pp ?? 0))} percentage points. The data shows the movement only; it does not show a decision behind it.`,
        severity: 'informational',
        impactUsd: Math.max(
          Math.abs(Number(pattern.evidence.from_net_flow_usd ?? 0)),
          Math.abs(Number(pattern.evidence.to_net_flow_usd ?? 0)),
        ),
        relatedEntities: [asset, to].filter(Boolean),
      };
    }
  }
}

function formatDaysLabel(value: string | number | undefined): string {
  const num = typeof value === 'number' ? value : Number(value ?? NaN);
  return Number.isFinite(num) ? `${Math.round(num)} days` : 'the full synced history';
}

// ---------------------------------------------------------------------------
// Summary (Spec §5.60)
// ---------------------------------------------------------------------------

function buildSummary(metrics: AssetMetrics, period: ResolvedPeriod): string {
  if (metrics.assetCount === 0) {
    return 'No assets were supplied, so per-asset analysis could not be produced.';
  }

  const parts: string[] = [];
  const largest = metrics.assets[0];
  parts.push(
    `The portfolio spans ${metrics.heldAssetCount} held asset(s) worth ${formatUsd(metrics.portfolioValueUsd)}.`,
  );
  if (largest) {
    parts.push(`${largest.symbol} carries the largest weight at ${formatPct(largest.allocationPct)}.`);
  }

  const leader = metrics.topContributors[0];
  if (leader?.contributionUsd != null) {
    parts.push(
      `Over the last ${period.days} days the largest positive contribution came from ${leader.symbol} at ${formatUsd(leader.contributionUsd)}.`,
    );
  }
  const detractor = metrics.topDetractors[0];
  if (detractor?.contributionUsd != null) {
    parts.push(
      `The largest negative contribution came from ${detractor.symbol} at ${formatUsd(detractor.contributionUsd)}.`,
    );
  }

  if (metrics.dormantAssets.length > 0) {
    parts.push(
      `${metrics.dormantAssets.length} held asset(s) recorded no activity during the window.`,
    );
  }
  if (metrics.suspiciousAssets.length > 0) {
    parts.push(
      `${metrics.suspiciousAssets.length} asset(s) could not be classified from the available data.`,
    );
  }

  return parts.join(' ');
}

/** Assets ranked by absolute contribution — used by Performance attribution surfaces. */
export function rankAssetsByContribution(metrics: AssetMetrics, limit = 5): AssetProfile[] {
  return topN(metrics.assets, limit, a => Math.abs(a.contributionUsd ?? 0));
}
