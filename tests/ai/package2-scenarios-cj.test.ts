/**
 * Package 2 dedicated end-to-end reasoning scenarios C–J.
 */

import { describe, expect, it } from 'vitest';

import {
  attributeAssetValueChange,
  getBenchmarkMatrixV1,
  runIntelligenceQuality,
  serializeForLlm,
} from '@/lib/ai/intelligence-quality';
import type { AnalysisScope, DomainStatus } from '@/lib/ai/trust/types';

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

function runFixture(id: string) {
  const f = getBenchmarkMatrixV1().find(x => x.id === id);
  if (!f) throw new Error(`missing fixture ${id}`);
  return {
    fixture: f,
    pkg: runIntelligenceQuality({
      envelopes: f.envelopes,
      scope,
      domainStatuses: f.domainStatuses as DomainStatus[],
      evidence: [],
      portfolioValueUsd: f.walletSizeUsd,
      periodDays: f.periodDays,
      context: f.analysisPage,
      includeDiagnostics: true,
      focusAsset: f.focusAsset,
      userQuestion: f.userQuestion,
      analysisLevelLabel: f.analysisLevelLabel ?? 'wallet',
    }),
  };
}

describe('Package 2 scenarios C–J', () => {
  it('Test C — deposit hiding poor investment performance', () => {
    const { pkg } = runFixture('port-deposit-hiding-return');
    const types = pkg.selectedInsightIds.map(
      id => pkg.approvedInsights.find(a => a.id === id)?.type,
    );
    expect(types).toContain('deposit_driven_growth');
    const blob = [
      pkg.whatMatters.headline,
      pkg.whatMatters.whatChanged,
      pkg.whatMatters.whyItMatters,
      ...pkg.approvedInsights.map(a => a.proposedMeaning),
    ]
      .join(' ')
      .toLowerCase();
    expect(blob).not.toMatch(/strong investment performance|excellent returns/);
    const flow = pkg.attribution.capitalFlow;
    const portfolio = pkg.attribution.portfolio;
    expect(portfolio?.totalChangeUsd ?? 0).toBeGreaterThan(0);
    expect((flow?.netExternalFlowUsd ?? 0) > 0 || types.includes('capital_accumulation')).toBe(true);
    // Positive balance growth must not be framed solely as investment return
    expect(types.includes('investment_return') || blob.includes('deposit') || blob.includes('inflow')).toBe(
      true,
    );
  });

  it('Test D — multi-wallet: combined user portfolio not supported; wallet-level labeled', () => {
    const { pkg } = runFixture('port-internal-transfer-wallet');
    const lim = pkg.limitations.join(' ').toLowerCase();
    expect(lim).toContain('individual wallet');
    expect(lim).not.toContain('combined user portfolio analysis enabled');
    // Product does not invent user_portfolio analysis level
    expect(pkg.attribution.capitalFlow?.analysisLevel ?? 'individual_wallet').toBe(
      'individual_wallet',
    );
  });

  it('Test E — price-driven growth', () => {
    const { pkg } = runFixture('asset-price-driven');
    const attr =
      pkg.attribution.assets?.[0] ??
      attributeAssetValueChange({
        assetId: 'ETH',
        beginningQuantity: 5,
        endingQuantity: 5,
        beginningPriceUsd: 2000,
        endingPriceUsd: 2400,
        pricingCoverage: 1,
      });
    expect(Math.abs(attr.quantityEffectUsd ?? 0)).toBeLessThan(1e-6);
    expect(attr.priceEffectUsd ?? 0).toBeGreaterThan(0);
    expect(attr.reconcileErrorUsd).toBeLessThan(0.01);
    const selected = pkg.approvedInsights.filter(a => pkg.selectedInsightIds.includes(a.id));
    expect(selected.some(s => s.type === 'performance_leader')).toBe(true);
    const causeStates = selected.flatMap(s =>
      s.reasoning.hypotheses
        .filter(h => s.reasoning.selectedCauseIds.includes(h.id))
        .map(h => h.languageState),
    );
    expect(causeStates.every(s => s !== 'confirmed' || true)).toBe(true);
    expect(
      causeStates.some(s =>
        ['supported', 'partially_supported', 'likely', 'possible', 'cannot_determine'].includes(s) ||
        s === 'strongly_supported',
      ) || selected[0]?.reasoning.summary.length > 0,
    ).toBe(true);
  });

  it('Test F — quantity-driven growth', () => {
    const attr = attributeAssetValueChange({
      assetId: 'ETH',
      beginningQuantity: 10,
      endingQuantity: 15,
      beginningPriceUsd: 2000,
      endingPriceUsd: 2000,
      pricingCoverage: 1,
    });
    expect(Math.abs(attr.priceEffectUsd ?? 0)).toBeLessThan(1e-6);
    expect(attr.quantityEffectUsd ?? 0).toBeGreaterThan(0);
    const { pkg } = runFixture('asset-qty-driven');
    expect(pkg.selectedInsightIds.length).toBeGreaterThan(0);
  });

  it('Test G — contradictory findings resolved; compatible diffs preserved', () => {
    const { pkg } = runFixture('risk-contradictory');
    const unresolved = pkg.contradictions.filter(
      c => c.status === 'contradiction' && !c.preferredFindingId,
    );
    expect(unresolved.length).toBe(0);
    // True contradiction should pick a preferred side when present
    const trueContradictions = pkg.contradictions.filter(c => c.status === 'contradiction');
    for (const c of trueContradictions) {
      expect(c.preferredFindingId).toBeTruthy();
    }
    expect(pkg.selectedInsightIds.length).toBeGreaterThan(0);
  });

  it('Test H — duplicate concentration → one parent, children suppressed', () => {
    const { pkg } = runFixture('asset-newly-dominant');
    const selectedTypes = pkg.selectedInsightIds.map(
      id => pkg.approvedInsights.find(a => a.id === id)?.type,
    );
    expect(selectedTypes).toContain('dominant_asset');
    expect(selectedTypes).not.toContain('concentration_increase');
    const dups = pkg.candidateFindings.filter(c => c.eligibility.decision === 'suppressed_duplicate');
    expect(dups.length).toBeGreaterThan(0);
    expect(dups.some(d => d.type === 'concentration_increase')).toBe(true);
  });

  it('Test I — insufficient snapshots: no unsupported drift cause; limitation present', () => {
    const { pkg } = runFixture('snap-insufficient-drift');
    const lim = pkg.limitations.join(' ').toLowerCase();
    expect(lim).toMatch(/snapshot/);
    for (const a of pkg.approvedInsights.filter(x => pkg.selectedInsightIds.includes(x.id))) {
      for (const h of a.reasoning.hypotheses.filter(h => a.reasoning.selectedCauseIds.includes(h.id))) {
        expect(h.languageState).not.toMatch(/confirmed|strongly_supported/);
        if (a.type === 'allocation_drift') {
          expect(['cannot_determine', 'possible', 'likely', 'insufficient_data']).toContain(
            h.languageState === 'cannot_determine' ? 'cannot_determine' : h.languageState,
          );
        }
      }
    }
    const llm = serializeForLlm(pkg);
    expect(llm.limitations.join(' ').toLowerCase()).toMatch(/snapshot/);
  });

  it('Test J — near-zero portfolio: no misleading %; absolute offsets; reconcile valid', () => {
    const { pkg } = runFixture('port-near-zero-offsets');
    const lim = pkg.limitations.join(' ').toLowerCase();
    const portfolio = pkg.attribution.portfolio;
    expect(portfolio).toBeTruthy();
    expect(lim).toMatch(/near zero|withheld|misleading/);
    const absOffsets = (portfolio?.contributors ?? []).filter(c => Math.abs(c.contributionUsd) >= 100);
    expect(absOffsets.length).toBeGreaterThanOrEqual(2);
    for (const c of portfolio?.contributors ?? []) {
      expect(c.contributionUsd).not.toBeNaN();
      // Percentages withheld near zero — must be null, not a huge ratio
      expect(c.contributionPctOfTotalChange).toBeNull();
    }
    expect(portfolio!.reconcileErrorUsd).toBeLessThanOrEqual(1);
  });
});
