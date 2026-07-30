/**
 * Radareum Intelligence Engines — public surface.
 *
 * Spec: `docs/radareum-ai/05-00-intelligence-framework.md`.
 * The analytics layer computes; the LLM only explains. Every engine here is a
 * pure function: no network, no storage, no model calls, deterministic for a
 * given input (pass `now` to pin the evaluation instant).
 */

export * from './types';
export {
  DAY_MS,
  DEFAULT_PERIOD_DAYS,
  MATERIAL_USD_THRESHOLD,
  buildAssetLedger,
  buildDataQuality,
  confidenceRank,
  deriveConfidence,
  daysSinceConnected,
  formatDays,
  formatPct,
  formatPeriodLabel,
  formatSinceConnectedLabel,
  formatSignedPct,
  formatUsd,
  lowestConfidence,
  makeInsightId,
  makePatternId,
  mergeDataQuality,
  resolveHoldings,
  resolvePeriod,
  resolvePortfolioValueUsd,
  resolveSnapshots,
  resolveTransactions,
  severityRank,
  splitByPeriod,
  topN,
  type AssetCategory,
  type AssetLedger,
  type AssetLedgerEntry,
  type PeriodSplit,
  type ResolvedPeriod,
} from './shared';

export { analyzePerformance } from './performance';
export type {
  ContributionBasis,
  PerformanceContributor,
  PerformanceDirection,
  PerformanceIntelligence,
  PerformanceMetrics,
} from './performance';

export { analyzeFlow } from './flow';
export type {
  CapitalDirection,
  FlowClassification,
  FlowCounterpartyTotal,
  FlowEvent,
  FlowIntelligence,
  FlowMetrics,
  FlowTypeBreakdown,
  InflowType,
  OutflowType,
} from './flow';

export { analyzePortfolio, describePortfolioBehavior } from './portfolio';
export type {
  AssetAllocation,
  CategoryAllocation,
  DiversificationBreakdown,
  NetworkAllocation,
  PortfolioBehaviorProfile,
  PortfolioEvolution,
  PortfolioHealthScore,
  PortfolioIntelligence,
  PortfolioMetrics,
} from './portfolio';

export { analyzeAssets, rankAssetsByContribution } from './asset';
export type {
  AssetClassification,
  AssetHealthScore,
  AssetIntelligence,
  AssetLifecycleStage,
  AssetMetrics,
  AssetProfile,
} from './asset';

export { analyzeRisk, rankRiskLayers } from './risk';
export type {
  PortfolioRiskScore,
  RiskContext,
  RiskIntelligence,
  RiskLayer,
  RiskLayerKey,
  RiskLevel,
  RiskMetrics,
} from './risk';

export { analyzeTrading, describeTradingProfile, tradingActivityScore, tradingTurnoverRatio } from './trading';
export type {
  AttributionBasis,
  HoldingTimeBasis,
  TradedAssetActivity,
  TradingAttribution,
  TradingIntelligence,
  TradingMetrics,
  TradingProfile,
} from './trading';

export { analyzeNetworks, describeNetworkProfile, rankNetworksByValue } from './network';
export type {
  NetworkHealthScore,
  NetworkIntelligence,
  NetworkMetrics,
  NetworkProfile,
  NetworkStats,
} from './network';

export { analyzeCounterparties, rankCounterparties } from './counterparty';
export type {
  CounterpartyIntelligence,
  CounterpartyMetrics,
  CounterpartyProfile,
  CounterpartyType,
  CounterpartyTypeBreakdown,
  RelationshipScore,
} from './counterparty';

import { analyzeAssets, type AssetIntelligence } from './asset';
import { analyzeCounterparties, type CounterpartyIntelligence } from './counterparty';
import { analyzeFlow, type FlowIntelligence } from './flow';
import { analyzeNetworks, type NetworkIntelligence } from './network';
import { analyzePerformance, type PerformanceIntelligence } from './performance';
import { analyzePortfolio, type PortfolioIntelligence } from './portfolio';
import { analyzeRisk, type RiskIntelligence } from './risk';
import {
  confidenceRank,
  formatPeriodLabel,
  mergeDataQuality,
  resolvePeriod,
  severityRank,
} from './shared';
import { analyzeTrading, type TradingIntelligence } from './trading';
import type {
  Confidence,
  DataQuality,
  Insight,
  IntelligenceCategory,
  IntelligenceInput,
  Pattern,
} from './types';

/** Combined output of every intelligence module for one wallet snapshot. */
export interface FullIntelligence {
  performance: PerformanceIntelligence;
  flow: FlowIntelligence;
  portfolio: PortfolioIntelligence;
  assets: AssetIntelligence;
  risk: RiskIntelligence;
  trading: TradingIntelligence;
  networks: NetworkIntelligence;
  counterparties: CounterpartyIntelligence;
  /** All module insights, de-duplicated and ranked (see `rankInsights`). */
  insights: Insight[];
  /** All module patterns in module order. */
  patterns: Pattern[];
  /** Lowest confidence across the modules — the combined view is only as strong as its weakest input. */
  confidence: Confidence;
  dataQuality: DataQuality;
  /** Neutral wallet-level paragraph assembled from the module summaries. */
  summary: string;
  periodDays: number;
  generatedAt: number;
}

