import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Insight } from '@/lib/ai/intelligence';
import type { EngineOutput } from '@/lib/ai/tools/registry';
import type { AnalysisScope, DomainStatus, EvidenceItem } from '@/lib/ai/trust/types';
import {
  applyEligibility,
  attributeAssetValueChange,
  attributePortfolioContribution,
  buildCandidateFindings,
  consolidateDuplicates,
  detectContradictions,
  normalizeObservations,
  rankCandidates,
  runIntelligenceQuality,
  scoreMateriality,
  scoreNovelty,
  scoreSignificance,
  selectInsights,
  assessSampleAdequacy,
  DEFAULT_IQ_CONFIG,
} from '@/lib/ai/intelligence-quality';

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
  coverage: {
    status: 'complete',
    isFullEntitledHistory: false,
    truncated: false,
  },
  asOf: {},
};

const domains: DomainStatus[] = [
  { domain: 'holdings', status: 'available', notes: [] },
  { domain: 'transactions', status: 'available', notes: [] },
  { domain: 'pricing', status: 'available', notes: [] },
  { domain: 'snapshots', status: 'available', notes: [] },
  { domain: 'counterparties', status: 'available', notes: [] },
  { domain: 'wallet', status: 'available', notes: [] },
  { domain: 'investment_return', status: 'partial', notes: [] },
  { domain: 'trading_volume', status: 'partial', notes: [] },
];

function finding(partial: Partial<Insight> & Pick<Insight, 'id' | 'type' | 'title'>): Insight {
  return {
    description: partial.description ?? partial.title,
    severity: partial.severity ?? 'medium',
    confidence: partial.confidence ?? 'medium',
    evidence: partial.evidence ?? {},
    category: partial.category,
    impactUsd: partial.impactUsd,
    relatedEntities: partial.relatedEntities,
    ...partial,
  };
}

function envelope(engine: string, findings: Insight[], metrics: Record<string, unknown> = {}): EngineOutput {
  return {
    engine,
    status: 'completed',
    summary: `${engine} summary`,
    metrics,
    patterns: [],
    findings,
    evidence: {},
    confidence: 'medium',
    dataQuality: {
      transactionCount: 40,
      pricedCount: 36,
      unpricedCount: 4,
      completeness: 0.9,
      truncated: false,
      notes: [],
    },
    recommendedFollowup: [],
    tool: 'get_portfolio_overview',
    periodDays: 90,
    generatedAt: Date.now(),
  };
}

describe('Package 2 materiality', () => {
  it('same USD is high in small wallet and low in large wallet', () => {
    const small = scoreMateriality({ impactUsd: 5000, portfolioValueUsd: 10_000 });
    const large = scoreMateriality({ impactUsd: 5000, portfolioValueUsd: 10_000_000 });
    expect(small.level === 'high' || small.level === 'critical').toBe(true);
    expect(large.level === 'immaterial' || large.level === 'low').toBe(true);
    expect(small.score).toBeGreaterThan(large.score);
  });
});

describe('Package 2 sample adequacy + significance + novelty', () => {
  it('marks one observation insufficient for dependency patterns', () => {
    const sample = assessSampleAdequacy({
      kind: 'counterparty_dependency',
      observations: 1,
      activeDays: 1,
      periodDays: 30,
      coverageComplete: true,
    });
    expect(sample.level === 'insufficient' || sample.level === 'weak').toBe(true);
  });

  it('does not claim significance without baseline', () => {
    const sig = scoreSignificance({
      changePct: 40,
      periodDays: 30,
      baselineAvailable: false,
    });
    expect(sig.level).toBe('normal');
    expect(sig.reasons.join(' ')).toMatch(/insufficient/i);
  });

  it('classifies new vs persistent novelty', () => {
    const neu = scoreNovelty({ previousOccurrences: 0, crossedThresholdThisPeriod: true });
    expect(neu.status).toBe('new');
    const pers = scoreNovelty({ previousOccurrences: 4, stillAboveThreshold: true });
    expect(pers.status).toBe('persistent');
  });
});

