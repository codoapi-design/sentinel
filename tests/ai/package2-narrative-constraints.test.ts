import { describe, expect, it } from 'vitest';

import {
  enforceNarrativeConstraints,
  getBenchmarkMatrixV1,
  runIntelligenceQuality,
  serializeForLlm,
} from '@/lib/ai/intelligence-quality';
import { parseStructuredNarrative } from '@/lib/ai/trust/structured-narrative';
import type { AnalysisScope } from '@/lib/ai/trust/types';
import { STRUCTURED_NARRATIVE_SCHEMA_VERSION } from '@/lib/ai/trust/types';
import { validateNarrativeAgainstIntelligence } from '@/lib/ai/trust/numeric-validator';

const scope: AnalysisScope = {
  walletId: '11111111-1111-4111-8111-111111111111',
  requestedPeriod: { from: '2026-05-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
  entitlementScope: {
    allowedFrom: '2025-08-01T00:00:00.000Z',
    allowedTo: '2026-08-01T00:00:00.000Z',
    plan: 'pro',
    limitations: [],
  },
  entityScope: {},
  filters: {},
  source: 'server_database',
  coverage: { status: 'complete', isFullEntitledHistory: false, truncated: false },
  asOf: {},
};

function solPkg() {
  const f = getBenchmarkMatrixV1().find(x => x.id === 'sol-historical-closure')!;
  return runIntelligenceQuality({
    envelopes: f.envelopes,
    scope,
    domainStatuses: f.domainStatuses!,
    evidence: [],
    portfolioValueUsd: f.walletSizeUsd,
    periodDays: f.periodDays,
    context: f.analysisPage,
    focusAsset: f.focusAsset,
    analysisLevelLabel: 'wallet',
  });
}

describe('Package 2 narrative constraints (hostile LLM)', () => {
  it('serializeForLlm never includes suppressed findings as approved facts', () => {
    const pkg = solPkg();
    const llm = serializeForLlm(pkg);
    const suppressedIds = new Set(
      pkg.candidateFindings.filter(c => !c.eligibility.eligible).map(c => c.id),
    );
    for (const s of llm.selectedInsights) {
      expect(suppressedIds.has(s.id)).toBe(false);
    }
    expect(llm.allowedFindingIds.every(id => !suppressedIds.has(id))).toBe(true);
  });

  it('rejects unapproved finding IDs', () => {
    const pkg = solPkg();
    const llm = serializeForLlm(pkg);
    const hostile = {
      schemaVersion: STRUCTURED_NARRATIVE_SCHEMA_VERSION,
      headline: 'Hostile',
      summary: 'Uses a suppressed id',
      selectedFindingIds: ['totally-fake-suppressed-id', ...llm.allowedFindingIds.slice(0, 1)],
      interpretation: 'x',
      monitoringPoints: [],
      limitations: [...pkg.limitations],
      language: 'en',
    };
    const parsed = parseStructuredNarrative(hostile, new Set(llm.allowedFindingIds));
    expect(parsed.ok).toBe(false);
  });

  it('rejects promoting a lower-priority finding above primary', () => {
    const pkg = solPkg();
    const selected = pkg.selectedInsightIds
      .map(id => pkg.approvedInsights.find(a => a.id === id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    expect(selected.length).toBeGreaterThanOrEqual(2);
    const llm = serializeForLlm(pkg);
    const primary = selected[0];
    const secondary = selected[1];
    const hostile = {
      schemaVersion: STRUCTURED_NARRATIVE_SCHEMA_VERSION,
      headline: 'Wrong primary',
      summary: 'Promotes secondary',
      selectedFindingIds: [secondary.legacyFindingId ?? secondary.id, primary.legacyFindingId ?? primary.id],
      interpretation: 'x',
      monitoringPoints: [],
      limitations: [...pkg.limitations],
      language: 'en',
    };
    const parsed = parseStructuredNarrative(hostile, new Set(llm.allowedFindingIds));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const check = enforceNarrativeConstraints(parsed.value, {
      allowedFindingIds: new Set(llm.allowedFindingIds),
      selectedInsights: selected,
      requiredLimitations: ['individual wallet'],
    });
    expect(check.ok).toBe(false);
    expect(check.violations.some(v => v.startsWith('promoted_above_primary'))).toBe(true);
  });

  it('rejects unsupported causal wording when cause is cannot_determine', () => {
    const pkg = solPkg();
    const selected = pkg.approvedInsights.filter(a => pkg.selectedInsightIds.includes(a.id));
    const llm = serializeForLlm(pkg);
    const hostile = {
      schemaVersion: STRUCTURED_NARRATIVE_SCHEMA_VERSION,
      headline: 'Confirmed cause',
      summary: 'Growth is confirmed because of price-driven allocation.',
      selectedFindingIds: llm.allowedFindingIds.slice(0, 1),
      interpretation: 'This is a confirmed price-driven drift.',
      monitoringPoints: [],
      limitations: [...pkg.limitations],
      language: 'en',
    };
    const parsed = parseStructuredNarrative(hostile, new Set(llm.allowedFindingIds));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const check = enforceNarrativeConstraints(parsed.value, {
      allowedFindingIds: new Set(llm.allowedFindingIds),
      selectedInsights: selected,
      requiredLimitations: [],
      forbiddenCausalPhrases: ['confirmed price-driven'],
    });
    expect(check.ok).toBe(false);
  });

  it('rejects removal of material limitations', () => {
    const pkg = solPkg();
    const selected = pkg.approvedInsights.filter(a => pkg.selectedInsightIds.includes(a.id));
    const llm = serializeForLlm(pkg);
    const hostile = {
      schemaVersion: STRUCTURED_NARRATIVE_SCHEMA_VERSION,
      headline: 'No limits',
      summary: 'Clean story',
      selectedFindingIds: llm.allowedFindingIds.slice(0, 1),
      interpretation: 'x',
      monitoringPoints: [],
      limitations: [],
      language: 'en',
    };
    const parsed = parseStructuredNarrative(hostile, new Set(llm.allowedFindingIds));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const check = enforceNarrativeConstraints(parsed.value, {
      allowedFindingIds: new Set(llm.allowedFindingIds),
      selectedInsights: selected,
      requiredLimitations: ['individual wallet'],
    });
    expect(check.ok).toBe(false);
    expect(check.violations.some(v => v.includes('removed_limitation'))).toBe(true);
  });

  it('Package 1 numeric validation remains the final gate on hostile numbers', () => {
    const report = validateNarrativeAgainstIntelligence({
      texts: ['SOL is 99% of the portfolio and worth $9,999,999.'],
      approved: [{ value: 42, unit: 'pct', labels: ['SOL', 'allocationPct'] }],
    });
    expect(report.valid).toBe(false);
    expect(report.unmatchedClaims.length).toBeGreaterThan(0);
  });
});
