/**
 * Module 05 — Risk Intelligence (Spec §5.65–§5.81).
 *
 * Risk is not one number. Six independent layers are measured and combined into
 * a Portfolio Risk Score where **higher = higher exposure**, never "worse"
 * (Spec §5.71). A highly exposed portfolio may be entirely intentional.
 *
 * The module owns no data of its own (Spec §5.69): it reads Portfolio, Asset,
 * Performance, Flow, and Trading outputs. Callers that already ran those
 * engines should pass them in `context` to avoid recomputation.
 */

import { analyzeAssets, type AssetIntelligence } from './asset';
import { analyzeFlow, type FlowIntelligence } from './flow';
import { analyzePerformance, type PerformanceIntelligence } from './performance';
import { analyzePortfolio, type PortfolioIntelligence } from './portfolio';
import {
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
  resolveSnapshots,
  resolveTransactions,
  round1,
  round2,
  score100,
  sharePct,
  splitByPeriod,
  sum,
  txTimestampMs,
  type ResolvedPeriod,
} from './shared';
import { analyzeTrading, type TradingIntelligence } from './trading';
import type {
  Confidence,
  Insight,
  IntelligenceInput,
  IntelligenceResult,
  Pattern,
  Severity,
} from './types';

/** Exposure band derived from the total score — a magnitude, not a verdict. */
export type RiskLevel = 'low_exposure' | 'moderate_exposure' | 'elevated_exposure' | 'high_exposure';

export type RiskLayerKey =
  | 'concentration'
  | 'volatility'
  | 'liquidity'
  | 'behavioral'
  | 'operational'
  | 'data';

export interface RiskLayer {
  key: RiskLayerKey;
  name: string;
  /** 0–100 exposure inside this layer; higher = more exposure. */
  score: number;
  weight: number;
  /** `score × weight / 100` — the layer's contribution to the total. */
  contribution: number;
  /** Neutral statement of what drove the layer score. */
  drivers: string[];
  confidence: Confidence;
}

export interface PortfolioRiskScore {
  /** 0–100. Higher = higher exposure (Spec §5.71). */
  total: number;
  level: RiskLevel;
  components: Record<RiskLayerKey, number>;
  contributions: Record<RiskLayerKey, number>;
  weights: {
    concentration: 30;
    volatility: 25;
    liquidity: 15;
    behavioral: 15;
    operational: 10;
    data: 5;
  };
  /** Layer contributing the most points to the total. */
  dominantLayer: RiskLayerKey;
  confidence: Confidence;
}

export interface RiskMetrics {
  periodDays: number;
  portfolioValueUsd: number;
  riskScore: PortfolioRiskScore;
  layers: RiskLayer[];
  /** Concentration Index (Spec §5.70). */
  topAssetSharePct: number;
  top3SharePct: number;
  topNetworkSharePct: number;
  networkExposure: Array<{ network: string; sharePct: number }>;
  maxDrawdownPct: number | null;
  currentDrawdownPct: number | null;
  volatilityScore: number | null;
  volatilityPct: number | null;
  /** Current activity against the historical baseline; 1 = unchanged. */
  activitySpikeRatio: number | null;
  activitySpikeScore: number;
  /** Share of value in assets that could not be classified or priced. */
  unknownExposurePct: number;
  illiquidExposurePct: number;
  stablecoinSharePct: number;
  dataConfidenceScore: number;
  externalDependencyScore: number;
  tradingTurnoverRatio: number | null;
  /** Networks the wallet operates on — each one adds operational surface. */
  networkCount: number;
  protocolCount: number;
  previousRiskScore: number | null;
  riskScoreChange: number | null;
  /** Rows the assessment was built from; zero means nothing could be measured. */
  transactionCount: number;
}

export type RiskIntelligence = IntelligenceResult<RiskMetrics>;

/** Precomputed module results, so `runFullIntelligence` does not analyse twice. */
export interface RiskContext {
  portfolio?: PortfolioIntelligence;
  assets?: AssetIntelligence;
  performance?: PerformanceIntelligence;
  flow?: FlowIntelligence;
  trading?: TradingIntelligence;
}

const WEIGHTS = {
  concentration: 30,
  volatility: 25,
  liquidity: 15,
  behavioral: 15,
  operational: 10,
  data: 5,
} as const;