describe('Package 2 eligibility — counterparty one-event rule', () => {
  it('suppresses dependency when interactionCount=1 and not highly material', () => {
    const env = envelope('counterparty', [
      finding({
        id: 'f-dep',
        type: 'concentrated_inflow_source',
        title: '100% from one source',
        category: 'counterparty',
        impactUsd: 50,
        relatedEntities: ['Sender'],
        evidence: { inbound_share_pct: 100, interaction_count: 1, amount_usd: 50 },
      }),
    ]);
    const candidates = buildCandidateFindings({
      envelopes: [env],
      observations: [],
      scope,
      domainStatuses: domains,
      evidence: [],
      portfolioValueUsd: 9257,
      periodDays: 90,
    });
    const decided = applyEligibility(candidates, domains);
    const dep = decided.find(c => c.legacyFindingId === 'f-dep');
    expect(dep?.eligibility.eligible).toBe(false);
    expect(dep?.eligibility.decision).toBe('suppressed_insufficient_sample');
  });

  it('approves one-time material event when single interaction is highly material', () => {
    const env = envelope('flow', [
      finding({
        id: 'f-big',
        type: 'concentrated_inflow_source',
        title: 'Large single inflow',
        category: 'flow',
        impactUsd: 4000,
        relatedEntities: ['Whale'],
        evidence: { inbound_share_pct: 100, interaction_count: 1, amount_usd: 4000 },
      }),
    ]);
    const candidates = buildCandidateFindings({
      envelopes: [env],
      observations: [],
      scope,
      domainStatuses: domains,
      evidence: [],
      portfolioValueUsd: 9257,
      periodDays: 90,
    });
    const decided = applyEligibility(candidates, domains);
    const hit = decided.find(c => c.legacyFindingId === 'f-big');
    expect(hit?.eligibility.eligible).toBe(true);
    expect(hit?.type).toBe('one_time_material_event');
  });
});

describe('Package 2 attribution', () => {
  it('reconciles price/quantity/interaction within tolerance', () => {
    const attr = attributeAssetValueChange({
      assetId: 'SOL',
      beginningQuantity: 10,
      endingQuantity: 12,
      beginningPriceUsd: 100,
      endingPriceUsd: 110,
    });
    // ΔV = 12*110 - 10*100 = 320
    // price = 10*10 = 100; qty = 100*2 = 200; interaction = 10*2 = 20
    expect(attr.totalValueChangeUsd).toBe(320);
    expect(attr.priceEffectUsd).toBe(100);
    expect(attr.quantityEffectUsd).toBe(200);
    expect(attr.interactionEffectUsd).toBe(20);
    expect(attr.reconcileErrorUsd).toBeLessThan(0.01);
  });

  it('withholds contribution percentages when total change near zero', () => {
    const env = envelope(
      'performance',
      [],
      {
        valueChangeUsd: 0.2,
        topContributors: [
          { symbol: 'SOL', contributionUsd: 500 },
          { symbol: 'ETH', contributionUsd: -500 },
        ],
      },
    );
    const portfolio = attributePortfolioContribution({
      envelopes: [env],
      portfolioValueUsd: 10_000,
      periodDays: 30,
    });
    expect(portfolio.contributors.every(c => c.contributionPctOfTotalChange == null)).toBe(true);
    expect(portfolio.limitations.join(' ')).toMatch(/near zero/i);
  });
});

describe('Package 2 contradictions + dedup', () => {
  it('marks overlapping concentration as superseded duplicate', () => {
    const a = envelope('portfolio', [
      finding({
        id: 'c1',
        type: 'extreme_concentration',
        title: 'ETH concentration high',
        category: 'portfolio',
        impactUsd: 7000,
        relatedEntities: ['ETH'],
        evidence: { allocation_pct: 72, interaction_count: 5 },
      }),
    ]);
    const b = envelope('asset', [
      finding({
        id: 'c2',
        type: 'dominant_asset',
        title: 'ETH is 72%',
        category: 'asset',
        impactUsd: 7000,
        relatedEntities: ['ETH'],
        evidence: { allocation_pct: 72, interaction_count: 5 },
      }),
    ]);
    let candidates = buildCandidateFindings({
      envelopes: [a, b],
      observations: [],
      scope,
      domainStatuses: domains,
      evidence: [],
      portfolioValueUsd: 10_000,
      periodDays: 90,
    });
    candidates = applyEligibility(candidates, domains).map(c =>
      c.eligibility.eligible
        ? c
        : {
            ...c,
            eligibility: { eligible: true, decision: 'approved' as const, reasons: ['force'] },
            materiality: { ...c.materiality, score: 0.8, level: 'high' as const },
          },
    );
    const { duplicateIds, survivors } = consolidateDuplicates(candidates);
    expect(duplicateIds.size).toBeGreaterThan(0);
    expect(survivors.some(s => s.title.toLowerCase().includes('concentration'))).toBe(true);
  });

  it('resolves low-risk vs critical concentration contradiction', () => {
    const envelopes = [
      envelope('risk', [
        finding({
          id: 'r-low',
          type: 'exposure_profile',
          title: 'Risk is low overall',
          category: 'risk',
          impactUsd: 100,
          relatedEntities: ['portfolio'],
          evidence: { interaction_count: 5 },
        }),
      ]),
      envelope('portfolio', [
        finding({
          id: 'r-conc',
          type: 'extreme_concentration',
          title: 'Asset concentration is critical',
          category: 'portfolio',
          severity: 'critical',
          impactUsd: 8000,
          relatedEntities: ['ETH'],
          evidence: { allocation_pct: 85, interaction_count: 5 },
        }),
      ]),
    ];
    let candidates = buildCandidateFindings({
      envelopes,
      observations: [],
      scope,
      domainStatuses: domains,
      evidence: [],
      portfolioValueUsd: 10_000,
      periodDays: 90,
    });
    candidates = applyEligibility(candidates, domains).map(c => ({
      ...c,
      eligibility: { eligible: true, decision: 'approved' as const, reasons: ['force'] },
      materiality: {
        ...c.materiality,
        score: c.legacyFindingId === 'r-conc' ? 0.9 : 0.3,
        level: c.legacyFindingId === 'r-conc' ? ('critical' as const) : ('low' as const),
      },
    }));
    const { results, rejectedIds } = detectContradictions(candidates);
    expect(results.some(r => r.status === 'contradiction')).toBe(true);
    expect(rejectedIds.size).toBeGreaterThan(0);
  });
});

