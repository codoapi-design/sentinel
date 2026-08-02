/**
 * Package 2 narrative constraint enforcement — rejects hostile / incorrect LLM structure.
 */

import type { StructuredNarrative } from '@/lib/ai/trust/types';

import type { ApprovedInsight, WhatMattersSummary } from './types';

export interface NarrativeConstraintContext {
  allowedFindingIds: Set<string>;
  /** Ordered by selection priority (primary first). */
  selectedInsights: Array<Pick<ApprovedInsight, 'id' | 'type' | 'priority' | 'reasoning' | 'legacyFindingId'>>;
  requiredLimitations: string[];
  whatMatters?: WhatMattersSummary | null;
  /** Causal language states that are forbidden in narrative prose. */
  forbiddenCausalPhrases?: string[];
}

export interface NarrativeConstraintResult {
  ok: boolean;
  violations: string[];
}

const UNSUPPORTED_CAUSAL =
  /\b(confirmed|definitely|certainly|proven)\b.{0,40}\b(because|caused by|due to)\b|\b(confirmed price-driven|confirmed quantity-driven|strongly supported)\b/i;

/**
 * Validate structured narrative against Package 2 selection / limitation rules.
 * Does not invent content — only rejects unsafe model output.
 */
export function enforceNarrativeConstraints(
  narrative: StructuredNarrative,
  ctx: NarrativeConstraintContext,
): NarrativeConstraintResult {
  const violations: string[] = [];

  for (const id of narrative.selectedFindingIds) {
    if (!ctx.allowedFindingIds.has(id)) {
      violations.push(`unapproved_finding_id:${id}`);
    }
  }

  const primary = ctx.selectedInsights[0];
  if (primary && narrative.selectedFindingIds.length > 0) {
    const primaryId = primary.legacyFindingId ?? primary.id;
    const first = narrative.selectedFindingIds[0];
    if (first !== primaryId && first !== primary.id) {
      // Model reordered — reject promotion of a lower-ranked id above primary
      const primaryRank = 0;
      const firstInsight = ctx.selectedInsights.find(
        s => s.id === first || s.legacyFindingId === first,
      );
      if (firstInsight) {
        const firstIdx = ctx.selectedInsights.indexOf(firstInsight);
        if (firstIdx > primaryRank) {
          violations.push(`promoted_above_primary:${first}`);
        }
      }
    }
  }

  const prose = [
    narrative.headline,
    narrative.directAnswer ?? '',
    narrative.summary,
    narrative.interpretation,
    narrative.whatMatters?.mainCause ?? '',
    ...narrative.monitoringPoints,
  ].join('\n');

  // Reject confirmed causal wording when selected causes are cannot_determine / insufficient
  const hasUnsupportedCauseSelected = ctx.selectedInsights.some(s =>
    s.reasoning.hypotheses.some(
      h =>
        s.reasoning.selectedCauseIds.includes(h.id) &&
        (h.languageState === 'cannot_determine' || h.status === 'insufficient_data'),
    ),
  );
  if (hasUnsupportedCauseSelected && UNSUPPORTED_CAUSAL.test(prose)) {
    violations.push('unsupported_causal_wording');
  }
  for (const phrase of ctx.forbiddenCausalPhrases ?? []) {
    if (prose.toLowerCase().includes(phrase.toLowerCase())) {
      violations.push(`forbidden_causal:${phrase}`);
    }
  }

  // Material limitations must not be dropped
  const limBlob = narrative.limitations.join('\n').toLowerCase();
  for (const req of ctx.requiredLimitations) {
    if (!limBlob.includes(req.toLowerCase())) {
      violations.push(`removed_limitation:${req}`);
    }
  }

  // Suppressed / non-allowed IDs must never appear as selected
  // (already covered by allowedFindingIds — explicit message for diagnostics)
  if (narrative.selectedFindingIds.some(id => !ctx.allowedFindingIds.has(id))) {
    violations.push('suppressed_or_unapproved_id_in_narrative');
  }

  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}
