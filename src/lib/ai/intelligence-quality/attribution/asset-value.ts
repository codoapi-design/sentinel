import { MODEL_VERSIONS, RULE_IDS } from '../config';
import { getIqConfig } from '../config';
import { scoreConfidence } from '../confidence-util';
import type { AssetValueAttribution } from '../types';

/**
 * ΔV = q0·Δp + p0·Δq + Δp·Δq  (asset-attribution-v1)
 */
export function attributeAssetValueChange(input: {
  assetId: string;
  beginningQuantity: number | null;
  endingQuantity: number | null;
  beginningPriceUsd: number | null;
  endingPriceUsd: number | null;
  pricingCoverage?: number;
}): AssetValueAttribution {
  const cfg = getIqConfig();
  const limitations: string[] = [
    `formula:${RULE_IDS.attrPriceQty}`,
    `model:${MODEL_VERSIONS.assetAttribution}`,
  ];

  const q0 = input.beginningQuantity;
  const q1 = input.endingQuantity;
  const p0 = input.beginningPriceUsd;
  const p1 = input.endingPriceUsd;
  const pricingCoverage = input.pricingCoverage ?? (
    p0 != null && p1 != null ? 1 : p0 != null || p1 != null ? 0.5 : 0
  );

  if (q0 == null || q1 == null || p0 == null || p1 == null) {
    limitations.push('Insufficient historical balance/price data for decomposition.');
    return {
      assetId: input.assetId,
      beginningQuantity: q0,
      endingQuantity: q1,
      beginningPriceUsd: p0,
      endingPriceUsd: p1,
      totalValueChangeUsd: null,
      priceEffectUsd: null,
      quantityEffectUsd: null,
      interactionEffectUsd: null,
      pricingCoverage,
      confidence: scoreConfidence({ pricing: pricingCoverage * 100, sample: 20, historical: 20 }),
      limitations,
      formulaVersion: MODEL_VERSIONS.assetAttribution,
      reconcileErrorUsd: 0,
    };
  }

  const dp = p1 - p0;
  const dq = q1 - q0;
  const priceEffectUsd = q0 * dp;
  const quantityEffectUsd = p0 * dq;
  const interactionEffectUsd = dp * dq;
  const totalValueChangeUsd = q1 * p1 - q0 * p0;
  const sumParts = priceEffectUsd + quantityEffectUsd + interactionEffectUsd;
  const reconcileErrorUsd = Math.abs(sumParts - totalValueChangeUsd);
  const tol = Math.max(
    cfg.thresholds.attributionToleranceUsd,
    Math.abs(totalValueChangeUsd) * (cfg.thresholds.attributionTolerancePct / 100),
  );
  if (reconcileErrorUsd > tol) {
    limitations.push(`Reconciliation residual ${reconcileErrorUsd.toFixed(4)} exceeds tolerance.`);
  }

  return {
    assetId: input.assetId,
    beginningQuantity: q0,
    endingQuantity: q1,
    beginningPriceUsd: p0,
    endingPriceUsd: p1,
    totalValueChangeUsd,
    priceEffectUsd,
    quantityEffectUsd,
    interactionEffectUsd,
    pricingCoverage,
    confidence: scoreConfidence({
      pricing: pricingCoverage * 100,
      historical: 80,
      sample: 75,
      reasons: [`reconcileError=${reconcileErrorUsd.toFixed(4)}`],
    }),
    limitations,
    formulaVersion: MODEL_VERSIONS.assetAttribution,
    reconcileErrorUsd,
  };
}
