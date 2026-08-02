import type { IntelligenceQualityConfig } from './config';
import { getIqConfig, RULE_IDS } from './config';
import type { MaterialityScore } from './types';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Relative financial materiality — same USD can be high in a small wallet and low in a large one.
 */
export function scoreMateriality(input: {
  impactUsd?: number | null;
  portfolioValueUsd?: number | null;
  assetValueUsd?: number | null;
  allocationImpactPp?: number | null;
  recurrenceCount?: number | null;
  config?: IntelligenceQualityConfig;
}): MaterialityScore {
  const config = getIqConfig(input.config);
  const t = config.thresholds;
  const impactUsd = input.impactUsd != null && Number.isFinite(input.impactUsd) ? Math.abs(input.impactUsd) : null;
  const portfolio = input.portfolioValueUsd != null && input.portfolioValueUsd > 0 ? input.portfolioValueUsd : null;
  const asset = input.assetValueUsd != null && input.assetValueUsd > 0 ? input.assetValueUsd : null;

  const portfolioImpactPct =
    impactUsd != null && portfolio != null ? (impactUsd / portfolio) * 100 : null;
  const assetImpactPct = impactUsd != null && asset != null ? (impactUsd / asset) * 100 : null;
  const allocationImpactPp =
    input.allocationImpactPp != null ? Math.abs(input.allocationImpactPp) : null;
  const txRelative = portfolioImpactPct;
  const recurrenceImpact =
    input.recurrenceCount != null && input.recurrenceCount > 1
      ? Math.min(1, (input.recurrenceCount - 1) / 5)
      : 0;

  const reasons: string[] = [`rule:${RULE_IDS.matRelativePortfolio}`];

  let score = 0;
  if (portfolioImpactPct != null) {
    const pctScore =
      portfolioImpactPct >= t.materialityCriticalPortfolioPct
        ? 1
        : portfolioImpactPct >= t.materialityHighPortfolioPct
          ? 0.8
          : portfolioImpactPct >= t.materialityMediumPortfolioPct
            ? 0.55
            : portfolioImpactPct >= 1
              ? 0.3
              : 0.1;
    score += (config.materialityWeights.portfolioImpactPct ?? 0.4) * pctScore;
    reasons.push(`Portfolio impact ${portfolioImpactPct.toFixed(2)}%.`);
  } else if (impactUsd != null) {
    score += (config.materialityWeights.impactUsd ?? 0.2) * (impactUsd >= 1000 ? 0.5 : 0.2);
    reasons.push('Portfolio value unavailable; absolute USD used weakly.');
  }

  if (allocationImpactPp != null) {
    const aScore =
      allocationImpactPp >= t.materialityHighAllocationPp
        ? 1
        : allocationImpactPp >= t.materialityMediumAllocationPp
          ? 0.6
          : allocationImpactPp >= 2
            ? 0.35
            : 0.1;
    score += (config.materialityWeights.allocationImpactPp ?? 0.2) * aScore;
    reasons.push(`Allocation impact ${allocationImpactPp.toFixed(2)} pp.`);
  }

  score += (config.materialityWeights.recurrenceImpact ?? 0.1) * recurrenceImpact;
  if (txRelative != null) {
    score += (config.materialityWeights.transactionSizeRelativeToPortfolio ?? 0.1) * clamp01(txRelative / 20);
  }

  // Absolute relative floors: a 30%+ portfolio hit is always at least high/critical
  // even when other weighted components are absent.
  // Modest 3–5% effects remain eligibility-eligible (e.g. localized loss in a growing book).
  if (portfolioImpactPct != null) {
    if (portfolioImpactPct >= t.materialityCriticalPortfolioPct) score = Math.max(score, 0.9);
    else if (portfolioImpactPct >= t.materialityHighPortfolioPct) score = Math.max(score, 0.7);
    else if (portfolioImpactPct >= t.materialityMediumPortfolioPct) score = Math.max(score, 0.45);
    else if (portfolioImpactPct >= 3) score = Math.max(score, 0.28);
    else if (portfolioImpactPct >= 2) score = Math.max(score, 0.26);
  }

  score = clamp01(score);

  const level: MaterialityScore['level'] =
    score >= 0.85
      ? 'critical'
      : score >= 0.65
        ? 'high'
        : score >= 0.4
          ? 'medium'
          : score >= 0.2
            ? 'low'
            : 'immaterial';

  return {
    score,
    level,
    components: {
      impactUsd,
      portfolioImpactPct,
      assetImpactPct,
      allocationImpactPp,
      transactionSizeRelativeToPortfolio: txRelative,
      recurrenceImpact,
    },
    reasons,
  };
}
