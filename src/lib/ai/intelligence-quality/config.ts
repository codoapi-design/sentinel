/**
 * Central Package 2 configuration — single source for production and tests.
 */

export const MODEL_VERSIONS = {
  reasoningEngine: 'reasoning-engine-v1',
  eligibilityRules: 'eligibility-rules-v1',
  sampleAdequacy: 'sample-adequacy-v1',
  materialityModel: 'materiality-model-v1',
  significanceModel: 'significance-model-v1',
  noveltyModel: 'novelty-model-v1',
  rootCauseModel: 'root-cause-model-v1',
  portfolioAttribution: 'portfolio-attribution-v1',
  assetAttribution: 'asset-attribution-v1',
  allocationDrift: 'allocation-drift-v1',
  rankingModel: 'ranking-model-v1',
  behaviorModel: 'behavior-model-v1',
} as const;

export interface IntelligenceQualityConfig {
  version: string;
  minimumSamples: Record<string, number>;
  minimumActiveDays: Record<string, number>;
  materialityWeights: Record<string, number>;
  significanceWeights: Record<string, number>;
  rankingWeights: Record<string, number>;
  thresholds: Record<string, number>;
  maximumPrimaryInsights: {
    dashboard: number;
    chat: number;
    report: number;
  };
}

/** Documented defaults — relative materiality, not fixed USD-only. */
export const DEFAULT_IQ_CONFIG: IntelligenceQualityConfig = {
  version: 'iq-config-v1',
  minimumSamples: {
    counterparty_dependency: 3,
    counterparty_pattern: 3,
    trading_pattern: 5,
    performance_trend: 3,
    behavior_profile: 10,
    flow_concentration: 2,
    default: 2,
  },
  minimumActiveDays: {
    counterparty_dependency: 2,
    trading_pattern: 3,
    behavior_profile: 7,
    default: 1,
  },
  materialityWeights: {
    portfolioImpactPct: 0.4,
    impactUsd: 0.2,
    allocationImpactPp: 0.2,
    transactionSizeRelativeToPortfolio: 0.1,
    recurrenceImpact: 0.1,
  },
  significanceWeights: {
    historicalDeviation: 0.25,
    periodOverPeriodChange: 0.25,
    baselineDeviation: 0.2,
    persistence: 0.15,
    rarity: 0.15,
  },
  rankingWeights: {
    materiality: 0.28,
    significance: 0.22,
    confidence: 0.15,
    novelty: 0.12,
    persistence: 0.08,
    userRelevance: 0.15,
    dataQualityPenalty: 0.1,
    duplicationPenalty: 0.08,
  },
  thresholds: {
    materialityMediumPortfolioPct: 5,
    materialityHighPortfolioPct: 15,
    materialityCriticalPortfolioPct: 30,
    materialityMediumAllocationPp: 5,
    materialityHighAllocationPp: 10,
    nearZeroPortfolioChangePct: 0.1,
    nearZeroPortfolioChangeFloorUsd: 1,
    attributionToleranceUsd: 0.01,
    attributionTolerancePct: 0.5,
    significanceNotable: 0.35,
    significanceSignificant: 0.55,
    significanceExceptional: 0.75,
    eligibilityMinMaterialityScore: 0.25,
    eligibilityMinSignificanceScore: 0.35,
    singleInteractionDependencyBan: 1,
    suspiciousCounterpartyBoost: 1,
  },
  maximumPrimaryInsights: {
    dashboard: 5,
    chat: 3,
    report: 12,
  },
};

export const RULE_IDS = {
  eligSingleInteraction: 'elig.counterparty.single_interaction_v1',
  eligOneTimeMaterial: 'elig.counterparty.one_time_material_v1',
  eligLowMateriality: 'elig.materiality.low_v1',
  eligInsufficientSample: 'elig.sample.insufficient_v1',
  eligIncompleteScope: 'elig.scope.incomplete_v1',
  eligDuplicate: 'elig.duplicate.v1',
  eligContradicted: 'elig.contradicted.v1',
  eligNormalBehavior: 'elig.normal_behavior.v1',
  eligNotMeaningful: 'elig.not_meaningful.v1',
  eligLowConfidence: 'elig.confidence.low_v1',
  matRelativePortfolio: 'mat.relative_portfolio_v1',
  sigBaseline: 'sig.baseline_deviation_v1',
  attrPriceQty: 'attr.asset.price_qty_interaction_v1',
  attrPortfolioReconcile: 'attr.portfolio.reconcile_v1',
  rankWeighted: 'rank.weighted_v1',
} as const;

export function getIqConfig(overrides?: Partial<IntelligenceQualityConfig>): IntelligenceQualityConfig {
  if (!overrides) return DEFAULT_IQ_CONFIG;
  return {
    ...DEFAULT_IQ_CONFIG,
    ...overrides,
    minimumSamples: { ...DEFAULT_IQ_CONFIG.minimumSamples, ...overrides.minimumSamples },
    minimumActiveDays: { ...DEFAULT_IQ_CONFIG.minimumActiveDays, ...overrides.minimumActiveDays },
    materialityWeights: { ...DEFAULT_IQ_CONFIG.materialityWeights, ...overrides.materialityWeights },
    significanceWeights: { ...DEFAULT_IQ_CONFIG.significanceWeights, ...overrides.significanceWeights },
    rankingWeights: { ...DEFAULT_IQ_CONFIG.rankingWeights, ...overrides.rankingWeights },
    thresholds: { ...DEFAULT_IQ_CONFIG.thresholds, ...overrides.thresholds },
    maximumPrimaryInsights: {
      ...DEFAULT_IQ_CONFIG.maximumPrimaryInsights,
      ...overrides.maximumPrimaryInsights,
    },
  };
}
