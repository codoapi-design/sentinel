/**
 * Convert engine findings (+ key observations) into CandidateFindings.
 * Candidates do not enter narrative until eligibility + selection approve them.
 */

import type { Insight } from '@/lib/ai/intelligence';
import type { EngineOutput } from '@/lib/ai/tools/registry';
import type { AnalysisScope, DomainStatus, EvidenceItem } from '@/lib/ai/trust/types';

import type { IntelligenceQualityConfig } from './config';
import { getIqConfig } from './config';
import { numberOrNull, scoreConfidence } from './confidence-util';
import { scoreMateriality } from './materiality';
import { scoreNovelty } from './novelty';
import { assessSampleAdequacy } from './sample-adequacy';
import { scoreSignificance } from './significance';
import type {
  AnalyticalObservation,
  CandidateFinding,
  FindingCategory,
} from './types';

function mapCategory(engine: string, type: string): FindingCategory {
  if (type.includes('concentration') || type.includes('allocation') || type.includes('dependency')) {
    if (engine === 'risk') return 'risk';
    if (engine === 'network') return 'network';
    return 'allocation';
  }
  if (engine === 'performance') return 'performance';
  if (engine === 'flow') return 'flow';
  if (engine === 'trading') return 'behavior';
  if (engine === 'counterparty') return 'counterparty';
  if (engine === 'network') return 'network';
  if (engine === 'risk') return 'risk';
  if (engine === 'portfolio' || engine === 'asset') return 'allocation';
  return 'data_quality';
}

function requiredDomainsFor(engine: string, type: string): string[] {
  if (engine === 'flow' || engine === 'counterparty' || engine === 'trading') {
    return ['transactions'];
  }
  if (engine === 'performance') return ['snapshots', 'holdings'];
  // Allocation drift observation may surface without snapshots; causal layer
  // must not claim supported drift drivers when history is missing.
  if (type.includes('allocation_drift') || type === 'allocation_drift') {
    return ['holdings'];
  }
  if (type.includes('drift') || type.includes('allocation')) return ['holdings', 'snapshots'];
  return ['holdings'];
}

function interactionCountFromFinding(finding: Insight): number {
  const e = finding.evidence ?? {};
  return (
    numberOrNull(e.interaction_count) ??
    numberOrNull(e.interactionCount) ??
    numberOrNull(e.count) ??
    numberOrNull(e.tx_count) ??
    0
  );
}

function isDependencyLike(type: string): boolean {
  return (
    type.includes('dependency') ||
    type.includes('concentrated_inflow') ||
    type.includes('concentrated_outflow') ||
    type.includes('major_capital') ||
    type.includes('single_asset') ||
    type.includes('single_network')
  );
}

