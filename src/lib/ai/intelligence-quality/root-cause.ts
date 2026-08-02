import { MODEL_VERSIONS } from './config';
import { scoreConfidence } from './confidence-util';
import type {
  ApprovedInsight,
  AssetValueAttribution,
  CandidateFinding,
  CausalHypothesis,
  ContributionAttribution,
  ReasoningResult,
} from './types';

function languageFor(status: CausalHypothesis['status'], score: number): CausalHypothesis['languageState'] {
  if (status === 'insufficient_data' || status === 'rejected') return 'cannot_determine';
  if (status === 'supported' && score >= 80) return 'confirmed';
  if (status === 'supported' && score >= 65) return 'strongly_supported';
  if (status === 'partially_supported' && score >= 55) return 'likely';
  if (status === 'partially_supported') return 'possible';
  return 'cannot_determine';
}

export function buildReasoningForCandidate(input: {
  candidate: CandidateFinding;
  portfolio?: ContributionAttribution;
  assetAttributions?: AssetValueAttribution[];
}): ReasoningResult {
  const hypotheses: CausalHypothesis[] = [];
  const entity = input.candidate.entityIds[0];
  const assetAttr = input.assetAttributions?.find(a => a.assetId === entity);

  if (assetAttr && assetAttr.priceEffectUsd != null && assetAttr.quantityEffectUsd != null) {
    const priceDom =
      Math.abs(assetAttr.priceEffectUsd) >= Math.abs(assetAttr.quantityEffectUsd) * 1.25;
    const qtyDom =
      Math.abs(assetAttr.quantityEffectUsd) >= Math.abs(assetAttr.priceEffectUsd) * 1.25;

    if (priceDom) {
      const conf = scoreConfidence({ pricing: assetAttr.pricingCoverage * 100, historical: 75 });
      hypotheses.push({
        id: `cause:price:${input.candidate.id}`,
        causeType: 'price_effect',
        affectedEntityIds: entity ? [entity] : [],
        estimatedContributionUsd: assetAttr.priceEffectUsd,
        supportingEvidenceIds: input.candidate.evidenceIds,
        contradictingEvidenceIds: [],
        confidence: conf,
        status: assetAttr.pricingCoverage >= 0.8 ? 'supported' : 'partially_supported',
        languageState: languageFor(
          assetAttr.pricingCoverage >= 0.8 ? 'supported' : 'partially_supported',
          conf.score,
        ),
      });
    }
    if (qtyDom) {
      const conf = scoreConfidence({ sample: 70, classification: 70 });
      hypotheses.push({
        id: `cause:qty:${input.candidate.id}`,
        causeType: 'quantity_effect',
        affectedEntityIds: entity ? [entity] : [],
        estimatedContributionUsd: assetAttr.quantityEffectUsd,
        supportingEvidenceIds: input.candidate.evidenceIds,
        contradictingEvidenceIds: [],
        confidence: conf,
        status: 'supported',
        languageState: languageFor('supported', conf.score),
      });
    }
  }

  if (input.portfolio) {
    const inflow = input.portfolio.contributors.find(c => c.entityId === 'external_inflow');
    const outflow = input.portfolio.contributors.find(c => c.entityId === 'external_outflow');
    if (
      inflow &&
      Math.abs(inflow.contributionUsd) > Math.abs(input.portfolio.totalChangeUsd) * 0.5 &&
      input.candidate.category === 'performance'
    ) {
      const conf = inflow.confidence;
      hypotheses.push({
        id: `cause:inflow:${input.candidate.id}`,
        causeType: 'external_inflow',
        affectedEntityIds: ['portfolio'],
        estimatedContributionUsd: inflow.contributionUsd,
        supportingEvidenceIds: inflow.evidenceIds,
        contradictingEvidenceIds: [],
        confidence: conf,
        status: 'supported',
        languageState: languageFor('supported', conf.score),
      });
    }
    if (outflow && input.candidate.category === 'flow') {
      hypotheses.push({
        id: `cause:outflow:${input.candidate.id}`,
        causeType: 'external_outflow',
        affectedEntityIds: entity ? [entity] : ['portfolio'],
        estimatedContributionUsd: outflow.contributionUsd,
        supportingEvidenceIds: outflow.evidenceIds,
        contradictingEvidenceIds: [],
        confidence: outflow.confidence,
        status: 'partially_supported',
        languageState: 'likely',
      });
    }
  }

  if (hypotheses.length === 0) {
    const conf = scoreConfidence({ sample: 30, historical: 25, reasons: ['No quantified causal support'] });
    hypotheses.push({
      id: `cause:unknown:${input.candidate.id}`,
      causeType: 'unknown',
      affectedEntityIds: entity ? [entity] : [],
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
      confidence: conf,
      status: 'insufficient_data',
      languageState: 'cannot_determine',
    });
  }

  const selected = hypotheses.filter(h => h.status === 'supported' || h.status === 'partially_supported');
  const selectedCauseIds = selected.length
    ? selected.slice(0, 2).map(h => h.id)
    : hypotheses.slice(0, 1).map(h => h.id);

  const primary = hypotheses.find(h => selectedCauseIds.includes(h.id)) ?? hypotheses[0];
  const summary =
    primary.languageState === 'cannot_determine'
      ? 'Cannot determine from available data.'
      : `${primary.languageState.replace(/_/g, ' ')}: ${primary.causeType.replace(/_/g, ' ')}.`;

  return {
    hypotheses,
    selectedCauseIds,
    summary,
    confidence: primary.confidence,
  };
}

export function attachReasoning(
  eligible: CandidateFinding[],
  portfolio?: ContributionAttribution,
  assetAttributions?: AssetValueAttribution[],
): Array<CandidateFinding & { reasoning: ReasoningResult }> {
  return eligible.map(c => ({
    ...c,
    reasoning: buildReasoningForCandidate({ candidate: c, portfolio, assetAttributions }),
  }));
}

export function toApprovedInsight(
  c: CandidateFinding & { reasoning: ReasoningResult },
  extras: {
    relationships: ApprovedInsight['relationships'];
    priority: ApprovedInsight['priority'];
    monitoringPointIds: string[];
  },
): ApprovedInsight {
  return {
    ...c,
    status: 'approved',
    reasoning: c.reasoning,
    relationships: extras.relationships,
    priority: extras.priority,
    userMeaning: {
      general: c.proposedMeaning,
      investor: c.category === 'performance' || c.category === 'allocation' ? c.proposedMeaning : undefined,
      trader: c.category === 'behavior' || c.category === 'flow' ? c.proposedMeaning : undefined,
    },
    monitoringPointIds: extras.monitoringPointIds,
    limitations: [
      ...c.sample.reasons.filter(r => r.includes('required') || r.includes('incomplete')),
      `model:${MODEL_VERSIONS.rootCauseModel}`,
    ],
    reasoningConfidence: {
      observationConfidence: c.confidence,
      causalConfidence: c.reasoning.confidence,
      interpretationConfidence: scoreConfidence({
        sample: c.sample.score * 100,
        classification: c.confidence.components.classificationReliability,
        historical: c.significance.score * 100,
      }),
    },
    versions: { ...MODEL_VERSIONS },
  };
}
