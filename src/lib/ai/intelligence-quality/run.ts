/**
 * Package 2 orchestrator — deterministic reasoning between engines and LLM.
 */

import type { EngineOutput } from '@/lib/ai/tools/registry';
import type { AnalysisScope, DomainStatus, EvidenceItem } from '@/lib/ai/trust/types';

import { attributeAllocationDrift } from './attribution/allocation-drift';
import { attributeAssetValueChange } from './attribution/asset-value';
import { attributeCapitalMovement } from './attribution/capital-flow';
import { attributePortfolioContribution } from './attribution/portfolio';
import { assessBehavior } from './behavior';
import { buildCandidateFindings } from './candidates';
import type { IntelligenceQualityConfig } from './config';
import { MODEL_VERSIONS, getIqConfig } from './config';
import { detectContradictions } from './contradictions';
import { consolidateDuplicates } from './deduplication';
import {
  applyEligibility,
  markContradicted,
  markDuplicateSuppressed,
} from './eligibility';
import { buildIntelligenceGraph } from './graph';
import { deriveMonitoringPoints } from './monitoring';
import { numberOrNull } from './confidence-util';
import { normalizeObservations } from './observations';
import type { RelevanceContext } from './ranking';
import { rankCandidates } from './ranking';
import { buildCrossDomainRelationships } from './relationships';
import { attachReasoning, toApprovedInsight } from './root-cause';
import { selectInsights } from './selection';
import { buildDiagnostics } from './serialize';
import type {
  ApprovedInsight,
  AssetValueAttribution,
  ReasonedIntelligencePackage,
} from './types';
import { REASONED_INTELLIGENCE_SCHEMA_VERSION } from './types';
import { applyPropagatedConfidence } from './confidence-propagation';
import { buildWhatMatters } from './what-matters';

export interface RunIntelligenceQualityInput {
  envelopes: EngineOutput[];
  scope: AnalysisScope;
  domainStatuses: DomainStatus[];
  evidence: EvidenceItem[];
  portfolioValueUsd: number | null;
  periodDays: number;
  context: RelevanceContext;
  config?: IntelligenceQualityConfig;
  includeDiagnostics?: boolean;
  focusAsset?: string | null;
  /** Chat/user question — overrides page relevance when present. */
  userQuestion?: string | null;
  /** Explicit analysis level label for wallet vs user portfolio. */
  analysisLevelLabel?: 'wallet' | 'user_portfolio';
}

function nowMs(): number {
  return Date.now();
}