export function buildCandidateFindings(input: {
  envelopes: EngineOutput[];
  observations: AnalyticalObservation[];
  scope: AnalysisScope;
  domainStatuses: DomainStatus[];
  evidence: EvidenceItem[];
  portfolioValueUsd: number | null;
  periodDays: number;
  config?: IntelligenceQualityConfig;
}): CandidateFinding[] {
  const config = getIqConfig(input.config);
  const coverageComplete = input.scope.coverage.status === 'complete';
  const candidates: CandidateFinding[] = [];

  for (const envelope of input.envelopes) {
    for (const finding of envelope.findings) {
      const interactions = interactionCountFromFinding(finding);
      const impactUsd = finding.impactUsd ?? numberOrNull(finding.evidence?.amount_usd) ?? null;
      const sharePct =
        numberOrNull(finding.evidence?.inbound_share_pct) ??
        numberOrNull(finding.evidence?.outbound_share_pct) ??
        numberOrNull(finding.evidence?.dominancePct) ??
        numberOrNull(finding.evidence?.allocation_pct) ??
        null;
      const allocationPp = sharePct;

      const sampleKind = isDependencyLike(finding.type)
        ? 'counterparty_dependency'
        : envelope.engine === 'trading'
          ? 'trading_pattern'
          : envelope.engine === 'performance'
            ? 'performance_trend'
            : 'default';

      const sample = assessSampleAdequacy({
        kind: sampleKind,
        observations: Math.max(interactions, 1),
        activeDays: interactions > 0 ? Math.min(input.periodDays, Math.max(1, interactions)) : 0,
        periodDays: input.periodDays,
        coverageComplete,
        config,
      });

      const materiality = scoreMateriality({
        impactUsd,
        portfolioValueUsd: input.portfolioValueUsd,
        allocationImpactPp: allocationPp,
        recurrenceCount: interactions,
        config,
      });

      const significance = scoreSignificance({
        changePct: numberOrNull(finding.evidence?.change_pct) ?? sharePct,
        baselineMeanAbsPct: sharePct != null ? Math.max(5, sharePct * 0.3) : 10,
        historicalOccurrences: interactions <= 1 ? 0 : interactions,
        persistenceDays: interactions >= 3 ? Math.floor(input.periodDays * 0.5) : 0,
        periodDays: input.periodDays,
        baselineAvailable: input.domainStatuses.some(
          d => d.domain === 'snapshots' && (d.status === 'available' || d.status === 'partial'),
        ),
        config,
      });

      const novelty = scoreNovelty({
        previousOccurrences: interactions <= 1 ? 0 : Math.max(0, interactions - 1),
        crossedThresholdThisPeriod: interactions === 1 && (materiality.level === 'high' || materiality.level === 'critical'),
        stillAboveThreshold: interactions >= 3 && (sharePct ?? 0) >= 60,
        previouslyAboveNowBelow: finding.type.includes('decay') || finding.type.includes('resolved'),
      });

      const conf = scoreConfidence({
        data: envelope.dataQuality.completeness * 100,
        pricing: envelope.dataQuality.completeness * 100,
        sample: sample.score * 100,
        historical: significance.score * 100,
        classification: interactions >= 3 ? 80 : 45,
        reasons: [`engine:${envelope.engine}`, `finding:${finding.type}`],
      });

      const relatedObs = input.observations
        .filter(
          o =>
            o.engine === envelope.engine ||
            (finding.relatedEntities?.[0] && o.entity.symbol === finding.relatedEntities[0]),
        )
        .map(o => o.id)
        .slice(0, 6);

      const evidenceIds = input.evidence
        .filter(e => e.calculation.engine === envelope.engine || e.calculation.ruleId === finding.type)
        .map(e => e.evidenceId)
        .slice(0, 8);

      let proposedMeaning = finding.description;
      if (isDependencyLike(finding.type) && interactions <= 1) {
        proposedMeaning =
          materiality.level === 'high' || materiality.level === 'critical'
            ? `One-time material counterparty event involving ${finding.relatedEntities?.[0] ?? 'a counterparty'} (${impactUsd != null ? `~$${Math.round(impactUsd)}` : 'material size'}).`
            : `Single interaction with high share — insufficient to establish a recurring dependency pattern.`;
      }

      candidates.push({
        id: `cand:${finding.id}`,
        type: finding.type,
        category: mapCategory(envelope.engine, finding.type),
        entityIds: finding.relatedEntities ?? [],
        observationIds: relatedObs,
        evidenceIds,
        proposedMeaning,
        trigger: {
          ruleId: `engine.${envelope.engine}.${finding.type}`,
          observedValue: impactUsd ?? sharePct ?? undefined,
          threshold: isDependencyLike(finding.type) ? 40 : undefined,
          operator: 'gte',
          context: {
            interactionCount: interactions,
            engine: envelope.engine,
          },
        },
        sample,
        materiality,
        significance,
        novelty,
        confidence: conf,
        eligibility: {
          eligible: false,
          decision: 'suppressed_not_meaningful',
          reasons: ['pending eligibility'],
        },
        legacyFindingId: finding.id,
        title: finding.title,
        description: finding.description,
        impactUsd,
        requiredDomains: requiredDomainsFor(envelope.engine, finding.type),
      });
    }
  }

  return candidates;
}