describe('Package 2 SOL historical integration (Test A)', () => {
  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), 'tests/fixtures/ai-intelligence-quality/sol-historical.json'),
      'utf8',
    ),
  ) as {
    portfolioValueUsd: number;
    portfolioChangeUsd: number;
    solChangeUsd: number;
    solInflowUsd: number;
    solInflowInteractions: number;
    expectations: Record<string, unknown>;
  };

  it('improves ranking: suppresses one-inflow dependency, keeps material performance/allocation', () => {
    const envelopes: EngineOutput[] = [
      envelope(
        'performance',
        [
          finding({
            id: 'perf-port',
            type: 'continuous_growth',
            title: 'Portfolio increased',
            category: 'performance',
            impactUsd: fixture.portfolioChangeUsd,
            relatedEntities: ['portfolio'],
            evidence: { change_pct: 97, interaction_count: 20 },
          }),
          finding({
            id: 'perf-sol',
            type: 'concentrated_loss',
            title: 'SOL detracted',
            category: 'performance',
            impactUsd: fixture.solChangeUsd,
            relatedEntities: ['SOL'],
            evidence: { change_pct: -8, interaction_count: 8 },
          }),
        ],
        {
          valueChangeUsd: fixture.portfolioChangeUsd,
          topContributors: [
            { symbol: 'ETH', contributionUsd: 4928 },
            { symbol: 'SOL', contributionUsd: fixture.solChangeUsd },
          ],
        },
      ),
      envelope(
        'flow',
        [
          finding({
            id: 'flow-in',
            type: 'concentrated_inflow_source',
            title: '100% SOL inflow from one source',
            category: 'flow',
            impactUsd: fixture.solInflowUsd,
            relatedEntities: ['Sender'],
            evidence: {
              inbound_share_pct: 100,
              interaction_count: fixture.solInflowInteractions,
              amount_usd: fixture.solInflowUsd,
            },
          }),
          finding({
            id: 'flow-net',
            type: 'net_capital_movement',
            title: 'Small SOL net outflow',
            category: 'flow',
            impactUsd: 231,
            relatedEntities: ['SOL'],
            evidence: { amount_usd: 231, interaction_count: 5 },
          }),
        ],
        {
          inflowUsd: fixture.solInflowUsd,
          outflowUsd: 1859,
          externalInflowUsd: fixture.solInflowUsd,
          externalOutflowUsd: 1859,
        },
      ),
      envelope('asset', [
        finding({
          id: 'asset-sol',
          type: 'allocation_drift',
          title: 'SOL allocation changed',
          category: 'asset',
          impactUsd: Math.abs(fixture.solChangeUsd),
          relatedEntities: ['SOL'],
          evidence: { allocation_pct: 46.77, interaction_count: 8 },
        }),
      ]),
    ];

    const evidence: EvidenceItem[] = [];
    const observations = normalizeObservations({ envelopes, scope, evidence });
    expect(observations.length).toBeGreaterThan(0);

    const pkg = runIntelligenceQuality({
      envelopes,
      scope,
      domainStatuses: domains,
      evidence,
      portfolioValueUsd: fixture.portfolioValueUsd,
      periodDays: 90,
      context: 'asset',
      includeDiagnostics: true,
      focusAsset: 'SOL',
    });

    const inflowCand = pkg.candidateFindings.find(c => c.legacyFindingId === 'flow-in');
    // $1,628 / $9,257 ≈ 17.6% → highly material one-time event (not recurring dependency).
    expect(inflowCand?.type).toBe('one_time_material_event');
    expect(inflowCand?.eligibility.eligible).toBe(true);
    expect(inflowCand?.proposedMeaning.toLowerCase()).not.toMatch(/recurring dependency/);

    expect(pkg.selectedInsightIds.length).toBeGreaterThanOrEqual(1);
    expect(pkg.selectedInsightIds.length).toBeLessThanOrEqual(5);
    expect(pkg.whatMatters.headline.length).toBeGreaterThan(0);
    expect(pkg.approvedInsights.every(a => a.reasoning.hypotheses.length > 0)).toBe(true);
    expect(pkg.diagnostics?.candidateCount).toBeGreaterThan(0);
    // One-event inflow must not survive as a recurring dependency type in selection
    expect(
      pkg.selectedInsightIds.every(id => {
        const t = pkg.approvedInsights.find(a => a.id === id)?.type;
        return t !== 'concentrated_inflow_source' && !String(t).includes('dependency');
      }),
    ).toBe(true);

    const ranked = rankCandidates(
      pkg.candidateFindings.filter(c => c.eligibility.eligible),
      'asset',
      new Set(),
    );
    const solLossRank = ranked.findIndex(r => r.candidate.legacyFindingId === 'perf-sol');
    const netFlowRank = ranked.findIndex(r => r.candidate.legacyFindingId === 'flow-net');
    if (solLossRank >= 0 && netFlowRank >= 0) {
      expect(solLossRank).toBeLessThan(netFlowRank);
    }

    // Unsupported unknown-only causes are allowed as cannot_determine, not as confirmed
    for (const a of pkg.approvedInsights) {
      for (const h of a.reasoning.hypotheses) {
        if (h.status === 'insufficient_data') {
          expect(h.languageState).toBe('cannot_determine');
        }
      }
    }
  });
});