export function runIntelligenceQuality(input: RunIntelligenceQualityInput): ReasonedIntelligencePackage {
  const cfg = getIqConfig(input.config);
  const timings: Record<string, number> = {};
  let t0 = nowMs();

  const observations = normalizeObservations({
    envelopes: input.envelopes,
    scope: input.scope,
    evidence: input.evidence,
  });
  timings.observations = nowMs() - t0;

  t0 = nowMs();
  let candidates = buildCandidateFindings({
    envelopes: input.envelopes,
    observations,
    scope: input.scope,
    domainStatuses: input.domainStatuses,
    evidence: input.evidence,
    portfolioValueUsd: input.portfolioValueUsd,
    periodDays: input.periodDays,
    config: cfg,
  });
  timings.candidates = nowMs() - t0;

  t0 = nowMs();
  candidates = applyEligibility(candidates, input.domainStatuses, cfg);
  timings.eligibility = nowMs() - t0;

  t0 = nowMs();
  const portfolio = attributePortfolioContribution({
    envelopes: input.envelopes,
    portfolioValueUsd: input.portfolioValueUsd,
    periodDays: input.periodDays,
  });
  const capitalFlow = attributeCapitalMovement({ envelopes: input.envelopes });

  const assetAttributions: AssetValueAttribution[] = [];
  const focus = input.focusAsset;
  if (focus) {
    // Best-effort from metrics when explicit lots/prices absent
    const assetEnv = input.envelopes.find(e => e.engine === 'asset');
    const assets = (assetEnv?.metrics?.assets as Array<Record<string, unknown>> | undefined) ?? [];
    const row = assets.find(a => String(a.symbol) === focus);
    if (row) {
      assetAttributions.push(
        attributeAssetValueChange({
          assetId: focus,
          beginningQuantity: numberOrNull(row.beginningQuantity),
          endingQuantity: numberOrNull(row.quantity) ?? numberOrNull(row.endingQuantity),
          beginningPriceUsd: numberOrNull(row.beginningPriceUsd),
          endingPriceUsd: numberOrNull(row.priceUsd) ?? numberOrNull(row.endingPriceUsd),
          pricingCoverage: numberOrNull(row.pricingCoverage) ?? 0.5,
        }),
      );
    }
  }

  const snapshotsAvailable = input.domainStatuses.some(
    d => d.domain === 'snapshots' && (d.status === 'available' || d.status === 'partial'),
  );
  const allocationDrift = focus
    ? [
        attributeAllocationDrift({
          assetId: focus,
          previousAllocationPct:
            numberOrNull(
              input.envelopes.find(e => e.engine === 'asset')?.metrics?.previousAllocationPct,
            ) ?? 0,
          currentAllocationPct:
            numberOrNull(
              input.envelopes.find(e => e.engine === 'asset')?.metrics?.allocationPct,
            ) ??
            numberOrNull(
              (input.envelopes.find(e => e.engine === 'portfolio')?.metrics as Record<string, unknown>)
                ?.topAllocationPct,
            ) ??
            0,
          assetAttribution: assetAttributions[0],
          otherAssetsGrowthUsd: portfolio.contributors
            .filter(c => c.entityType === 'asset' && c.entityId !== focus)
            .reduce((s, c) => s + c.contributionUsd, 0),
          externalFlowUsd: capitalFlow.netExternalFlowUsd,
          snapshotsAvailable,
        }),
      ]
    : [];
  timings.attribution = nowMs() - t0;

  t0 = nowMs();
  const { survivors, duplicateIds, relationships: dupRels } = consolidateDuplicates(candidates);
  candidates = markDuplicateSuppressed(survivors, duplicateIds);
  const { results: contradictions, rejectedIds } = detectContradictions(candidates);
  candidates = markContradicted(candidates, rejectedIds);
  const crossRels = buildCrossDomainRelationships(candidates, portfolio);
  timings.contradictions = nowMs() - t0;

  t0 = nowMs();
  const graph = buildIntelligenceGraph({ observations, candidates });
  for (const e of [...dupRels, ...crossRels]) {
    graph.edges.push({
      from: e.from,
      to: e.to,
      relationship:
        e.relationship === 'duplicates'
          ? 'duplicates'
          : e.relationship === 'offsets'
            ? 'offsets'
            : e.relationship === 'contributes_to'
              ? 'contributes_to'
              : e.relationship === 'explains' || e.relationship === 'causes'
                ? 'causes'
                : e.relationship === 'contradicts'
                  ? 'contradicts'
                  : 'supports',
      strength: e.strength,
      evidenceIds: e.evidenceIds,
    });
  }
  timings.graph = nowMs() - t0;

  t0 = nowMs();
  const ranked = rankCandidates(
    candidates,
    input.context,
    duplicateIds,
    cfg,
    input.userQuestion,
  );
  timings.ranking = nowMs() - t0;

  t0 = nowMs();
  const selectionContext: RelevanceContext =
    input.userQuestion && /portfolio|entire|whole/i.test(input.userQuestion)
      ? 'chat'
      : input.context;
  const selectedInsightIds = selectInsights({
    ranked,
    context: selectionContext,
    config: cfg,
  });
  timings.selection = nowMs() - t0;

  const reasoned = attachReasoning(
    ranked.map(r => r.candidate),
    portfolio,
    assetAttributions,
  );

  const approvedInsights: ApprovedInsight[] = [];
  for (const row of ranked) {
    const withReasoning = reasoned.find(r => r.id === row.candidate.id);
    if (!withReasoning) continue;
    const rels = [...dupRels, ...crossRels].filter(
      r => r.from === row.candidate.id || r.to === row.candidate.id,
    );
    let approved = toApprovedInsight(withReasoning, {
      relationships: rels,
      priority: row.priority,
      monitoringPointIds: [],
    });
    const assetAttr = assetAttributions.find(a =>
      approved.entityIds.includes(a.assetId),
    );
    approved = applyPropagatedConfidence(approved, assetAttr?.confidence);
    approvedInsights.push(approved);
  }

  const selectedApproved = approvedInsights.filter(a => selectedInsightIds.includes(a.id));
  const monitoringPoints = deriveMonitoringPoints(selectedApproved);
  for (const a of approvedInsights) {
    a.monitoringPointIds = monitoringPoints
      .filter(m => m.relatedFindingId === a.id)
      .map(m => m.id);
  }

  const whatMatters = buildWhatMatters({
    approved: approvedInsights,
    selectedIds: selectedInsightIds,
    portfolio,
    domainStatuses: input.domainStatuses,
  });

  const behavior = assessBehavior({
    envelopes: input.envelopes,
    scope: input.scope,
    periodDays: input.periodDays,
  });

  const limitations = [
    ...new Set([
      ...portfolio.limitations,
      ...capitalFlow.limitations,
      ...allocationDrift.flatMap(d => d.limitations),
      ...input.scope.entitlementScope.limitations,
      ...(input.analysisLevelLabel === 'wallet' || !input.analysisLevelLabel
        ? ['Analysis level: individual wallet (not combined user portfolio).']
        : ['Analysis level: combined user portfolio.']),
    ]),
  ];

  const completionStatus =
    input.scope.coverage.status === 'unavailable'
      ? 'insufficient_data'
      : input.scope.coverage.truncated
        ? 'partial'
        : selectedInsightIds.length === 0
          ? 'partial'
          : 'complete';

  const pkg: ReasonedIntelligencePackage = {
    schemaVersion: REASONED_INTELLIGENCE_SCHEMA_VERSION,
    scope: input.scope,
    domainStatuses: input.domainStatuses,
    observations,
    candidateFindings: candidates,
    approvedInsights,
    graph,
    attribution: {
      portfolio,
      assets: assetAttributions,
      allocationDrift,
      capitalFlow,
    },
    contradictions,
    rankedInsightIds: ranked.map(r => r.candidate.id),
    selectedInsightIds,
    whatMatters,
    monitoringPoints,
    behavior,
    completionStatus,
    limitations,
    versions: {
      reasoningEngine: MODEL_VERSIONS.reasoningEngine,
      eligibilityRules: MODEL_VERSIONS.eligibilityRules,
      materialityModel: MODEL_VERSIONS.materialityModel,
      significanceModel: MODEL_VERSIONS.significanceModel,
      rankingModel: MODEL_VERSIONS.rankingModel,
      attributionModel: MODEL_VERSIONS.portfolioAttribution,
      behaviorModel: MODEL_VERSIONS.behaviorModel,
    },
    timingsMs: timings,
  };

  if (input.includeDiagnostics) {
    pkg.diagnostics = buildDiagnostics(pkg);
  }

  timings.total = Object.values(timings).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  pkg.timingsMs = timings;

  return pkg;
}