const HIGH_DEPENDENCY_PCT = 60;
const UNKNOWN_EXPOSURE_PCT = 10;
const VOLATILITY_EXPANSION_FACTOR = 1.5;
const ACTIVITY_SPIKE_FACTOR = 2;
const LOW_ACTIVITY_TX_COUNT = 3;
const DORMANT_CONCENTRATION_PCT = 50;
const RISK_INCREASE_POINTS = 5;

export function analyzeRisk(input: IntelligenceInput, context: RiskContext = {}): RiskIntelligence {
  const period = resolvePeriod(input);
  const txs = resolveTransactions(input);
  const dataQuality = buildDataQuality(txs);

  const portfolio = context.portfolio ?? analyzePortfolio(input);
  const assets = context.assets ?? analyzeAssets(input);
  const performance = context.performance ?? analyzePerformance(input);
  const flow = context.flow ?? analyzeFlow(input);
  const trading = context.trading ?? analyzeTrading(input);

  const split = splitByPeriod(txs, txTimestampMs, period);
  const activity = computeActivitySpike(split.current.length, split.previous.length, split.older.length);

  // Value that cannot be classified or priced — the two overlap, so take the wider of the two.
  // With no holdings at all there is no value to be exposed, so the measure stays at zero
  // and the absence of data is reported through the Data layer instead.
  const unclassifiedSharePct = sharePct(
    sum(assets.metrics.suspiciousAssets.map(a => a.valueUsd)),
    portfolio.metrics.totalValueUsd,
  );
  const unknownExposurePct =
    portfolio.metrics.totalValueUsd > 0
      ? round2(Math.max(unclassifiedSharePct, portfolio.metrics.unpricedValueSharePct))
      : 0;

  const illiquidExposurePct = round2(
    sum(
      portfolio.metrics.allocations
        .filter(a => !a.priceKnown || a.category === 'unknown')
        .map(a => a.allocationPct),
    ),
  );

  const dataConfidenceScore = computeDataConfidenceScore(
    dataQuality.completeness,
    portfolio.metrics.unpricedValueSharePct,
    resolveSnapshots(input).length,
    period.days,
  );

  const layers: RiskLayer[] = [
    buildConcentrationLayer(portfolio, trading),
    buildVolatilityLayer(performance),
    buildLiquidityLayer(portfolio, illiquidExposurePct),
    buildBehavioralLayer(flow, trading, activity.ratio),
    buildOperationalLayer(portfolio, trading, flow),
    buildDataLayer(dataConfidenceScore, unknownExposurePct),
  ];

  const riskScore = buildRiskScore(layers);
  const previousRiskScore = estimatePreviousRiskScore(portfolio, riskScore.total);

  const metrics: RiskMetrics = {
    periodDays: period.days,
    portfolioValueUsd: portfolio.metrics.totalValueUsd,
    riskScore,
    layers,
    topAssetSharePct: portfolio.metrics.topAssetSharePct,
    top3SharePct: portfolio.metrics.top3SharePct,
    topNetworkSharePct: portfolio.metrics.topNetworkSharePct,
    networkExposure: portfolio.metrics.networks.map(n => ({
      network: n.network,
      sharePct: n.allocationPct,
    })),
    maxDrawdownPct: performance.metrics.maxDrawdownPct,
    currentDrawdownPct: performance.metrics.currentDrawdownPct,
    volatilityScore: performance.metrics.volatilityScore,
    volatilityPct: performance.metrics.volatilityPct,
    activitySpikeRatio: activity.ratio,
    activitySpikeScore: activity.score,
    unknownExposurePct,
    illiquidExposurePct,
    stablecoinSharePct: portfolio.metrics.stablecoinSharePct,
    dataConfidenceScore,
    externalDependencyScore: flow.metrics.externalDependencyScore,
    tradingTurnoverRatio: trading.metrics.turnoverRatio,
    networkCount: portfolio.metrics.networkCount,
    protocolCount: trading.metrics.protocolsUsed.length,
    previousRiskScore,
    riskScoreChange: previousRiskScore != null ? round1(riskScore.total - previousRiskScore) : null,
    transactionCount: txs.length,
  };

  const confidence = lowestConfidence(
    deriveConfidence(dataQuality, { minSampleForHigh: 20, minSampleForMedium: 5 }),
    portfolio.confidence,
    dataConfidenceScore >= 70 ? 'high' : dataConfidenceScore >= 40 ? 'medium' : 'low',
  );

  const patterns = detectPatterns(metrics, portfolio, trading, performance, period, confidence);
  const insights = buildInsights(metrics, patterns, period);

  return {
    summary: buildSummary(metrics, period),
    metrics,
    patterns,
    insights,
    confidence,
    evidence: compactEvidence({
      period: formatPeriodLabel(period.days),
      risk_score: metrics.riskScore.total,
      risk_level: metrics.riskScore.level,
      concentration_score: metrics.riskScore.components.concentration,
      volatility_score: metrics.riskScore.components.volatility,
      liquidity_score: metrics.riskScore.components.liquidity,
      behavioral_score: metrics.riskScore.components.behavioral,
      operational_score: metrics.riskScore.components.operational,
      data_score: metrics.riskScore.components.data,
      top_asset_share_pct: metrics.topAssetSharePct,
      max_drawdown_pct: metrics.maxDrawdownPct,
      unknown_exposure_pct: metrics.unknownExposurePct,
      dominant_layer: metrics.riskScore.dominantLayer,
    }),
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Layers (Spec §5.67)
// ---------------------------------------------------------------------------

/** Layer 1 — dependency on a small number of assets, networks, and trades. */
function buildConcentrationLayer(
  portfolio: PortfolioIntelligence,
  trading: TradingIntelligence,
): RiskLayer {
  const drivers: string[] = [];
  const top1 = portfolio.metrics.topAssetSharePct;
  const top3 = portfolio.metrics.top3SharePct;
  const network = portfolio.metrics.topNetworkSharePct;

  // Asset dependency dominates; network and trading concentration widen it.
  const assetPart = clamp(top1, 0, 100) * 0.5 + clamp(top3, 0, 100) * 0.2;
  const networkPart = clamp(network, 0, 100) * 0.2;
  const tradingPart = clamp(trading.metrics.topTradedAsset?.volumeSharePct ?? 0, 0, 100) * 0.1;
  const score = score100(assetPart + networkPart + tradingPart);

  if (top1 >= 50) drivers.push(`top_asset_share_${round1(top1)}pct`);
  if (top3 >= 80) drivers.push(`top3_share_${round1(top3)}pct`);
  if (network >= 80) drivers.push(`top_network_share_${round1(network)}pct`);
  if (portfolio.metrics.assetCount <= 2) drivers.push(`asset_count_${portfolio.metrics.assetCount}`);

  return {
    key: 'concentration',
    name: 'Concentration Risk',
    score,
    weight: WEIGHTS.concentration,
    contribution: round1((score * WEIGHTS.concentration) / 100),
    drivers,
    confidence: portfolio.confidence,
  };
}

/** Layer 2 — how much the portfolio value moves, from observed snapshots. */
function buildVolatilityLayer(performance: PerformanceIntelligence): RiskLayer {
  const drivers: string[] = [];
  const volatility = performance.metrics.volatilityScore;
  const drawdown = performance.metrics.maxDrawdownPct;

  if (volatility == null && drawdown == null) {
    return {
      key: 'volatility',
      name: 'Volatility Risk',
      // Unmeasurable exposure is reported as mid-range, never as zero.
      score: 50,
      weight: WEIGHTS.volatility,
      contribution: round1((50 * WEIGHTS.volatility) / 100),
      drivers: ['insufficient_snapshot_history'],
      confidence: 'low',
    };
  }

  const volatilityPart = clamp(volatility ?? 0, 0, 100) * 0.6;
  const drawdownPart = clamp(Math.abs(drawdown ?? 0) * 2, 0, 100) * 0.4;
  const score = score100(volatilityPart + drawdownPart);

  if ((volatility ?? 0) >= 50) drivers.push(`volatility_score_${Math.round(volatility ?? 0)}`);
  if (Math.abs(drawdown ?? 0) >= 20) drivers.push(`max_drawdown_${round1(Math.abs(drawdown ?? 0))}pct`);
  if (performance.metrics.snapshotCount < 7) drivers.push('short_snapshot_history');

  return {
    key: 'volatility',
    name: 'Volatility Risk',
    score,
    weight: WEIGHTS.volatility,
    contribution: round1((score * WEIGHTS.volatility) / 100),
    drivers,
    confidence: performance.metrics.snapshotCount >= 14 ? performance.confidence : 'low',
  };
}

/** Layer 3 — how easily the held value can be moved, judged by asset type. */
function buildLiquidityLayer(
  portfolio: PortfolioIntelligence,
  illiquidExposurePct: number,
): RiskLayer {
  const drivers: string[] = [];
  const liquidShare = sum(
    portfolio.metrics.allocations
      .filter(a => a.priceKnown && (a.isStablecoin || a.category === 'native' || a.category === 'wrapped'))
      .map(a => a.allocationPct),
  );
  const score = score100(100 - liquidShare * 0.8 + illiquidExposurePct * 0.5);

  if (illiquidExposurePct >= 10) drivers.push(`unpriced_or_unclassified_${round1(illiquidExposurePct)}pct`);
  if (portfolio.metrics.stablecoinSharePct < 5) drivers.push('low_stablecoin_share');
  if (liquidShare >= 70) drivers.push('majority_in_major_assets');

  return {
    key: 'liquidity',
    name: 'Liquidity Risk',
    score,
    weight: WEIGHTS.liquidity,
    contribution: round1((score * WEIGHTS.liquidity) / 100),
    drivers,
    confidence: portfolio.confidence,
  };
}

/** Layer 4 — how far current wallet behaviour differs from its own baseline. */
function buildBehavioralLayer(
  flow: FlowIntelligence,
  trading: TradingIntelligence,
  activityRatio: number | null,
): RiskLayer {
  const drivers: string[] = [];
  const spikePart = activityRatio != null ? clamp((activityRatio - 1) * 40, 0, 45) : 10;
  const turnoverPart = clamp((trading.metrics.turnoverRatio ?? 0) * 12, 0, 30);
  const dependencyPart = clamp(flow.metrics.externalDependencyScore * 0.15, 0, 15);
  const instabilityPart = clamp((100 - flow.metrics.flowStabilityScore) * 0.1, 0, 10);
  const score = score100(spikePart + turnoverPart + dependencyPart + instabilityPart);

  if (activityRatio != null && activityRatio >= ACTIVITY_SPIKE_FACTOR) {
    drivers.push(`activity_ratio_${round1(activityRatio)}x`);
  }
  if ((trading.metrics.turnoverRatio ?? 0) >= 1) {
    drivers.push(`turnover_${round1(trading.metrics.turnoverRatio ?? 0)}x`);
  }
  if (flow.metrics.externalDependencyScore >= 60) drivers.push('value_change_driven_by_deposits');
  if (flow.metrics.flowStabilityScore <= 40) drivers.push('irregular_flow_pattern');

  return {
    key: 'behavioral',
    name: 'Behavioral Risk',
    score,
    weight: WEIGHTS.behavioral,
    contribution: round1((score * WEIGHTS.behavioral) / 100),
    drivers,
    confidence: lowestConfidence(flow.confidence, trading.confidence),
  };
}

/** Layer 5 — operational surface: networks, protocols, and counterparty spread. */
function buildOperationalLayer(
  portfolio: PortfolioIntelligence,
  trading: TradingIntelligence,
  flow: FlowIntelligence,
): RiskLayer {
  const drivers: string[] = [];
  const networkPart = clamp((portfolio.metrics.networkCount - 1) * 12, 0, 40);
  const protocolPart = clamp(trading.metrics.protocolsUsed.length * 8, 0, 35);
  const counterpartyPart = clamp(
    (flow.metrics.topSources.length + flow.metrics.topDestinations.length) * 3,
    0,
    25,
  );
  const score = score100(networkPart + protocolPart + counterpartyPart);

  if (portfolio.metrics.networkCount >= 3) drivers.push(`network_count_${portfolio.metrics.networkCount}`);
  if (trading.metrics.protocolsUsed.length >= 3) {
    drivers.push(`protocol_count_${trading.metrics.protocolsUsed.length}`);
  }
  if (portfolio.metrics.networkCount <= 1) drivers.push('single_network_surface');

  return {
    key: 'operational',
    name: 'Operational Risk',
    score,
    weight: WEIGHTS.operational,
    contribution: round1((score * WEIGHTS.operational) / 100),
    drivers,
    confidence: portfolio.confidence,
  };
}

/** Layer 6 — incomplete data is itself an exposure (Spec §5.67 Layer 6). */
function buildDataLayer(dataConfidenceScore: number, unknownExposurePct: number): RiskLayer {
  const drivers: string[] = [];
  const score = score100(100 - dataConfidenceScore + unknownExposurePct * 0.5);

  if (dataConfidenceScore < 60) drivers.push(`data_confidence_${Math.round(dataConfidenceScore)}`);
  if (unknownExposurePct >= UNKNOWN_EXPOSURE_PCT) {
    drivers.push(`unknown_exposure_${round1(unknownExposurePct)}pct`);
  }

  return {
    key: 'data',
    name: 'Data Risk',
    score,
    weight: WEIGHTS.data,
    contribution: round1((score * WEIGHTS.data) / 100),
    drivers,
    confidence: dataConfidenceScore >= 70 ? 'high' : dataConfidenceScore >= 40 ? 'medium' : 'low',
  };
}

function buildRiskScore(layers: RiskLayer[]): PortfolioRiskScore {
  const components = {} as Record<RiskLayerKey, number>;
  const contributions = {} as Record<RiskLayerKey, number>;
  for (const layer of layers) {
    components[layer.key] = layer.score;
    contributions[layer.key] = layer.contribution;
  }

  const total = score100(sum(layers.map(l => l.contribution)));
  const dominant = layers.reduce((best, layer) =>
    layer.contribution > best.contribution ? layer : best,
  );

  return {
    total,
    level: resolveRiskLevel(total),
    components,
    contributions,
    weights: WEIGHTS,
    dominantLayer: dominant.key,
    confidence: lowestConfidence(...layers.map(l => l.confidence)),
  };
}

function resolveRiskLevel(total: number): RiskLevel {
  if (total >= 70) return 'high_exposure';
  if (total >= 50) return 'elevated_exposure';
  if (total >= 30) return 'moderate_exposure';
  return 'low_exposure';
}

// ---------------------------------------------------------------------------
// Supporting metrics (Spec §5.70)
// ---------------------------------------------------------------------------

function computeActivitySpike(
  currentCount: number,
  previousCount: number,
  olderCount: number,
): { ratio: number | null; score: number } {
  const baselineWindows = olderCount > 0 ? 2 : 1;
  const baselineCount = previousCount + olderCount;
  if (baselineCount === 0) {
    return { ratio: null, score: currentCount > 0 ? 40 : 0 };
  }
  const baselinePerWindow = baselineCount / baselineWindows;
  if (baselinePerWindow <= 0) return { ratio: null, score: 0 };
  const ratio = round2(currentCount / baselinePerWindow);
  return { ratio, score: score100((ratio - 1) * 50) };
}

/** Coverage of prices, assets, and transactions (Spec §5.70 Data Confidence Score). */
function computeDataConfidenceScore(
  txCompleteness: number,
  unpricedValueSharePct: number,
  snapshotCount: number,
  periodDays: number,
): number {
  const priceCoverage = clamp(100 - unpricedValueSharePct, 0, 100);
  const txCoverage = clamp(txCompleteness, 0, 100);
  const snapshotCoverage = clamp((snapshotCount / Math.max(1, periodDays)) * 100, 0, 100);
  return score100(priceCoverage * 0.45 + txCoverage * 0.35 + snapshotCoverage * 0.2);
}

/**
 * Reconstructs the concentration and volatility layers as they stood at the
 * start of the window, so exposure change can be reported without storing
 * history. Returns `null` when no start state could be reconstructed.
 */
function estimatePreviousRiskScore(
  portfolio: PortfolioIntelligence,
  currentTotal: number,
): number | null {
  const evolution = portfolio.metrics.evolution;
  if (!evolution || evolution.topAssetShareChangePct == null) return null;

  const previousTopShare = clamp(
    portfolio.metrics.topAssetSharePct - evolution.topAssetShareChangePct,
    0,
    100,
  );
  const concentrationDelta =
    (previousTopShare - portfolio.metrics.topAssetSharePct) * 0.5 * (WEIGHTS.concentration / 100);

  return round1(clamp(currentTotal + concentrationDelta, 0, 100));
}

// ---------------------------------------------------------------------------
// Patterns (Spec §5.72)
// ---------------------------------------------------------------------------

function detectPatterns(
  metrics: RiskMetrics,
  portfolio: PortfolioIntelligence,
  trading: TradingIntelligence,
  performance: PerformanceIntelligence,
  period: ResolvedPeriod,
  confidence: Confidence,
): Pattern[] {
  const patterns: Pattern[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  // Pattern 1 — High Asset Dependency
  if (metrics.topAssetSharePct > HIGH_DEPENDENCY_PCT) {
    patterns.push({
      id: makePatternId('risk', 'high_asset_dependency', portfolio.metrics.topAssetSymbol),
      type: 'high_asset_dependency',
      name: 'High Asset Dependency',
      description: 'Portfolio performance is highly dependent on a single asset.',
      category: 'risk',
      confidence,
      evidence: compactEvidence({
        asset: portfolio.metrics.topAssetSymbol,
        top_asset_share_pct: metrics.topAssetSharePct,
        top3_share_pct: metrics.top3SharePct,
        portfolio_value_usd: metrics.portfolioValueUsd,
      }),
    });
  }

  // Pattern 2 — Increasing Risk Exposure
  if (metrics.riskScoreChange != null && metrics.riskScoreChange >= RISK_INCREASE_POINTS) {
    patterns.push({
      id: makePatternId('risk', 'increasing_risk_exposure'),
      type: 'increasing_risk_exposure',
      name: 'Increasing Risk Exposure',
      description: 'Risk exposure increased compared with the previous period.',
      category: 'risk',
      confidence: lowestConfidence(confidence, 'medium'),
      evidence: compactEvidence({
        current_risk_score: metrics.riskScore.total,
        previous_risk_score: metrics.previousRiskScore,
        change_points: metrics.riskScoreChange,
        dominant_layer: metrics.riskScore.dominantLayer,
        period: periodLabel,
      }),
    });
  }

  // Pattern 3 — Volatility Expansion
  const recentVolatility = performance.metrics.volatilityScore;
  if (
    recentVolatility != null &&
    metrics.maxDrawdownPct != null &&
    recentVolatility >= 50 &&
    Math.abs(metrics.maxDrawdownPct) >= 15 * VOLATILITY_EXPANSION_FACTOR
  ) {
    patterns.push({
      id: makePatternId('risk', 'volatility_expansion'),
      type: 'volatility_expansion',
      name: 'Volatility Expansion',
      description: 'Portfolio value fluctuations widened during this period.',
      category: 'risk',
      confidence: performance.confidence,
      evidence: compactEvidence({
        volatility_score: recentVolatility,
        volatility_pct: metrics.volatilityPct,
        max_drawdown_pct: metrics.maxDrawdownPct,
        snapshot_count: performance.metrics.snapshotCount,
        period: periodLabel,
      }),
    });
  }

  // Pattern 4 — Dormant Risk
  if (
    trading.metrics.tradeCount <= LOW_ACTIVITY_TX_COUNT &&
    metrics.topAssetSharePct >= DORMANT_CONCENTRATION_PCT
  ) {
    patterns.push({
      id: makePatternId('risk', 'dormant_risk'),
      type: 'dormant_risk',
      name: 'Dormant Risk',
      description: 'The portfolio is inactive but structurally concentrated.',
      category: 'risk',
      confidence,
      evidence: compactEvidence({
        trade_count: trading.metrics.tradeCount,
        top_asset: portfolio.metrics.topAssetSymbol,
        top_asset_share_pct: metrics.topAssetSharePct,
        concentration_score: metrics.riskScore.components.concentration,
        period: periodLabel,
      }),
    });
  }

  // Pattern 5 — Sudden Behavior Change
  if (metrics.activitySpikeRatio != null && metrics.activitySpikeRatio >= ACTIVITY_SPIKE_FACTOR) {
    patterns.push({
      id: makePatternId('risk', 'sudden_behavior_change'),
      type: 'sudden_behavior_change',
      name: 'Sudden Behavior Change',
      description: 'Wallet behavior changed significantly compared with its historical baseline.',
      category: 'risk',
      confidence,
      evidence: compactEvidence({
        activity_ratio: metrics.activitySpikeRatio,
        activity_spike_score: metrics.activitySpikeScore,
        behavioral_score: metrics.riskScore.components.behavioral,
        period: periodLabel,
      }),
    });
  }

  // Pattern 6 — Unknown Asset Exposure
  if (metrics.unknownExposurePct >= UNKNOWN_EXPOSURE_PCT) {
    patterns.push({
      id: makePatternId('risk', 'unknown_asset_exposure'),
      type: 'unknown_asset_exposure',
      name: 'Unknown Asset Exposure',
      description:
        'A portion of the portfolio value is held in assets that could not be classified.',
      category: 'risk',
      confidence: 'low',
      evidence: compactEvidence({
        unknown_exposure_pct: metrics.unknownExposurePct,
        data_confidence_score: metrics.dataConfidenceScore,
        portfolio_value_usd: metrics.portfolioValueUsd,
      }),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Insights (Spec §5.73 severity model, §5.74 insight object)
// ---------------------------------------------------------------------------

function buildInsights(
  metrics: RiskMetrics,
  patterns: Pattern[],
  period: ResolvedPeriod,
): Insight[] {
  const insights: Insight[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  // Nothing to measure — reporting a score here would describe the absence of
  // data rather than the portfolio (Spec §5.67 Layer 6).
  if (metrics.transactionCount === 0 && metrics.portfolioValueUsd === 0) {
    insights.push({
      id: makeInsightId('risk', 'no_data_for_assessment'),
      type: 'no_data_for_assessment',
      category: 'risk',
      title: 'Exposure could not be assessed',
      description:
        'No holdings and no transactions were available, so none of the six exposure layers could be measured.',
      severity: 'informational',
      confidence: 'low',
      impactUsd: null,
      evidence: compactEvidence({
        transaction_count: 0,
        portfolio_value_usd: 0,
        period: periodLabel,
      }),
    });
    return insights;
  }

  for (const pattern of patterns) {
    insights.push(insightFromPattern(pattern, metrics, periodLabel));
  }

  // Always describe the headline exposure, so the score is never shown unexplained.
  const dominant = metrics.layers.find(l => l.key === metrics.riskScore.dominantLayer);
  insights.push({
    id: makeInsightId('risk', 'exposure_profile'),
    type: 'exposure_profile',
    category: 'risk',
    title: `Portfolio exposure score is ${metrics.riskScore.total} of 100`,
    description: `The combined exposure score is ${metrics.riskScore.total}, driven mainly by ${dominant?.name ?? 'concentration'} at ${dominant?.contribution ?? 0} of ${dominant?.weight ?? 0} weighted points. A higher score means more exposure, not a lower-quality portfolio; a high reading may reflect a deliberate structure.`,
    severity: severityFromScore(metrics.riskScore.total),
    confidence: metrics.riskScore.confidence,
    impact: 'Describes how much of the portfolio outcome depends on a small number of factors.',
    impactUsd: metrics.portfolioValueUsd,
    evidence: compactEvidence({
      risk_score: metrics.riskScore.total,
      risk_level: metrics.riskScore.level,
      dominant_layer: metrics.riskScore.dominantLayer,
      concentration: metrics.riskScore.components.concentration,
      volatility: metrics.riskScore.components.volatility,
      liquidity: metrics.riskScore.components.liquidity,
      behavioral: metrics.riskScore.components.behavioral,
      operational: metrics.riskScore.components.operational,
      data: metrics.riskScore.components.data,
      period: periodLabel,
    }),
  });

  if (metrics.dataConfidenceScore < 50) {
    insights.push({
      id: makeInsightId('risk', 'limited_data_coverage'),
      type: 'limited_data_coverage',
      category: 'risk',
      title: 'Risk analysis runs on partial data',
      description: `Price, asset, and snapshot coverage combine to a data confidence score of ${metrics.dataConfidenceScore} out of 100. Exposure measures are reported at reduced confidence and some layers may be understated.`,
      severity: 'medium',
      confidence: 'low',
      impact: 'Reported exposure may not reflect the full position.',
      impactUsd: null,
      evidence: compactEvidence({
        data_confidence_score: metrics.dataConfidenceScore,
        unknown_exposure_pct: metrics.unknownExposurePct,
        data_layer_score: metrics.riskScore.components.data,
      }),
    });
  }

  return insights;
}

function insightFromPattern(pattern: Pattern, metrics: RiskMetrics, periodLabel: string): Insight {
  const asset = typeof pattern.evidence.asset === 'string' ? pattern.evidence.asset : null;
  const base = {
    id: makeInsightId('risk', pattern.type, asset),
    type: pattern.type,
    category: 'risk' as const,
    confidence: pattern.confidence,
    evidence: pattern.evidence,
  };

  switch (pattern.type) {
    case 'high_asset_dependency':
      return {
        ...base,
        title: `Portfolio outcome depends heavily on ${asset ?? 'a single asset'}`,
        description: `${asset ?? 'One asset'} represents ${formatPct(metrics.topAssetSharePct)} of portfolio value. Most of the portfolio value moves with this asset, so gains and declines will largely follow it.`,
        severity: metrics.topAssetSharePct >= 80 ? 'high' : 'medium',
        impact: 'Portfolio results track one asset rather than a spread of positions.',
        impactUsd: round2((metrics.portfolioValueUsd * metrics.topAssetSharePct) / 100),
        relatedEntities: asset ? [asset] : undefined,
      };
    case 'increasing_risk_exposure':
      return {
        ...base,
        title: `Exposure increased by ${round1(metrics.riskScoreChange ?? 0)} points`,
        description: `The exposure score moved from ${metrics.previousRiskScore ?? 0} to ${metrics.riskScore.total} over ${periodLabel}. The structure of the portfolio shifted toward higher exposure; this describes change, not outcome.`,
        severity: 'medium',
        impact: 'A larger share of the outcome now depends on fewer factors.',
        impactUsd: null,
      };
    case 'volatility_expansion':
      return {
        ...base,
        title: 'Value fluctuations widened during the period',
        description: `Portfolio value moved with a volatility score of ${Math.round(metrics.volatilityScore ?? 0)} and a maximum drawdown of ${formatPct(Math.abs(metrics.maxDrawdownPct ?? 0))} from peak. Swings during this window were wider than in the earlier part of the history.`,
        severity: 'medium',
        impact: 'Short-term value readings are less representative of the trend.',
        impactUsd: null,
      };
    case 'dormant_risk':
      return {
        ...base,
        title: 'Low activity does not reduce structural exposure',
        description: `Only ${Number(pattern.evidence.trade_count ?? 0)} trade(s) were recorded over ${periodLabel}, while ${formatPct(metrics.topAssetSharePct)} of value sits in a single asset. The dependency remains unchanged regardless of the low activity.`,
        severity: 'medium',
        impact: 'Exposure persists without any activity to change it.',
        impactUsd: round2((metrics.portfolioValueUsd * metrics.topAssetSharePct) / 100),
      };
    case 'sudden_behavior_change':
      return {
        ...base,
        title: 'Activity level differs sharply from the historical baseline',
        description: `Recorded activity over ${periodLabel} is ${round1(metrics.activitySpikeRatio ?? 0)}x the historical average for a comparable window. The data shows the change in behaviour; it does not show the reason.`,
        severity: 'low',
        impact: 'Current activity is not representative of the wallet history.',
        impactUsd: null,
      };
    default:
      return {
        ...base,
        title: `${formatPct(metrics.unknownExposurePct)} of value sits in unclassified assets`,
        description: `Part of the portfolio value is held in assets that could not be priced or classified from the available data. This reduces analysis confidence and is reported as a data limitation, not as a judgement about those assets.`,
        severity: metrics.unknownExposurePct >= 30 ? 'high' : 'medium',
        impact: 'Part of the exposure cannot be measured.',
        impactUsd: round2((metrics.portfolioValueUsd * metrics.unknownExposurePct) / 100),
      };
  }
}

/** Severity reflects magnitude of exposure, never a recommendation (Spec §5.73). */
function severityFromScore(score: number): Severity {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 30) return 'low';
  return 'informational';
}

// ---------------------------------------------------------------------------
// Summary (Spec §5.77)
// ---------------------------------------------------------------------------

function buildSummary(metrics: RiskMetrics, period: ResolvedPeriod): string {
  const parts: string[] = [];
  parts.push(
    `Exposure over the last ${period.days} days scores ${metrics.riskScore.total} out of 100 (${metrics.riskScore.level.replace(/_/g, ' ')}), where a higher number means more exposure rather than a lower-quality portfolio.`,
  );

  const ordered = [...metrics.layers].sort((a, b) => b.contribution - a.contribution);
  const [first, second] = ordered;
  if (first) {
    parts.push(
      `${first.name} contributes the most at ${first.contribution} of ${first.weight} weighted points${second ? `, followed by ${second.name} at ${second.contribution} of ${second.weight}` : ''}.`,
    );
  }

  if (metrics.topAssetSharePct > 0) {
    parts.push(
      `The largest position holds ${formatPct(metrics.topAssetSharePct)} of value and the top three hold ${formatPct(metrics.top3SharePct)}.`,
    );
  }
  if (metrics.maxDrawdownPct != null) {
    parts.push(`The widest observed decline from peak is ${formatPct(Math.abs(metrics.maxDrawdownPct))}.`);
  }
  if (metrics.unknownExposurePct > 0) {
    parts.push(
      `${formatPct(metrics.unknownExposurePct)} of value sits in assets that could not be classified, which limits how much of the exposure can be measured.`,
    );
  }
  if (metrics.portfolioValueUsd > 0) {
    parts.push(`Total value covered by this assessment is ${formatUsd(metrics.portfolioValueUsd)}.`);
  }

  return parts.join(' ');
}

/** Exposure layers ordered by contribution — used by response templates. */
export function rankRiskLayers(metrics: RiskMetrics): RiskLayer[] {
  return [...metrics.layers].sort((a, b) =>
    b.contribution === a.contribution ? a.key.localeCompare(b.key) : b.contribution - a.contribution,
  );
}
