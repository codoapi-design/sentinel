/**
 * Module 03 — Portfolio Intelligence (Spec §5.31–§5.48).
 *
 * Treats the portfolio as a financial entity rather than a list of balances:
 * composition, concentration, four levels of diversification, a structural
 * Portfolio Health Score, wallet behaviour classification, and evolution.
 *
 * `Description = What you own · Analysis = What it means` (Spec §5.32).
 * The health score is structural — never an investment rating (Spec §5.36).
 */

import {
  buildAssetLedger,
  buildDataQuality,
  compactEvidence,
  deriveConfidence,
  distributionScore,
  formatPeriodLabel,
  formatPct,
  formatUsd,
  herfindahl,
  lowestConfidence,
  makeInsightId,
  makePatternId,
  resolvePeriod,
  resolvePortfolioValueUsd,
  resolveSnapshots,
  resolveTransactions,
  round1,
  round2,
  score100,
  sharePct,
  splitByPeriod,
  sum,
  topN,
  txNetwork,
  txTimestampMs,
  txType,
  type AssetCategory,
  type AssetLedger,
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

export interface AssetAllocation {
  symbol: string;
  name: string | null;
  valueUsd: number;
  allocationPct: number;
  network: string;
  category: AssetCategory;
  isStablecoin: boolean;
  priceKnown: boolean;
}

export interface NetworkAllocation {
  network: string;
  valueUsd: number;
  allocationPct: number;
  assetCount: number;
}

export interface CategoryAllocation {
  category: AssetCategory;
  valueUsd: number;
  allocationPct: number;
  assetCount: number;
}

/** Structural score only — never an investment rating (Spec §5.36). */
export interface PortfolioHealthScore {
  /** 0–100 total. */
  total: number;
  /** Weighted points actually earned, out of each component's weight. */
  breakdown: {
    diversification: number;
    concentration: number;
    activity: number;
    stability: number;
    dataCompleteness: number;
  };
  /** Raw 0–100 component scores before weighting. */
  components: {
    diversification: number;
    concentration: number;
    activity: number;
    stability: number;
    dataCompleteness: number;
  };
  weights: {
    diversification: 30;
    concentration: 25;
    activity: 20;
    stability: 15;
    dataCompleteness: 10;
  };
  /** Component with the largest shortfall against its weight. */
  limitingFactor: string;
}

/** Behaviour of the wallet, never of the person (Spec §5.39). */
export type PortfolioBehaviorProfile =
  | 'long_term_holder'
  | 'active_trader'
  | 'multi_chain_explorer'
  | 'passive_investor';

export interface DiversificationBreakdown {
  /** 0–100 spread of value across assets. */
  assetDiversity: number;
  networkDiversity: number;
  categoryDiversity: number;
  /** Spread across distinct network × category risk sources. */
  exposureDiversity: number;
  /** 0–1 Herfindahl index over asset shares; 1 = a single asset. */
  herfindahlIndex: number;
}

export interface PortfolioEvolution {
  previousValueUsd: number | null;
  valueChangeUsd: number | null;
  previousTopAssetSymbol: string | null;
  previousTopAssetSharePct: number | null;
  topAssetShareChangePct: number | null;
  previousStablecoinSharePct: number | null;
  stablecoinShareChangePct: number | null;
  /** Sum of absolute allocation drift across assets, in percentage points. */
  allocationShiftPct: number | null;
}

export interface PortfolioMetrics {
  periodDays: number;
  totalValueUsd: number;
  assetCount: number;
  networkCount: number;
  categoryCount: number;
  allocations: AssetAllocation[];
  networks: NetworkAllocation[];
  categories: CategoryAllocation[];
  topAssetSymbol: string | null;
  topAssetSharePct: number;
  top3SharePct: number;
  topNetwork: string | null;
  topNetworkSharePct: number;
  stablecoinSharePct: number;
  unpricedValueSharePct: number;
  diversification: DiversificationBreakdown;
  healthScore: PortfolioHealthScore;
  behaviorProfile: PortfolioBehaviorProfile;
  behaviorIndicators: Record<string, number>;
  evolution: PortfolioEvolution | null;
  transactionCount: number;
}

export type PortfolioIntelligence = IntelligenceResult<PortfolioMetrics>;

const SINGLE_ASSET_DEPENDENCY_PCT = 50;
const EXTREME_CONCENTRATION_PCT = 75;
const CONCENTRATION_INCREASE_PP = 10;
const ALLOCATION_SHIFT_PP = 20;

export function analyzePortfolio(input: IntelligenceInput): PortfolioIntelligence {
  const period = resolvePeriod(input);
  const txs = resolveTransactions(input);
  const dataQuality = buildDataQuality(txs);
  const ledger = buildAssetLedger(input, period);
  const totalValueUsd = resolvePortfolioValueUsd(input);

  const held = ledger.entries.filter(e => e.held && e.valueUsd > 0);
  const allocations = buildAllocations(held, totalValueUsd);
  const networks = buildNetworkAllocations(held, totalValueUsd);
  const categories = buildCategoryAllocations(held, totalValueUsd);

  const top3SharePct = round2(
    sum(topN(allocations, 3, a => a.valueUsd).map(a => a.allocationPct)),
  );
  const topAsset = allocations[0] ?? null;
  const topNetwork = networks[0] ?? null;
  const stablecoinSharePct = round2(
    sum(allocations.filter(a => a.isStablecoin).map(a => a.allocationPct)),
  );

  const diversification: DiversificationBreakdown = {
    assetDiversity: distributionScore(allocations.map(a => a.allocationPct)),
    networkDiversity: distributionScore(networks.map(n => n.allocationPct)),
    categoryDiversity: distributionScore(categories.map(c => c.allocationPct)),
    exposureDiversity: computeExposureDiversity(held, totalValueUsd),
    herfindahlIndex: herfindahl(allocations.map(a => a.allocationPct)),
  };

  const periodTxs = splitByPeriod(txs, txTimestampMs, period).current;
  const behavior = classifyBehavior({
    periodTxCount: periodTxs.length,
    periodDays: period.days,
    tradeCount: periodTxs.filter(tx => txType(tx) === 'trade').length,
    networkCount: networks.length,
    activeNetworkCount: new Set(periodTxs.map(txNetwork)).size,
    bridgeCount: periodTxs.filter(tx => txType(tx) === 'bridge').length,
    assetCount: allocations.length,
    topNetworkSharePct: topNetwork?.allocationPct ?? 0,
  });

  const evolution = buildEvolution(ledger, input, period, topAsset?.symbol ?? null, stablecoinSharePct);

  const healthScore = computeHealthScore({
    diversification,
    topAssetSharePct: topAsset?.allocationPct ?? 0,
    top3SharePct,
    periodTxCount: periodTxs.length,
    periodDays: period.days,
    stablecoinSharePct,
    dataCompleteness: dataQuality.completeness,
    pricedValueSharePct: ledger.pricedValueSharePct,
    snapshotCount: resolveSnapshots(input).length,
    allocationShiftPct: evolution?.allocationShiftPct ?? null,
    hasHoldings: allocations.length > 0,
  });

  const metrics: PortfolioMetrics = {
    periodDays: period.days,
    totalValueUsd,
    assetCount: allocations.length,
    networkCount: networks.length,
    categoryCount: categories.length,
    allocations,
    networks,
    categories,
    topAssetSymbol: topAsset?.symbol ?? null,
    topAssetSharePct: topAsset?.allocationPct ?? 0,
    top3SharePct,
    topNetwork: topNetwork?.network ?? null,
    topNetworkSharePct: topNetwork?.allocationPct ?? 0,
    stablecoinSharePct,
    unpricedValueSharePct: round2(Math.max(0, 100 - ledger.pricedValueSharePct)),
    diversification,
    healthScore,
    behaviorProfile: behavior.profile,
    behaviorIndicators: behavior.indicators,
    evolution,
    transactionCount: txs.length,
  };

  const confidence = lowestConfidence(
    deriveConfidence(dataQuality, { minSampleForHigh: 10, minSampleForMedium: 2 }),
    allocations.length === 0 ? 'low' : 'high',
    ledger.pricedValueSharePct >= 90 ? 'high' : ledger.pricedValueSharePct >= 60 ? 'medium' : 'low',
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
      total_value_usd: metrics.totalValueUsd,
      asset_count: metrics.assetCount,
      network_count: metrics.networkCount,
      top_asset: metrics.topAssetSymbol,
      top_asset_share_pct: metrics.topAssetSharePct,
      top3_share_pct: metrics.top3SharePct,
      top_network: metrics.topNetwork,
      top_network_share_pct: metrics.topNetworkSharePct,
      stablecoin_share_pct: metrics.stablecoinSharePct,
      health_score: metrics.healthScore.total,
      behavior_profile: metrics.behaviorProfile,
    }),
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Composition (Spec §5.35)
// ---------------------------------------------------------------------------

function buildAllocations(entries: AssetLedgerEntry[], totalValueUsd: number): AssetAllocation[] {
  return entries
    .map(entry => ({
      symbol: entry.symbol,
      name: entry.name,
      valueUsd: entry.valueUsd,
      allocationPct: sharePct(entry.valueUsd, totalValueUsd),
      network: entry.network,
      category: entry.category,
      isStablecoin: entry.isStablecoin,
      priceKnown: entry.priceUsd != null,
    }))
    .sort((a, b) => (b.valueUsd === a.valueUsd ? a.symbol.localeCompare(b.symbol) : b.valueUsd - a.valueUsd));
}

function buildNetworkAllocations(
  entries: AssetLedgerEntry[],
  totalValueUsd: number,
): NetworkAllocation[] {
  const map = new Map<string, { valueUsd: number; assetCount: number }>();
  for (const entry of entries) {
    const key = entry.network || 'unknown';
    const bucket = map.get(key) ?? { valueUsd: 0, assetCount: 0 };
    bucket.valueUsd += entry.valueUsd;
    bucket.assetCount += 1;
    map.set(key, bucket);
  }
  return [...map.entries()]
    .map(([network, bucket]) => ({
      network,
      valueUsd: round2(bucket.valueUsd),
      allocationPct: sharePct(bucket.valueUsd, totalValueUsd),
      assetCount: bucket.assetCount,
    }))
    .sort((a, b) => (b.valueUsd === a.valueUsd ? a.network.localeCompare(b.network) : b.valueUsd - a.valueUsd));
}

function buildCategoryAllocations(
  entries: AssetLedgerEntry[],
  totalValueUsd: number,
): CategoryAllocation[] {
  const map = new Map<AssetCategory, { valueUsd: number; assetCount: number }>();
  for (const entry of entries) {
    const bucket = map.get(entry.category) ?? { valueUsd: 0, assetCount: 0 };
    bucket.valueUsd += entry.valueUsd;
    bucket.assetCount += 1;
    map.set(entry.category, bucket);
  }
  return [...map.entries()]
    .map(([category, bucket]) => ({
      category,
      valueUsd: round2(bucket.valueUsd),
      allocationPct: sharePct(bucket.valueUsd, totalValueUsd),
      assetCount: bucket.assetCount,
    }))
    .sort((a, b) => (b.valueUsd === a.valueUsd ? a.category.localeCompare(b.category) : b.valueUsd - a.valueUsd));
}

/**
 * Exposure diversity across distinct network × category buckets.
 * Spec §5.38: many tokens inside one ecosystem is a single risk source.
 */
function computeExposureDiversity(entries: AssetLedgerEntry[], totalValueUsd: number): number {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.network}|${entry.category}`;
    map.set(key, (map.get(key) ?? 0) + entry.valueUsd);
  }
  return distributionScore([...map.values()].map(value => sharePct(value, totalValueUsd)));
}

// ---------------------------------------------------------------------------
// Portfolio Health Score (Spec §5.36)
// ---------------------------------------------------------------------------

const HEALTH_WEIGHTS = {
  diversification: 30,
  concentration: 25,
  activity: 20,
  stability: 15,
  dataCompleteness: 10,
} as const;

function computeHealthScore(args: {
  diversification: DiversificationBreakdown;
  topAssetSharePct: number;
  top3SharePct: number;
  periodTxCount: number;
  periodDays: number;
  stablecoinSharePct: number;
  dataCompleteness: number;
  pricedValueSharePct: number;
  snapshotCount: number;
  allocationShiftPct: number | null;
  hasHoldings: boolean;
}): PortfolioHealthScore {
  const diversification = score100(
    args.diversification.assetDiversity * 0.5 +
      args.diversification.networkDiversity * 0.3 +
      args.diversification.categoryDiversity * 0.2,
  );

  // Full marks up to a 25% leading position, reaching zero at 90%.
  const topPenalty = score100(((args.topAssetSharePct - 25) / (90 - 25)) * 100);
  const top3Penalty = score100(((args.top3SharePct - 60) / (100 - 60)) * 100);
  const concentration = score100(100 - (topPenalty * 0.7 + top3Penalty * 0.3));

  // Activity measures whether the wallet is being operated at all, not how well.
  const expectedActivity = Math.max(1, Math.round((args.periodDays / 30) * 10));
  const activity = score100((args.periodTxCount / expectedActivity) * 100);

  // Without value history, stability falls back to composition signals only.
  const driftPenalty =
    args.allocationShiftPct == null ? 25 : score100((args.allocationShiftPct / 60) * 100);
  const stability = score100(
    50 + Math.min(30, args.stablecoinSharePct) - driftPenalty * 0.5 + (args.snapshotCount >= 7 ? 10 : 0),
  );

  const dataCompleteness = score100(
    args.dataCompleteness * 0.5 + args.pricedValueSharePct * 0.5,
  );

  const components = { diversification, concentration, activity, stability, dataCompleteness };
  const breakdown = {
    diversification: round1((diversification / 100) * HEALTH_WEIGHTS.diversification),
    concentration: round1((concentration / 100) * HEALTH_WEIGHTS.concentration),
    activity: round1((activity / 100) * HEALTH_WEIGHTS.activity),
    stability: round1((stability / 100) * HEALTH_WEIGHTS.stability),
    dataCompleteness: round1((dataCompleteness / 100) * HEALTH_WEIGHTS.dataCompleteness),
  };

  const shortfalls: Array<[string, number]> = [
    ['diversification', HEALTH_WEIGHTS.diversification - breakdown.diversification],
    ['concentration', HEALTH_WEIGHTS.concentration - breakdown.concentration],
    ['activity', HEALTH_WEIGHTS.activity - breakdown.activity],
    ['stability', HEALTH_WEIGHTS.stability - breakdown.stability],
    ['data_completeness', HEALTH_WEIGHTS.dataCompleteness - breakdown.dataCompleteness],
  ];
  shortfalls.sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]));

  return {
    total: args.hasHoldings
      ? score100(
          breakdown.diversification +
            breakdown.concentration +
            breakdown.activity +
            breakdown.stability +
            breakdown.dataCompleteness,
        )
      : 0,
    breakdown,
    components,
    weights: HEALTH_WEIGHTS,
    limitingFactor: shortfalls[0][0],
  };
}

// ---------------------------------------------------------------------------
// Behaviour classification (Spec §5.39)
// ---------------------------------------------------------------------------

function classifyBehavior(args: {
  periodTxCount: number;
  periodDays: number;
  tradeCount: number;
  networkCount: number;
  activeNetworkCount: number;
  bridgeCount: number;
  assetCount: number;
  topNetworkSharePct: number;
}): { profile: PortfolioBehaviorProfile; indicators: Record<string, number> } {
  const txPerMonth = round1((args.periodTxCount / Math.max(1, args.periodDays)) * 30);
  const tradeShare = sharePct(args.tradeCount, Math.max(1, args.periodTxCount));
  const indicators: Record<string, number> = {
    transactions_per_month: txPerMonth,
    trade_share_pct: tradeShare,
    active_networks: args.activeNetworkCount,
    held_networks: args.networkCount,
    bridge_transactions: args.bridgeCount,
    asset_count: args.assetCount,
    top_network_share_pct: args.topNetworkSharePct,
  };

  const multiChain =
    args.networkCount >= 3 && args.topNetworkSharePct < 70 && (args.activeNetworkCount >= 2 || args.bridgeCount > 0);

  let profile: PortfolioBehaviorProfile;
  if (txPerMonth >= 20 && tradeShare >= 30) profile = 'active_trader';
  else if (multiChain) profile = 'multi_chain_explorer';
  else if (txPerMonth < 2) profile = 'passive_investor';
  else profile = 'long_term_holder';

  return { profile, indicators };
}

const BEHAVIOR_WORDING: Record<PortfolioBehaviorProfile, string> = {
  long_term_holder: 'wallet activity resembles a holding pattern with limited operations',
  active_trader: 'wallet data shows a relatively high level of trading activity',
  multi_chain_explorer: 'wallet activity extends across several networks',
  passive_investor: 'wallet activity shows a low-movement pattern',
};

// ---------------------------------------------------------------------------
// Evolution (Spec §5.40)
// ---------------------------------------------------------------------------

function buildEvolution(
  ledger: AssetLedger,
  input: IntelligenceInput,
  period: ResolvedPeriod,
  currentTopSymbol: string | null,
  currentStablecoinSharePct: number,
): PortfolioEvolution | null {
  const snapshots = resolveSnapshots(input);
  const previousFromSnapshots = snapshotValueAt(snapshots, period.currentStart);
  const reconstructed = ledger.entries.filter(e => e.valueStartUsd != null);
  const previousValueUsd = ledger.totalStartValueUsd ?? previousFromSnapshots;

  if (previousValueUsd == null && reconstructed.length === 0) return null;

  const previousTop =
    reconstructed.length > 0
      ? [...reconstructed].sort((a, b) => (b.valueStartUsd ?? 0) - (a.valueStartUsd ?? 0))[0]
      : null;
  const previousTopSharePct = previousTop?.allocationStartPct ?? null;
  const currentTopEntry = currentTopSymbol
    ? ledger.entries.find(e => e.symbol === currentTopSymbol) ?? null
    : null;

  const previousStablecoinSharePct =
    reconstructed.length > 0 && ledger.totalStartValueUsd && ledger.totalStartValueUsd > 0
      ? round2(
          sum(
            reconstructed.filter(e => e.isStablecoin).map(e => e.allocationStartPct ?? 0),
          ),
        )
      : null;

  const allocationShiftPct =
    reconstructed.length > 0
      ? round2(sum(reconstructed.map(e => Math.abs(e.allocationDriftPct ?? 0))) / 2)
      : null;

  return {
    previousValueUsd: previousValueUsd != null ? round2(previousValueUsd) : null,
    valueChangeUsd:
      previousValueUsd != null ? round2(ledger.totalValueUsd - previousValueUsd) : null,
    previousTopAssetSymbol: previousTop?.symbol ?? null,
    previousTopAssetSharePct: previousTopSharePct,
    topAssetShareChangePct:
      currentTopEntry?.allocationStartPct != null
        ? round2(currentTopEntry.allocationPct - currentTopEntry.allocationStartPct)
        : null,
    previousStablecoinSharePct,
    stablecoinShareChangePct:
      previousStablecoinSharePct != null
        ? round2(currentStablecoinSharePct - previousStablecoinSharePct)
        : null,
    allocationShiftPct,
  };
}

function snapshotValueAt(
  snapshots: Array<{ value: number; ms: number }>,
  targetMs: number,
): number | null {
  let found: number | null = null;
  for (const point of snapshots) {
    if (point.ms <= targetMs) found = point.value;
    else break;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Patterns (Spec §5.37)
// ---------------------------------------------------------------------------

function detectPatterns(
  metrics: PortfolioMetrics,
  period: ResolvedPeriod,
  confidence: Confidence,
): Pattern[] {
  const patterns: Pattern[] = [];
  const periodLabel = formatPeriodLabel(period.days);
  const topAsset = metrics.topAssetSymbol;

  if (topAsset && metrics.topAssetSharePct >= EXTREME_CONCENTRATION_PCT) {
    patterns.push({
      id: makePatternId('portfolio', 'extreme_concentration', topAsset),
      type: 'extreme_concentration',
      name: 'Extreme Concentration',
      description: `${topAsset} holds ${formatPct(metrics.topAssetSharePct)} of total portfolio value.`,
      category: 'portfolio',
      confidence,
      evidence: compactEvidence({
        top_asset: topAsset,
        top_asset_share_pct: metrics.topAssetSharePct,
        top3_share_pct: metrics.top3SharePct,
        total_value_usd: metrics.totalValueUsd,
      }),
    });
  } else if (topAsset && metrics.topAssetSharePct >= SINGLE_ASSET_DEPENDENCY_PCT) {
    patterns.push({
      id: makePatternId('portfolio', 'single_asset_dependency', topAsset),
      type: 'single_asset_dependency',
      name: 'Single Asset Dependency',
      description: `More than half of portfolio value is held in ${topAsset}.`,
      category: 'portfolio',
      confidence,
      evidence: compactEvidence({
        top_asset: topAsset,
        top_asset_share_pct: metrics.topAssetSharePct,
        top3_share_pct: metrics.top3SharePct,
        total_value_usd: metrics.totalValueUsd,
      }),
    });
  }

  const shareChange = metrics.evolution?.topAssetShareChangePct ?? null;
  if (topAsset && shareChange != null && shareChange >= CONCENTRATION_INCREASE_PP) {
    patterns.push({
      id: makePatternId('portfolio', 'concentration_increase', topAsset),
      type: 'concentration_increase',
      name: 'Concentration Increase Over Time',
      description: `The share of ${topAsset} rose by ${round1(shareChange)} percentage points compared with the start of the period.`,
      category: 'portfolio',
      confidence,
      evidence: compactEvidence({
        top_asset: topAsset,
        previous_share_pct: metrics.evolution?.previousTopAssetSharePct,
        current_share_pct: metrics.topAssetSharePct,
        change_pp: round2(shareChange),
        period: periodLabel,
      }),
    });
  }

  const allocationShift = metrics.evolution?.allocationShiftPct ?? null;
  if (allocationShift != null && allocationShift >= ALLOCATION_SHIFT_PP) {
    patterns.push({
      id: makePatternId('portfolio', 'allocation_shift'),
      type: 'allocation_shift',
      name: 'Allocation Shift',
      description: 'The distribution of value across assets changed materially compared with the start of the period.',
      category: 'portfolio',
      confidence,
      evidence: compactEvidence({
        allocation_shift_pp: allocationShift,
        previous_value_usd: metrics.evolution?.previousValueUsd,
        current_value_usd: metrics.totalValueUsd,
        period: periodLabel,
      }),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Insights (Spec §5.41 / §5.42)
// ---------------------------------------------------------------------------

function buildInsights(
  metrics: PortfolioMetrics,
  patterns: Pattern[],
  period: ResolvedPeriod,
  confidence: Confidence,
): Insight[] {
  const insights: Insight[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  if (metrics.assetCount === 0) {
    insights.push({
      id: makeInsightId('portfolio', 'no_holdings'),
      type: 'no_holdings',
      category: 'portfolio',
      title: 'No priced holdings are available for analysis',
      description:
        'No holdings with a usable USD value were supplied, so composition, concentration, and diversification could not be measured.',
      severity: 'informational',
      confidence: 'low',
      impactUsd: null,
      evidence: compactEvidence({ asset_count: 0, total_value_usd: metrics.totalValueUsd }),
    });
    return insights;
  }

  for (const pattern of patterns) {
    insights.push(insightFromPattern(pattern, metrics, periodLabel, confidence));
  }

  if (metrics.networkCount >= 2 && metrics.topNetworkSharePct >= 80 && metrics.topNetwork) {
    insights.push({
      id: makeInsightId('portfolio', 'network_concentration', metrics.topNetwork),
      type: 'network_concentration',
      category: 'portfolio',
      title: `${formatPct(metrics.topNetworkSharePct)} of value sits on one network`,
      description: `Value is spread across ${metrics.networkCount} network(s), but ${formatPct(metrics.topNetworkSharePct)} of it is held on ${metrics.topNetwork}. Portfolio value therefore moves with the conditions of a single network environment.`,
      severity: metrics.topNetworkSharePct >= 90 ? 'medium' : 'low',
      confidence,
      impact: 'Operating conditions and value are tied to one network environment.',
      impactUsd: round2((metrics.topNetworkSharePct / 100) * metrics.totalValueUsd),
      relatedEntities: [metrics.topNetwork],
      evidence: compactEvidence({
        top_network: metrics.topNetwork,
        top_network_share_pct: metrics.topNetworkSharePct,
        network_count: metrics.networkCount,
        total_value_usd: metrics.totalValueUsd,
      }),
    });
  }

  if (metrics.assetCount >= 8 && metrics.diversification.exposureDiversity <= 35) {
    insights.push({
      id: makeInsightId('portfolio', 'nominal_diversification'),
      type: 'nominal_diversification',
      category: 'portfolio',
      title: 'Asset count is high while exposure sources stay narrow',
      description: `The portfolio holds ${metrics.assetCount} assets, but value concentrates in a small number of network and category combinations. Distribution of exposure, not the number of tokens, is what spreads value.`,
      severity: 'low',
      confidence,
      impact: 'Assets that look separate move with the same underlying exposure.',
      impactUsd: metrics.totalValueUsd,
      evidence: compactEvidence({
        asset_count: metrics.assetCount,
        exposure_diversity_score: metrics.diversification.exposureDiversity,
        asset_diversity_score: metrics.diversification.assetDiversity,
        network_count: metrics.networkCount,
        category_count: metrics.categoryCount,
      }),
    });
  }

  if (metrics.unpricedValueSharePct >= 5) {
    insights.push({
      id: makeInsightId('portfolio', 'unpriced_value'),
      type: 'unpriced_value_share',
      category: 'portfolio',
      title: `${formatPct(metrics.unpricedValueSharePct)} of value could not be priced`,
      description: `Part of the portfolio value sits in holdings without a usable price in the available data, so it is excluded from detailed composition analysis and analysis confidence is reduced.`,
      severity: metrics.unpricedValueSharePct >= 20 ? 'medium' : 'low',
      confidence,
      impact: 'Part of the portfolio could not be analysed in detail.',
      impactUsd: round2((metrics.unpricedValueSharePct / 100) * metrics.totalValueUsd),
      evidence: compactEvidence({
        unpriced_value_share_pct: metrics.unpricedValueSharePct,
        total_value_usd: metrics.totalValueUsd,
        asset_count: metrics.assetCount,
      }),
    });
  }

  insights.push({
    id: makeInsightId('portfolio', 'structure_profile'),
    type: 'portfolio_structure',
    category: 'portfolio',
    title: `Structural health score is ${metrics.healthScore.total} of 100`,
    description: `The structural score describes distribution, concentration, activity, stability, and data completeness — not investment quality. The component furthest from its weight is ${metrics.healthScore.limitingFactor.replace(/_/g, ' ')}. Over ${periodLabel}, ${BEHAVIOR_WORDING[metrics.behaviorProfile]}.`,
    severity: 'informational',
    confidence,
    impactUsd: null,
    evidence: compactEvidence({
      health_score: metrics.healthScore.total,
      diversification_points: metrics.healthScore.breakdown.diversification,
      concentration_points: metrics.healthScore.breakdown.concentration,
      activity_points: metrics.healthScore.breakdown.activity,
      stability_points: metrics.healthScore.breakdown.stability,
      data_completeness_points: metrics.healthScore.breakdown.dataCompleteness,
      limiting_factor: metrics.healthScore.limitingFactor,
      behavior_profile: metrics.behaviorProfile,
    }),
  });

  return insights;
}

function insightFromPattern(
  pattern: Pattern,
  metrics: PortfolioMetrics,
  periodLabel: string,
  confidence: Confidence,
): Insight {
  const topAsset = metrics.topAssetSymbol ?? 'the leading asset';
  const base = {
    id: makeInsightId('portfolio', pattern.type, metrics.topAssetSymbol),
    type: pattern.type,
    category: 'portfolio' as const,
    confidence,
    evidence: pattern.evidence,
    relatedEntities: metrics.topAssetSymbol ? [metrics.topAssetSymbol] : undefined,
  };

  switch (pattern.type) {
    case 'extreme_concentration':
      return {
        ...base,
        title: `${formatPct(metrics.topAssetSharePct)} of portfolio value is held in ${topAsset}`,
        description: `The portfolio structure shows a high dependency on one asset: ${topAsset} accounts for ${formatPct(metrics.topAssetSharePct)} of value and the top three assets for ${formatPct(metrics.top3SharePct)}. Any change in the price of this asset is reflected directly in total portfolio value.`,
        severity: 'high',
        impact: 'Total portfolio value follows the movement of a single asset closely.',
        impactUsd: round2((metrics.topAssetSharePct / 100) * metrics.totalValueUsd),
      };
    case 'single_asset_dependency':
      return {
        ...base,
        title: `More than half of portfolio value is held in ${topAsset}`,
        description: `${topAsset} accounts for ${formatPct(metrics.topAssetSharePct)} of total value, with the top three assets at ${formatPct(metrics.top3SharePct)}. Portfolio performance is therefore largely tied to the movement of this asset.`,
        severity: 'medium',
        impact: 'Portfolio value moves largely with one asset.',
        impactUsd: round2((metrics.topAssetSharePct / 100) * metrics.totalValueUsd),
      };
    case 'concentration_increase':
      return {
        ...base,
        title: `Concentration in ${topAsset} increased during the period`,
        description: `The share of ${topAsset} moved from ${formatPct(Number(pattern.evidence.previous_share_pct ?? 0))} to ${formatPct(metrics.topAssetSharePct)} over ${periodLabel}. Sensitivity of the total to this asset is higher than it was at the start of the window.`,
        severity: 'medium',
        impact: 'Structural dependency on the leading asset is higher than in the previous window.',
        impactUsd: round2((metrics.topAssetSharePct / 100) * metrics.totalValueUsd),
      };
    default:
      return {
        ...base,
        title: 'Portfolio allocation changed materially during the period',
        description: `Combined allocation drift across assets reached ${round1(Number(pattern.evidence.allocation_shift_pp ?? 0))} percentage points over ${periodLabel}. The change may come from price movement, incoming capital, or reduction in other assets.`,
        severity: 'low',
        impact: 'The structure of exposure differs from the start of the window.',
        impactUsd: metrics.evolution?.valueChangeUsd != null ? Math.abs(metrics.evolution.valueChangeUsd) : null,
      };
  }
}

// ---------------------------------------------------------------------------
// Summary (Spec §5.44)
// ---------------------------------------------------------------------------

function buildSummary(metrics: PortfolioMetrics, period: ResolvedPeriod): string {
  if (metrics.assetCount === 0) {
    return 'No priced holdings were supplied, so portfolio composition and structure could not be described.';
  }

  const parts: string[] = [];
  parts.push(
    `The portfolio holds ${formatUsd(metrics.totalValueUsd)} across ${metrics.assetCount} asset(s) on ${metrics.networkCount} network(s).`,
  );

  if (metrics.topAssetSymbol) {
    parts.push(
      `${metrics.topAssetSymbol} represents ${formatPct(metrics.topAssetSharePct)} of value and the top three assets ${formatPct(metrics.top3SharePct)}.`,
    );
  }

  parts.push(`Stablecoins account for ${formatPct(metrics.stablecoinSharePct)} of value.`);
  parts.push(
    `The structural health score is ${metrics.healthScore.total} of 100, limited most by ${metrics.healthScore.limitingFactor.replace(/_/g, ' ')}.`,
  );
  parts.push(`Over the last ${period.days} days, ${BEHAVIOR_WORDING[metrics.behaviorProfile]}.`);

  if (metrics.evolution?.topAssetShareChangePct != null && Math.abs(metrics.evolution.topAssetShareChangePct) >= 5) {
    parts.push(
      `The leading asset share changed by ${round1(metrics.evolution.topAssetShareChangePct)} percentage points compared with the start of the window.`,
    );
  }

  return parts.join(' ');
}

/** Neutral wording for a wallet behaviour profile — reused by other surfaces. */
export function describePortfolioBehavior(profile: PortfolioBehaviorProfile): string {
  return BEHAVIOR_WORDING[profile];
}
