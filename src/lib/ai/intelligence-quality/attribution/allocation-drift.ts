import { MODEL_VERSIONS } from '../config';
import { scoreConfidence } from '../confidence-util';
import type { AllocationDriftAttribution, AssetValueAttribution } from '../types';

export function attributeAllocationDrift(input: {
  assetId: string;
  previousAllocationPct: number;
  currentAllocationPct: number;
  assetAttribution?: AssetValueAttribution | null;
  otherAssetsGrowthUsd?: number | null;
  externalFlowUsd?: number | null;
  snapshotsAvailable: boolean;
}): AllocationDriftAttribution {
  const driftPp = input.currentAllocationPct - input.previousAllocationPct;
  const limitations: string[] = [`model:${MODEL_VERSIONS.allocationDrift}`];
  const drivers: AllocationDriftAttribution['drivers'] = [];

  if (!input.snapshotsAvailable) {
    limitations.push(
      'Historical snapshots insufficient — drift cause cannot be determined; current allocation remains usable.',
    );
    return {
      assetId: input.assetId,
      previousAllocationPct: input.previousAllocationPct,
      currentAllocationPct: input.currentAllocationPct,
      driftPp,
      drivers: [
        {
          type: 'unknown',
          confidence: scoreConfidence({ historical: 15, sample: 20 }),
          evidenceIds: [],
        },
      ],
      explainedDriftPp: null,
      unexplainedDriftPp: driftPp,
      limitations,
    };
  }

  const attr = input.assetAttribution;
  let explained = 0;

  if (attr?.priceEffectUsd != null && attr.totalValueChangeUsd != null) {
    const share =
      Math.abs(attr.totalValueChangeUsd) > 1e-9
        ? (attr.priceEffectUsd / Math.abs(attr.totalValueChangeUsd)) * driftPp
        : 0;
    drivers.push({
      type: 'asset_price',
      contributionPp: share,
      contributionUsd: attr.priceEffectUsd,
      confidence: attr.confidence,
      evidenceIds: [],
    });
    explained += share;
  }
  if (attr?.quantityEffectUsd != null && attr.totalValueChangeUsd != null) {
    const share =
      Math.abs(attr.totalValueChangeUsd) > 1e-9
        ? (attr.quantityEffectUsd / Math.abs(attr.totalValueChangeUsd)) * driftPp
        : 0;
    drivers.push({
      type: 'asset_quantity',
      contributionPp: share,
      contributionUsd: attr.quantityEffectUsd,
      confidence: attr.confidence,
      evidenceIds: [],
    });
    explained += share;
  }
  if (input.otherAssetsGrowthUsd != null && Math.abs(input.otherAssetsGrowthUsd) > 0) {
    const contrib = driftPp < 0 ? Math.min(0, driftPp * 0.5) : 0;
    drivers.push({
      type: 'other_assets_growth',
      contributionPp: contrib,
      contributionUsd: input.otherAssetsGrowthUsd,
      confidence: scoreConfidence({ historical: 60, pricing: 60 }),
      evidenceIds: [],
    });
    explained += contrib;
  }
  if (input.externalFlowUsd != null && Math.abs(input.externalFlowUsd) > 0) {
    drivers.push({
      type: 'external_flow',
      contributionPp: driftPp * 0.25,
      contributionUsd: input.externalFlowUsd,
      confidence: scoreConfidence({ classification: 70 }),
      evidenceIds: [],
    });
    explained += driftPp * 0.25;
  }

  if (drivers.length === 0) {
    limitations.push('No quantifiable driver components available.');
    drivers.push({
      type: 'unknown',
      confidence: scoreConfidence({ historical: 30 }),
      evidenceIds: [],
    });
  }

  const unexplained = driftPp - explained;
  return {
    assetId: input.assetId,
    previousAllocationPct: input.previousAllocationPct,
    currentAllocationPct: input.currentAllocationPct,
    driftPp,
    drivers,
    explainedDriftPp: explained,
    unexplainedDriftPp: unexplained,
    limitations,
  };
}