/** Modules included in a run, in the order the Spec lists them. */
const MODULE_ORDER: IntelligenceCategory[] = [
  'performance',
  'flow',
  'portfolio',
  'asset',
  'risk',
  'trading',
  'network',
  'counterparty',
];

/**
 * Runs every engine over the same input and returns a combined, ranked view.
 *
 * Risk receives the already-computed module results, so each engine runs once.
 */
export function runFullIntelligence(input: IntelligenceInput): FullIntelligence {
  const period = resolvePeriod(input);

  const performance = analyzePerformance(input);
  const flow = analyzeFlow(input);
  const portfolio = analyzePortfolio(input);
  const assets = analyzeAssets(input);
  const trading = analyzeTrading(input);
  const networks = analyzeNetworks(input);
  const counterparties = analyzeCounterparties(input);
  const risk = analyzeRisk(input, { performance, flow, portfolio, assets, trading });

  const modules = [
    performance,
    flow,
    portfolio,
    assets,
    risk,
    trading,
    networks,
    counterparties,
  ];

  const insights = rankInsights(modules.flatMap(module => module.insights));
  const patterns = modules.flatMap(module => module.patterns);

  return {
    performance,
    flow,
    portfolio,
    assets,
    risk,
    trading,
    networks,
    counterparties,
    insights,
    patterns,
    confidence: lowestOf(modules.map(module => module.confidence)),
    // Every module reads the same transaction set, so one module's quality is representative.
    dataQuality: mergeDataQuality([performance.dataQuality]),
    summary: buildCombinedSummary({
      performance,
      portfolio,
      flow,
      risk,
      trading,
      networks,
      counterparties,
      periodDays: period.days,
    }),
    periodDays: period.days,
    generatedAt: period.now,
  };
}

/**
 * De-duplicates insights by id, then orders them by:
 *   1. severity (critical → informational)
 *   2. confidence (high → low)
 *   3. absolute financial impact in USD (larger first)
 *   4. module order, then id — so equal insights keep a stable, deterministic order.
 *
 * When two insights share an id, the one with the higher confidence wins; ties
 * keep the first occurrence, which follows `MODULE_ORDER`.
 */
export function rankInsights(insights: Insight[]): Insight[] {
  const byId = new Map<string, { insight: Insight; index: number }>();
  insights.forEach((insight, index) => {
    const existing = byId.get(insight.id);
    if (!existing) {
      byId.set(insight.id, { insight, index });
      return;
    }
    if (confidenceRank(insight.confidence) > confidenceRank(existing.insight.confidence)) {
      byId.set(insight.id, { insight, index: existing.index });
    }
  });

  return [...byId.values()]
    .sort((a, b) => {
      const severity = severityRank(b.insight.severity) - severityRank(a.insight.severity);
      if (severity !== 0) return severity;

      const confidence =
        confidenceRank(b.insight.confidence) - confidenceRank(a.insight.confidence);
      if (confidence !== 0) return confidence;

      const impact = Math.abs(b.insight.impactUsd ?? 0) - Math.abs(a.insight.impactUsd ?? 0);
      if (impact !== 0) return impact;

      const moduleOrder =
        moduleRank(a.insight.category) - moduleRank(b.insight.category);
      if (moduleOrder !== 0) return moduleOrder;

      return a.index - b.index;
    })
    .map(entry => entry.insight);
}

function moduleRank(category: IntelligenceCategory | undefined): number {
  if (!category) return MODULE_ORDER.length;
  const index = MODULE_ORDER.indexOf(category);
  return index === -1 ? MODULE_ORDER.length : index;
}

function lowestOf(levels: Confidence[]): Confidence {
  let lowest: Confidence = 'high';
  for (const level of levels) {
    if (confidenceRank(level) < confidenceRank(lowest)) lowest = level;
  }
  return lowest;
}

interface CombinedSummaryInput {
  performance: PerformanceIntelligence;
  portfolio: PortfolioIntelligence;
  flow: FlowIntelligence;
  risk: RiskIntelligence;
  trading: TradingIntelligence;
  networks: NetworkIntelligence;
  counterparties: CounterpartyIntelligence;
  periodDays: number;
}

/** One neutral paragraph per Spec §5.5 style: description first, no advice. */
function buildCombinedSummary(input: CombinedSummaryInput): string {
  const parts = [
    `Analysis window: ${formatPeriodLabel(input.periodDays)}.`,
    input.performance.summary,
    input.portfolio.summary,
    input.flow.summary,
    input.trading.summary,
    input.networks.summary,
    input.counterparties.summary,
    input.risk.summary,
  ];
  return parts.filter(part => part && part.trim().length > 0).join(' ');
}
