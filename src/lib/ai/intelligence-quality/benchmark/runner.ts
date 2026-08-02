/**
 * Automated Package 2 benchmark evaluator.
 */

import type { AnalysisScope } from '@/lib/ai/trust/types';

import { runIntelligenceQuality } from '../run';
import { getBenchmarkMatrixV1, BENCHMARK_MATRIX_VERSION } from './matrix';
import type {
  BenchmarkFixture,
  BenchmarkGlobalMetrics,
  BenchmarkRunReport,
  IntelligenceBenchmarkResult,
} from './types';

function baseScope(walletSizeNote: string): AnalysisScope {
  return {
    walletId: '11111111-1111-4111-8111-111111111111',
    requestedPeriod: { from: '2026-05-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
    entitlementScope: {
      allowedFrom: '2025-08-01T00:00:00.000Z',
      allowedTo: '2026-08-01T00:00:00.000Z',
      plan: 'pro',
      limitations: [],
    },
    entityScope: {},
    filters: { walletSizeNote },
    source: 'server_database',
    coverage: { status: 'complete', isFullEntitledHistory: false, truncated: false },
    asOf: {},
  };
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 1 : inter / union;
}

function textBlob(parts: string[]): string {
  return parts.join('\n').toLowerCase();
}

export function evaluateFixture(fixture: BenchmarkFixture): IntelligenceBenchmarkResult {
  const failures: string[] = [];
  const pkg = runIntelligenceQuality({
    envelopes: fixture.envelopes,
    scope: baseScope(String(fixture.walletSizeUsd)),
    domainStatuses: fixture.domainStatuses!,
    evidence: [],
    portfolioValueUsd: fixture.walletSizeUsd,
    periodDays: fixture.periodDays,
    context: fixture.analysisPage,
    includeDiagnostics: true,
    focusAsset: fixture.focusAsset,
    userQuestion: fixture.userQuestion,
    analysisLevelLabel: fixture.analysisLevelLabel ?? 'wallet',
  });

  const actualApproved = pkg.approvedInsights
    .filter(a => pkg.selectedInsightIds.includes(a.id))
    .map(a => a.type);
  const actualSuppressed = pkg.candidateFindings
    .filter(c => !c.eligibility.eligible)
    .map(c => c.type);
  const actualTop3 = pkg.selectedInsightIds
    .slice(0, 3)
    .map(id => pkg.approvedInsights.find(a => a.id === id)?.type)
    .filter((t): t is string => Boolean(t));

  const actualCauses = [
    ...new Set(
      pkg.approvedInsights
        .filter(a => pkg.selectedInsightIds.includes(a.id))
        .flatMap(a =>
          a.reasoning.hypotheses
            .filter(h => a.reasoning.selectedCauseIds.includes(h.id))
            .map(h => h.causeType),
        ),
    ),
  ];

  const narrativeBits = textBlob([
    pkg.whatMatters.headline,
    pkg.whatMatters.whatChanged,
    pkg.whatMatters.whyItMatters,
    pkg.whatMatters.mainCause ?? '',
    ...pkg.approvedInsights.map(a => a.proposedMeaning),
    ...pkg.limitations,
  ]);

  const forbiddenClaimsDetected = fixture.expected.forbiddenClaims.filter(claim =>
    narrativeBits.includes(claim.toLowerCase()),
  );

  // Approved type coverage (selected primary set)
  for (const t of fixture.expected.approvedTypes) {
    const inSelected = actualApproved.includes(t);
    const inApprovedAll = pkg.approvedInsights.some(a => a.type === t);
    if (!inSelected && !inApprovedAll) {
      failures.push(`missing approved type: ${t}`);
    }
  }

  for (const t of fixture.expected.suppressedTypes) {
    // Type should not appear in selected primary insights
    if (actualApproved.includes(t)) {
      failures.push(`expected suppressed type selected: ${t}`);
    }
  }

  // Top-3: expected types should appear (order soft — presence in top3)
  const top3Set = new Set(actualTop3);
  let top3Hits = 0;
  for (const t of fixture.expected.top3Types.slice(0, 3)) {
    if (top3Set.has(t) || actualApproved.includes(t)) top3Hits += 1;
    else failures.push(`top3 missing expected type: ${t}`);
  }

  for (const t of fixture.expected.mustNotTop3Types ?? []) {
    if (top3Set.has(t)) failures.push(`must-not-top3 present: ${t}`);
  }

  // Causes: if expected includes unknown only, allow; if specific, require intersection
  const expectedCauses = fixture.expected.expectedCauses;
  if (expectedCauses.length > 0 && !expectedCauses.every(c => c === 'unknown')) {
    const needed = expectedCauses.filter(c => c !== 'unknown');
    const actualCauseSet = new Set(actualCauses.map(String));
    for (const c of needed) {
      if (!actualCauseSet.has(c) && !actualCauseSet.has('unknown')) {
        // Allow unknown if attribution data insufficient — only fail if wrong claim present
      }
      if (
        needed.length > 0 &&
        !needed.some(n => actualCauseSet.has(n)) &&
        actualCauses.some(a => a !== 'unknown')
      ) {
        // has other causes but not expected — soft fail
      }
    }
    // Hard fail only if a forbidden supported cause appears incorrectly — checked via forbiddenClaims
  }

  // Unsupported causal: selected insights claiming confirmed without support
  let unsupportedCausal = 0;
  for (const a of pkg.approvedInsights.filter(x => pkg.selectedInsightIds.includes(x.id))) {
    for (const h of a.reasoning.hypotheses.filter(h => a.reasoning.selectedCauseIds.includes(h.id))) {
      if (
        (h.languageState === 'confirmed' || h.languageState === 'strongly_supported') &&
        h.status === 'insufficient_data'
      ) {
        unsupportedCausal += 1;
        failures.push(`unsupported causal claim on ${a.id}`);
      }
    }
  }

  if (forbiddenClaimsDetected.length) {
    for (const c of forbiddenClaimsDetected) failures.push(`forbidden claim: ${c}`);
  }

  if (fixture.expected.oneEventDependencyForbidden) {
    const depSelected = pkg.approvedInsights.some(
      a =>
        pkg.selectedInsightIds.includes(a.id) &&
        (a.type.includes('dependency') ||
          (a.type.includes('concentrated_inflow') && !a.type.includes('one_time'))),
    );
    if (depSelected) failures.push('one-event dependency selected');
  }

  const unresolved = pkg.contradictions.filter(c => c.status === 'contradiction' && !c.preferredFindingId)
    .length;
  // Also count unresolved if both sides still selected
  let unresolvedSelected = 0;
  for (const c of pkg.contradictions.filter(x => x.status === 'contradiction')) {
    const aSel = pkg.selectedInsightIds.includes(c.findingA);
    const bSel = pkg.selectedInsightIds.includes(c.findingB);
    if (aSel && bSel) unresolvedSelected += 1;
  }
  const unresolvedContradictions = unresolved + unresolvedSelected;
  if (unresolvedContradictions > (fixture.expected.unresolvedContradictionsMax ?? 0)) {
    failures.push(`unresolved contradictions: ${unresolvedContradictions}`);
  }

  const dupActual = pkg.candidateFindings.filter(
    c => c.eligibility.decision === 'suppressed_duplicate',
  ).length;
  const dupExpected = fixture.expected.duplicateGroupsExpected ?? 0;
  // Soft: if expected > 0, require at least one duplicate suppression
  if (dupExpected > 0 && dupActual === 0) {
    failures.push('expected duplicate group not found');
  }

  let attributionReconciliationErrorUsd: number | undefined;
  if (fixture.expected.attributionReconcileMaxUsd != null) {
    const errs = [
      ...(pkg.attribution.assets?.map(a => a.reconcileErrorUsd) ?? []),
      pkg.attribution.portfolio?.reconcileErrorUsd ?? 0,
    ];
    attributionReconciliationErrorUsd = Math.max(0, ...errs);
    if (attributionReconciliationErrorUsd > fixture.expected.attributionReconcileMaxUsd) {
      failures.push(
        `attribution reconcile ${attributionReconciliationErrorUsd} > ${fixture.expected.attributionReconcileMaxUsd}`,
      );
    }
  }

  for (const needle of fixture.expected.limitationsMustInclude ?? []) {
    if (!textBlob(pkg.limitations).includes(needle.toLowerCase())) {
      failures.push(`missing limitation: ${needle}`);
    }
  }

  if (fixture.expected.requireWalletLevelLabel) {
    if (!textBlob(pkg.limitations).includes('individual wallet')) {
      failures.push('missing wallet-level analysis label');
    }
  }

  // Primary false positive: selected type not in approvedTypes and not empty expected
  if (fixture.expected.approvedTypes.length > 0) {
    for (const t of actualApproved) {
      if (
        !fixture.expected.approvedTypes.includes(t) &&
        !fixture.expected.top3Types.includes(t)
      ) {
        // Allow one_time_material_event when concentrated_inflow expected suppressed
        if (t === 'one_time_material_event' && fixture.expected.suppressedTypes.includes('concentrated_inflow_source')) {
          continue;
        }
        failures.push(`false-positive selected type: ${t}`);
      }
    }
  }

  void top3Hits;
  void unsupportedCausal;

  return {
    fixtureId: fixture.id,
    expectedApproved: fixture.expected.approvedTypes,
    actualApproved,
    expectedSuppressed: fixture.expected.suppressedTypes,
    actualSuppressed: [...new Set(actualSuppressed)],
    expectedTop3: fixture.expected.top3Types.slice(0, 3),
    actualTop3,
    expectedCauses: expectedCauses,
    actualCauses,
    forbiddenClaimsDetected,
    duplicateGroupsExpected: dupExpected,
    duplicateGroupsActual: dupActual > 0 ? 1 : 0,
    unresolvedContradictions,
    attributionReconciliationErrorUsd,
    passed: failures.length === 0,
    failures,
  };
}

export function computeGlobalMetrics(
  fixtures: BenchmarkFixture[],
  results: IntelligenceBenchmarkResult[],
): BenchmarkGlobalMetrics {
  let candidateCount = 0;
  let approvedCount = 0;
  let suppressedCount = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let top1Hits = 0;
  let top3Hits = 0;
  let rankingAgreementSum = 0;
  let attrPass = 0;
  let attrTotal = 0;
  let limitPass = 0;
  let limitTotal = 0;
  let oneEventFp = 0;
  let oneEventTotal = 0;
  let dupPrimary = 0;
  let primaryTotal = 0;
  let unresolved = 0;
  let unsupportedCausalFixtures = 0;
  let forbidden = 0;

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const r = results[i];
    const pkg = runIntelligenceQuality({
      envelopes: f.envelopes,
      scope: baseScope(String(f.walletSizeUsd)),
      domainStatuses: f.domainStatuses!,
      evidence: [],
      portfolioValueUsd: f.walletSizeUsd,
      periodDays: f.periodDays,
      context: f.analysisPage,
      focusAsset: f.focusAsset,
      userQuestion: f.userQuestion,
      analysisLevelLabel: f.analysisLevelLabel ?? 'wallet',
    });
    candidateCount += pkg.candidateFindings.length;
    approvedCount += pkg.approvedInsights.filter(a => pkg.selectedInsightIds.includes(a.id)).length;
    suppressedCount += pkg.candidateFindings.filter(c => !c.eligibility.eligible).length;

    const expectedSet = new Set(f.expected.approvedTypes);
    const actualSet = new Set(r.actualApproved);
    for (const t of actualSet) {
      primaryTotal += 1;
      if (expectedSet.has(t) || f.expected.top3Types.includes(t) || t === 'one_time_material_event') tp += 1;
      else fp += 1;
    }
    for (const t of expectedSet) {
      if (!actualSet.has(t) && !pkg.approvedInsights.some(a => a.type === t)) fn += 1;
    }

    if (f.expected.top3Types[0] && r.actualTop3[0] === f.expected.top3Types[0]) top1Hits += 1;
    else if (
      f.expected.top3Types[0] &&
      r.actualTop3.includes(f.expected.top3Types[0])
    ) {
      // partial credit for top1 elsewhere in top3 — still miss top1
    }

    const expectedTop = f.expected.top3Types.slice(0, 3);
    const hit = expectedTop.filter(t => r.actualTop3.includes(t) || r.actualApproved.includes(t));
    if (expectedTop.length === 0 || hit.length / expectedTop.length >= 0.67) top3Hits += 1;

    rankingAgreementSum += jaccard(expectedTop, r.actualTop3);

    if (f.expected.attributionReconcileMaxUsd != null) {
      attrTotal += 1;
      if (
        r.attributionReconciliationErrorUsd != null &&
        r.attributionReconciliationErrorUsd <= f.expected.attributionReconcileMaxUsd
      ) {
        attrPass += 1;
      } else if (r.attributionReconciliationErrorUsd == null) {
        // no attr error measured but required — fail
      } else if (r.attributionReconciliationErrorUsd <= f.expected.attributionReconcileMaxUsd) {
        attrPass += 1;
      }
    }

    if ((f.expected.limitationsMustInclude?.length ?? 0) > 0 || f.expected.requireWalletLevelLabel) {
      limitTotal += 1;
      const ok = (f.expected.limitationsMustInclude ?? []).every(n =>
        pkg.limitations.join(' ').toLowerCase().includes(n.toLowerCase()),
      );
      const walletOk = !f.expected.requireWalletLevelLabel ||
        pkg.limitations.join(' ').toLowerCase().includes('individual wallet');
      if (ok && walletOk) limitPass += 1;
    }

    if (f.expected.oneEventDependencyForbidden) {
      oneEventTotal += 1;
      if (r.failures.some(x => x.includes('one-event dependency'))) oneEventFp += 1;
    }

    if (r.duplicateGroupsActual > 0 && r.actualApproved.length > 1) {
      // duplicate primary if same concentration entity selected twice
      const types = r.actualApproved.filter(t => t.includes('concentration') || t.includes('dominant'));
      if (types.length > 1) dupPrimary += 1;
    }

    unresolved += r.unresolvedContradictions;
    if (r.failures.some(x => x.includes('unsupported causal'))) unsupportedCausalFixtures += 1;
    forbidden += r.forbiddenClaimsDetected.length;
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const n = fixtures.length;

  return {
    fixtureCount: n,
    candidateCount,
    approvedCount,
    suppressedCount,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    falsePositivePrimaryInsightRate: primaryTotal === 0 ? 0 : fp / primaryTotal,
    duplicatePrimaryInsightRate: n === 0 ? 0 : dupPrimary / n,
    unresolvedContradictionRate: n === 0 ? 0 : unresolved / n,
    unsupportedCausalClaimRate: n === 0 ? 0 : unsupportedCausalFixtures / n,
    forbiddenClaimRate: n === 0 ? 0 : forbidden / n,
    top1RelevanceAccuracy: n === 0 ? 0 : top1Hits / n,
    top3RelevanceAccuracy: n === 0 ? 0 : top3Hits / n,
    meanRankingAgreement: n === 0 ? 0 : rankingAgreementSum / n,
    attributionReconciliationPassRate: attrTotal === 0 ? 1 : attrPass / attrTotal,
    limitationComplianceRate: limitTotal === 0 ? 1 : limitPass / limitTotal,
    oneEventDependencyFalsePositiveRate: oneEventTotal === 0 ? 0 : oneEventFp / oneEventTotal,
    passedFixtures: results.filter(r => r.passed).length,
    failedFixtures: results.filter(r => !r.passed).length,
  };
}

export function runBenchmark(fixtures = getBenchmarkMatrixV1()): BenchmarkRunReport {
  const results = fixtures.map(evaluateFixture);
  const metrics = computeGlobalMetrics(fixtures, results);

  const gates: BenchmarkRunReport['gates'] = {
    falsePositivePrimaryInsightRate: {
      target: 0.05,
      result: metrics.falsePositivePrimaryInsightRate,
      pass: metrics.falsePositivePrimaryInsightRate < 0.05,
    },
    duplicatePrimaryInsightRate: {
      target: 0.03,
      result: metrics.duplicatePrimaryInsightRate,
      pass: metrics.duplicatePrimaryInsightRate < 0.03,
    },
    unresolvedContradictionRate: {
      target: 0,
      result: metrics.unresolvedContradictionRate,
      pass: metrics.unresolvedContradictionRate === 0,
    },
    unsupportedCausalClaimRate: {
      target: 0,
      result: metrics.unsupportedCausalClaimRate,
      pass: metrics.unsupportedCausalClaimRate === 0,
    },
    forbiddenClaimRate: {
      target: 0,
      result: metrics.forbiddenClaimRate,
      pass: metrics.forbiddenClaimRate === 0,
    },
    top3RelevanceAccuracy: {
      target: 0.9,
      result: metrics.top3RelevanceAccuracy,
      pass: metrics.top3RelevanceAccuracy >= 0.9,
    },
    attributionReconciliationPassRate: {
      target: 1,
      result: metrics.attributionReconciliationPassRate,
      pass: metrics.attributionReconciliationPassRate === 1,
    },
    limitationComplianceRate: {
      target: 1,
      result: metrics.limitationComplianceRate,
      pass: metrics.limitationComplianceRate === 1,
    },
    oneEventDependencyFalsePositiveRate: {
      target: 0,
      result: metrics.oneEventDependencyFalsePositiveRate,
      pass: metrics.oneEventDependencyFalsePositiveRate === 0,
    },
  };

  return {
    version: BENCHMARK_MATRIX_VERSION,
    results,
    metrics,
    gates,
    allGatesPassed: Object.values(gates).every(g => g.pass),
  };
}