describe('Package 2 selection diversity', () => {
  it('caps category repetition on dashboard', () => {
    const envelopes = [
      envelope(
        'portfolio',
        Array.from({ length: 6 }, (_, i) =>
          finding({
            id: `p${i}`,
            type: 'extreme_concentration',
            title: `Concentration ${i}`,
            category: 'portfolio',
            impactUsd: 5000 + i * 100,
            relatedEntities: [`A${i}`],
            evidence: { allocation_pct: 60 + i, interaction_count: 5 },
          }),
        ),
      ),
      envelope('performance', [
        finding({
          id: 'perf1',
          type: 'continuous_growth',
          title: 'Growth',
          category: 'performance',
          impactUsd: 4000,
          relatedEntities: ['portfolio'],
          evidence: { interaction_count: 10, change_pct: 20 },
        }),
      ]),
    ];
    const pkg = runIntelligenceQuality({
      envelopes,
      scope,
      domainStatuses: domains,
      evidence: [],
      portfolioValueUsd: 10_000,
      periodDays: 90,
      context: 'dashboard',
    });
    expect(pkg.selectedInsightIds.length).toBeLessThanOrEqual(DEFAULT_IQ_CONFIG.maximumPrimaryInsights.dashboard);
    const selected = selectInsights({
      ranked: rankCandidates(
        pkg.candidateFindings.filter(c => c.eligibility.eligible),
        'dashboard',
        new Set(),
      ),
      context: 'dashboard',
    });
    expect(selected.length).toBeGreaterThan(0);
  });
});

describe('Package 2 observation normalization coverage', () => {
  it('emits observations for each active engine envelope', () => {
    const engines = [
      'portfolio',
      'asset',
      'performance',
      'flow',
      'trading',
      'network',
      'counterparty',
      'risk',
    ];
    const envelopes = engines.map(engine =>
      envelope(
        engine,
        [
          finding({
            id: `${engine}-f`,
            type: `${engine}_signal`,
            title: `${engine} signal`,
            evidence: { amount_usd: 100, interaction_count: 3 },
          }),
        ],
        { sampleMetricUsd: 100, topSharePct: 40 },
      ),
    );
    const obs = normalizeObservations({ envelopes, scope, evidence: [] });
    for (const engine of engines) {
      expect(obs.some(o => o.engine === engine)).toBe(true);
    }
  });
});
