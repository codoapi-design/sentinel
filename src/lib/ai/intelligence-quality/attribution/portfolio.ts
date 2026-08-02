import type { EngineOutput } from '@/lib/ai/tools/registry';

import { MODEL_VERSIONS } from '../config';
import { getIqConfig } from '../config';
import { numberOrNull, scoreConfidence } from '../confidence-util';
import type { ContributionAttribution } from '../types';

function nearZero(totalChange: number, portfolioValue: number | null, cfg = getIqConfig()): boolean {
  const floor = cfg.thresholds.nearZeroPortfolioChangeFloorUsd;
  const pct = cfg.thresholds.nearZeroPortfolioChangePct;
  const byPct = portfolioValue != null ? Math.abs(portfolioValue) * (pct / 100) : floor;
  return Math.abs(totalChange) <= Math.max(floor, byPct);
}

export function attributePortfolioContribution(input: {
  envelopes: EngineOutput[];
  portfolioValueUsd: number | null;
  periodDays: number;
}): ContributionAttribution {
  const cfg = getIqConfig();
  const perf = input.envelopes.find(e => e.engine === 'performance');
  const flow = input.envelopes.find(e => e.engine === 'flow');
  const asset = input.envelopes.find(e => e.engine === 'asset');

  const totalChangeUsd =
    numberOrNull(perf?.metrics?.valueChangeUsd) ??
    numberOrNull(perf?.metrics?.portfolioChangeUsd) ??
    numberOrNull((perf?.metrics as { changeUsd?: number })?.changeUsd) ??
    0;

  const externalInflowUsd =
    numberOrNull(flow?.metrics?.inflowUsd) ??
    numberOrNull(flow?.metrics?.externalInflowUsd) ??
    0;
  const externalOutflowUsd =
    numberOrNull(flow?.metrics?.outflowUsd) ??
    numberOrNull(flow?.metrics?.externalOutflowUsd) ??
    0;
  const feesUsd =
    numberOrNull(flow?.metrics?.gasFeesUsd) ??
    numberOrNull(perf?.metrics?.feesUsd) ??
    0;

  const contributors: ContributionAttribution['contributors'] = [];

  // Asset contributors from performance/asset metrics when present
  const top =
    (perf?.metrics?.topContributors as Array<Record<string, unknown>> | undefined) ??
    (asset?.metrics?.assets as Array<Record<string, unknown>> | undefined) ??
    [];

  for (const row of top.slice(0, 8)) {
    const id = String(row.symbol ?? row.asset ?? row.entityId ?? 'asset');
    const contributionUsd =
      numberOrNull(row.contributionUsd) ??
      numberOrNull(row.valueChangeUsd) ??
      numberOrNull(row.changeUsd) ??
      0;
    if (contributionUsd === 0) continue;
    contributors.push({
      entityId: id,
      entityType: 'asset',
      contributionUsd,
      contributionPctOfTotalChange: null,
      direction: contributionUsd > 0 ? 'positive' : contributionUsd < 0 ? 'negative' : 'neutral',
      confidence: scoreConfidence({ sample: 70, pricing: 70 }),
      evidenceIds: [],
    });
  }

  if (externalInflowUsd !== 0) {
    contributors.push({
      entityId: 'external_inflow',
      entityType: 'flow',
      contributionUsd: externalInflowUsd,
      contributionPctOfTotalChange: null,
      direction: 'positive',
      confidence: scoreConfidence({ sample: 80, classification: 75 }),
      evidenceIds: [],
    });
  }
  if (externalOutflowUsd !== 0) {
    contributors.push({
      entityId: 'external_outflow',
      entityType: 'flow',
      contributionUsd: -Math.abs(externalOutflowUsd),
      contributionPctOfTotalChange: null,
      direction: 'negative',
      confidence: scoreConfidence({ sample: 80, classification: 75 }),
      evidenceIds: [],
    });
  }
  if (feesUsd !== 0) {
    contributors.push({
      entityId: 'fees',
      entityType: 'fees',
      contributionUsd: -Math.abs(feesUsd),
      contributionPctOfTotalChange: null,
      direction: 'negative',
      confidence: scoreConfidence({ sample: 60, pricing: 50 }),
      evidenceIds: [],
    });
  }

  const explainedChangeUsd = contributors.reduce((s, c) => s + c.contributionUsd, 0);
  const unexplainedChangeUsd = totalChangeUsd - explainedChangeUsd;
  const zeroish = nearZero(totalChangeUsd, input.portfolioValueUsd, cfg);

  for (const c of contributors) {
    c.contributionPctOfTotalChange = zeroish
      ? null
      : totalChangeUsd !== 0
        ? (c.contributionUsd / totalChangeUsd) * 100
        : null;
  }

  const reconcileErrorUsd = Math.abs(explainedChangeUsd + unexplainedChangeUsd - totalChangeUsd);
  const limitations: string[] = [
    `model:${MODEL_VERSIONS.portfolioAttribution}`,
  ];
  if (zeroish) {
    limitations.push(
      'Total change near zero — contribution percentages withheld to avoid misleading ratios.',
    );
  }
  if (Math.abs(unexplainedChangeUsd) > Math.max(1, Math.abs(totalChangeUsd) * 0.05)) {
    limitations.push('Material unexplained residual remains after known contributors.');
  }

  return {
    totalChangeUsd,
    contributors,
    explainedChangeUsd,
    unexplainedChangeUsd,
    explainedPct: zeroish
      ? 0
      : totalChangeUsd !== 0
        ? Math.min(100, Math.abs(explainedChangeUsd / totalChangeUsd) * 100)
        : 0,
    externalInflowUsd,
    externalOutflowUsd,
    feesUsd,
    limitations,
    reconcileErrorUsd,
  };
}
