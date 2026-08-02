import type {
  ApprovedInsight,
  PublicReasonedIntelligence,
  ReasonedIntelligencePackage,
  ReasoningDiagnostics,
} from './types';

/** Trim package for LLM — selected insights only, no raw candidate dump. */
export function serializeForLlm(pkg: ReasonedIntelligencePackage): {
  selectedInsights: Array<{
    id: string;
    title: string;
    meaning: string;
    priority: number;
    cause: string;
    limitations: string[];
  }>;
  whatMatters: ReasonedIntelligencePackage['whatMatters'];
  monitoringPoints: ReasonedIntelligencePackage['monitoringPoints'];
  attributionSummary: string;
  limitations: string[];
  allowedFindingIds: string[];
} {
  const selected = pkg.selectedInsightIds
    .map(id => pkg.approvedInsights.find(a => a.id === id))
    .filter((x): x is ApprovedInsight => Boolean(x));

  const attributionSummary = pkg.attribution.portfolio
    ? `Portfolio change ${pkg.attribution.portfolio.totalChangeUsd.toFixed(2)} USD; explained ${pkg.attribution.portfolio.explainedChangeUsd.toFixed(2)}; unexplained ${pkg.attribution.portfolio.unexplainedChangeUsd.toFixed(2)}.`
    : 'No portfolio attribution available.';

  return {
    selectedInsights: selected.map(s => ({
      id: s.legacyFindingId ?? s.id,
      title: s.title,
      meaning: s.proposedMeaning,
      priority: s.priority.score,
      cause: s.reasoning.summary,
      limitations: s.limitations,
    })),
    whatMatters: pkg.whatMatters,
    monitoringPoints: pkg.monitoringPoints,
    attributionSummary,
    limitations: pkg.limitations,
    allowedFindingIds: selected.map(s => s.legacyFindingId ?? s.id),
  };
}

export function toPublicReasonedIntelligence(
  pkg: ReasonedIntelligencePackage,
  opts?: { includeDiagnostics?: boolean },
): PublicReasonedIntelligence {
  const selectedSet = new Set(pkg.selectedInsightIds);
  const approved = pkg.approvedInsights.filter(a => selectedSet.has(a.id) || pkg.rankedInsightIds.includes(a.id));

  return {
    schemaVersion: pkg.schemaVersion,
    approvedInsights: approved.slice(0, 12).map(a => ({
      id: a.id,
      type: a.type,
      category: a.category,
      title: a.title,
      description: a.description,
      proposedMeaning: a.proposedMeaning,
      priority: a.priority,
      materiality: a.materiality,
      significance: a.significance,
      novelty: a.novelty,
      eligibility: a.eligibility,
      reasoning: a.reasoning,
      userMeaning: a.userMeaning,
      monitoringPointIds: a.monitoringPointIds,
      limitations: a.limitations,
      reasoningConfidence: a.reasoningConfidence,
      legacyFindingId: a.legacyFindingId,
    })),
    rankedInsightIds: pkg.rankedInsightIds,
    selectedInsightIds: pkg.selectedInsightIds,
    whatMatters: pkg.whatMatters,
    monitoringPoints: pkg.monitoringPoints,
    contradictions: pkg.contradictions,
    attribution: pkg.attribution,
    completionStatus: pkg.completionStatus,
    limitations: pkg.limitations,
    versions: pkg.versions,
    ...(opts?.includeDiagnostics && pkg.diagnostics ? { diagnostics: pkg.diagnostics } : {}),
  };
}

export function buildDiagnostics(pkg: ReasonedIntelligencePackage): ReasoningDiagnostics {
  const suppressionReasons: Record<string, number> = {};
  for (const c of pkg.candidateFindings) {
    if (!c.eligibility.eligible) {
      const key = c.eligibility.decision;
      suppressionReasons[key] = (suppressionReasons[key] ?? 0) + 1;
    }
  }
  return {
    candidateCount: pkg.candidateFindings.length,
    approvedCount: pkg.approvedInsights.length,
    suppressedCount: pkg.candidateFindings.filter(c => !c.eligibility.eligible).length,
    suppressionReasons,
  };
}
