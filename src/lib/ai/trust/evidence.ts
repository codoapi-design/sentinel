/**
 * Normalize legacy engine findings into the universal evidence / finding contracts.
 */

import type { Confidence, Insight } from '@/lib/ai/intelligence';

import { buildConfidenceScore, toLegacyConfidence } from './confidence';
import type {
  AnalysisScope,
  EvidenceItem,
  EvidenceReference,
  NormalizedFinding,
} from './types';
import { ENGINE_VERSIONS } from './types';

function legacyConfidenceToScore(level: Confidence): number {
  if (level === 'high') return 85;
  if (level === 'medium') return 60;
  return 35;
}

export function normalizeEvidenceFromFinding(
  finding: Insight,
  engine: string,
  scope: AnalysisScope,
  index: number,
): { evidence: EvidenceItem[]; finding: NormalizedFinding } {
  const engineVersion = ENGINE_VERSIONS[engine] ?? '2.0.0';
  const evidenceItems: EvidenceItem[] = [];
  const evidenceIds: string[] = [];

  const nativeRefs = (finding as Insight & { sourceRefs?: EvidenceReference[] }).sourceRefs ?? [];
  const defaultRefs: EvidenceReference[] =
    nativeRefs.length > 0
      ? nativeRefs
      : [{ type: 'calculation', table: engine }];

  const entries = Object.entries(finding.evidence ?? {});
  if (entries.length === 0) {
    const evidenceId = `ev-${finding.id || engine}-${index}-summary`;
    evidenceIds.push(evidenceId);
    evidenceItems.push({
      evidenceId,
      type: 'calculation',
      metric: 'finding_summary',
      value: finding.description,
      sourceRefs: defaultRefs,
      calculation: {
        engine,
        engineVersion: (finding as Insight & { engineVersion?: string }).engineVersion ?? engineVersion,
        ruleId: finding.type,
      },
      scope,
    });
  } else {
    entries.forEach(([key, value], i) => {
      const evidenceId = `ev-${finding.id || engine}-${index}-${i}`;
      evidenceIds.push(evidenceId);
      evidenceItems.push({
        evidenceId,
        type: typeof value === 'number' ? 'metric' : 'note',
        metric: key,
        value: value as string | number | boolean | null,
        unit: typeof value === 'number' && /usd|value|inflow|outflow|impact/i.test(key) ? 'USD' : undefined,
        sourceRefs: defaultRefs,
        calculation: {
          engine,
          engineVersion: (finding as Insight & { engineVersion?: string }).engineVersion ?? engineVersion,
          ruleId: finding.type,
          formulaId: key,
        },
        scope,
      });
    });
  }

  const score = legacyConfidenceToScore(finding.confidence);
  const confidence = buildConfidenceScore({
    dataCompleteness: score,
    pricingCoverage: score,
    historicalCoverage: scope.coverage.isFullEntitledHistory ? 80 : 45,
    classificationReliability: score,
    sampleAdequacy: scope.coverage.truncated ? 40 : 75,
    reasons: scope.coverage.truncated
      ? ['Coverage truncated; finding confidence reduced.']
      : [],
  });

  const normalized: NormalizedFinding = {
    id: finding.id || `${engine}:${finding.type}:${index}`,
    type: finding.type,
    engine,
    engineVersion,
    severity: finding.severity,
    materiality: {
      score: Math.min(100, Math.abs(finding.impactUsd ?? 0) > 0 ? 70 : 40),
      impactUsd: finding.impactUsd ?? null,
      portfolioImpactPct: null,
    },
    confidence,
    trigger: {
      ruleId: finding.type.toUpperCase(),
    },
    evidenceIds,
    relatedEntityIds: finding.relatedEntities ?? [],
    limitations: [
      ...(scope.coverage.truncated
        ? ['Based on partial transaction coverage; not full entitled history.']
        : []),
      ...(scope.coverage.isFullEntitledHistory ? [] : ['Complete entitled history was not verified for this finding.']),
    ],
    generatedAt: new Date().toISOString(),
    scope,
    title: finding.title,
    description: finding.description,
  };

  return { evidence: evidenceItems, finding: normalized };
}

export function normalizeAllFindings(
  findings: Array<Insight & { engine?: string }>,
  scope: AnalysisScope,
): { evidence: EvidenceItem[]; findings: NormalizedFinding[] } {
  const evidence: EvidenceItem[] = [];
  const normalized: NormalizedFinding[] = [];

  findings.forEach((f, i) => {
    const result = normalizeEvidenceFromFinding(f, f.engine ?? 'unknown', scope, i);
    evidence.push(...result.evidence);
    normalized.push(result.finding);
  });

  return { evidence, findings: normalized };
}

/** Map detailed finding confidence back to legacy high|medium|low for UI. */
export function legacyInsightConfidence(finding: NormalizedFinding): Confidence {
  return toLegacyConfidence(finding.confidence.level);
}
