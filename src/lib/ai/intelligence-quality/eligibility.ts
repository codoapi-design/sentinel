import type { DomainStatus } from '@/lib/ai/trust/types';

import type { IntelligenceQualityConfig } from './config';
import { getIqConfig, RULE_IDS } from './config';
import type { CandidateFinding, FindingEligibility } from './types';

function domainOk(domains: DomainStatus[], name: string): boolean {
  const d = domains.find(x => x.domain === name);
  if (!d) return false;
  return d.status === 'available' || d.status === 'partial' || d.status === 'not_required';
}

function interactionCount(c: CandidateFinding): number {
  const ctx = c.trigger.context as Record<string, unknown> | undefined;
  const n = ctx?.interactionCount;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** Counterparty / flow recurrence patterns — not asset-allocation concentration. */
function isDependencyPattern(type: string): boolean {
  if (
    type.includes('high_asset_dependency') ||
    type.includes('single_asset_dependency') ||
    type.includes('network_dependency') ||
    type.includes('single_network_dependency')
  ) {
    return false;
  }
  return (
    type.includes('counterparty') ||
    type.includes('concentrated_inflow') ||
    type.includes('concentrated_outflow') ||
    type === 'major_capital_source' ||
    type === 'major_capital_destination' ||
    type === 'frequent_exchange_interaction' ||
    (type.includes('dependency') && !type.includes('asset') && !type.includes('network'))
  );
}

function isSuspicious(c: CandidateFinding): boolean {
  const name = (c.entityIds[0] ?? '').toLowerCase();
  return name.includes('unknown') || c.type.includes('unknown_high_value');
}

/**
 * Deterministic eligibility. Mutates candidates with eligibility results.
 */
export function applyEligibility(
  candidates: CandidateFinding[],
  domains: DomainStatus[],
  config?: IntelligenceQualityConfig,
): CandidateFinding[] {
  const cfg = getIqConfig(config);

  return candidates.map(c => {
    const reasons: string[] = [];
    const interactions = interactionCount(c);

    // 1) Required domains
    for (const req of c.requiredDomains) {
      if (!domainOk(domains, req)) {
        return withDecision(c, {
          eligible: false,
          decision: 'suppressed_incomplete_scope',
          reasons: [`rule:${RULE_IDS.eligIncompleteScope}`, `Required domain unavailable: ${req}`],
        });
      }
    }

    // 2) Counterparty / concentration single-interaction rule
    if (isDependencyPattern(c.type) && interactions <= cfg.thresholds.singleInteractionDependencyBan) {
      const materialEnough =
        c.materiality.level === 'high' ||
        c.materiality.level === 'critical' ||
        (c.novelty.status === 'new' && c.materiality.level === 'medium' && isSuspicious(c));

      if (!materialEnough && !isSuspicious(c)) {
        return withDecision(c, {
          eligible: false,
          decision: 'suppressed_insufficient_sample',
          reasons: [
            `rule:${RULE_IDS.eligSingleInteraction}`,
            `interactionCount=${interactions}; recurring dependency / concentration pattern suppressed.`,
          ],
        });
      }

      // Material one-time event — rewrite type meaning, approve later via materiality path
      reasons.push(`rule:${RULE_IDS.eligOneTimeMaterial}`, 'Reclassified as one-time material event.');
      c = {
        ...c,
        type: 'one_time_material_event',
        category: 'flow',
        title: `One-time material transfer involving ${c.entityIds[0] ?? 'counterparty'}`,
        proposedMeaning:
          c.proposedMeaning.includes('One-time')
            ? c.proposedMeaning
            : `One-time material event — not a recurring dependency pattern (interactionCount=${interactions}).`,
      };
    }

    // 3) Sample adequacy for pattern-like claims (dependency + trading/behavior)
    const patternLike =
      isDependencyPattern(c.type) ||
      c.category === 'behavior' ||
      c.type.includes('trading') ||
      c.type.includes('turnover') ||
      c.type.includes('rotation') ||
      c.type === 'increasing_trading_activity';
    if (
      c.sample.level === 'insufficient' &&
      patternLike &&
      c.type !== 'one_time_material_event'
    ) {
      return withDecision(c, {
        eligible: false,
        decision: 'suppressed_insufficient_sample',
        reasons: [`rule:${RULE_IDS.eligInsufficientSample}`, ...c.sample.reasons],
      });
    }

    // 4) Materiality / significance gate
    const matOk = c.materiality.score >= cfg.thresholds.eligibilityMinMaterialityScore;
    const sigOk = c.significance.score >= cfg.thresholds.eligibilityMinSignificanceScore;
    if (!matOk && !sigOk) {
      return withDecision(c, {
        eligible: false,
        decision: 'suppressed_low_materiality',
        reasons: [
          `rule:${RULE_IDS.eligLowMateriality}`,
          `materiality=${c.materiality.score.toFixed(2)} significance=${c.significance.score.toFixed(2)}`,
        ],
      });
    }

    // 5) Low confidence
    if (c.confidence.level === 'very_low') {
      return withDecision(c, {
        eligible: false,
        decision: 'suppressed_low_confidence',
        reasons: [`rule:${RULE_IDS.eligLowConfidence}`, ...c.confidence.reasons],
      });
    }

    // 6) Normal behavior with low novelty — only when below eligibility materiality floor
    if (
      c.significance.level === 'normal' &&
      c.materiality.score < cfg.thresholds.eligibilityMinMaterialityScore &&
      (c.materiality.level === 'low' || c.materiality.level === 'immaterial') &&
      c.novelty.status === 'recurring'
    ) {
      return withDecision(c, {
        eligible: false,
        decision: 'suppressed_normal_behavior',
        reasons: [`rule:${RULE_IDS.eligNormalBehavior}`, 'Recurring low-impact normal behavior.'],
      });
    }

    // 7) Pure restatement of visible metric without meaning
    if (
      c.proposedMeaning.length < 24 &&
      c.materiality.level === 'immaterial'
    ) {
      return withDecision(c, {
        eligible: false,
        decision: 'suppressed_not_meaningful',
        reasons: [`rule:${RULE_IDS.eligNotMeaningful}`, 'No meaningful user interpretation.'],
      });
    }

    // 8) Contradictory "no counterparties" when interactions clearly exist
    if (c.type === 'no_counterparties' && interactions >= 2) {
      return withDecision(c, {
        eligible: false,
        decision: 'suppressed_not_meaningful',
        reasons: [
          `rule:${RULE_IDS.eligNotMeaningful}`,
          `no_counterparties contradicts interactionCount=${interactions}; diversified flow is not an alert.`,
        ],
      });
    }

    return withDecision(c, {
      eligible: true,
      decision: 'approved',
      reasons: reasons.length ? reasons : ['Passed deterministic eligibility checks.'],
    });
  });
}

function withDecision(c: CandidateFinding, eligibility: FindingEligibility): CandidateFinding {
  return { ...c, eligibility };
}

/** Mark duplicates after consolidation pass. */
export function markDuplicateSuppressed(
  candidates: CandidateFinding[],
  duplicateIds: Set<string>,
): CandidateFinding[] {
  return candidates.map(c => {
    if (!duplicateIds.has(c.id)) return c;
    if (c.eligibility.decision === 'approved') {
      return {
        ...c,
        eligibility: {
          eligible: false,
          decision: 'suppressed_duplicate',
          reasons: [`rule:${RULE_IDS.eligDuplicate}`, 'Superseded by consolidated insight.'],
        },
      };
    }
    return c;
  });
}

export function markContradicted(
  candidates: CandidateFinding[],
  rejectedIds: Set<string>,
): CandidateFinding[] {
  return candidates.map(c => {
    if (!rejectedIds.has(c.id)) return c;
    return {
      ...c,
      eligibility: {
        eligible: false,
        decision: 'suppressed_contradicted',
        reasons: [`rule:${RULE_IDS.eligContradicted}`, 'Contradicted by stronger evidence.'],
      },
    };
  });
}
