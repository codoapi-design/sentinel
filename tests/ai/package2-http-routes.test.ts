/**
 * Package 2 HTTP contract tests — reasonedIntelligence on Analyze/Chat.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockRunAnalysis = vi.fn();
const mockAssertAiQuota = vi.fn();
const mockRecordAiUsage = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createCookieServerClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
  createServerClient: () => ({}),
}));

vi.mock('@/lib/ai/tools', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/tools')>('@/lib/ai/tools');
  return {
    ...actual,
    runAnalysis: (...args: unknown[]) => mockRunAnalysis(...args),
    assertAiQuota: (...args: unknown[]) => mockAssertAiQuota(...args),
    recordAiUsage: (...args: unknown[]) => mockRecordAiUsage(...args),
    resolveAiQuotaWindow: () => 'month',
  };
});

vi.mock('@/lib/ai/trust', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/trust')>('@/lib/ai/trust');
  return {
    ...actual,
    persistAiTrace: vi.fn(),
    claimIdempotencyKey: vi.fn(async () => ({ status: 'new', claimId: 'c1' })),
    completeIdempotencyKey: vi.fn(),
    shouldChargeUsage: vi.fn(async () => true),
    markUsageCharged: vi.fn(),
  };
});

const WALLET = '11111111-1111-4111-8111-111111111111';

const reasonedIntelligence = {
  schemaVersion: '1.0.0',
  approvedInsights: [],
  rankedInsightIds: ['cand:f1'],
  selectedInsightIds: ['cand:f1'],
  whatMatters: {
    primaryFindingId: 'cand:f1',
    secondaryFindingIds: [],
    headline: 'SOL detracted',
    whatChanged: 'SOL declined while portfolio rose',
    whyItMatters: 'Negative contributor in a positive portfolio',
  },
  monitoringPoints: [],
  contradictions: [],
  attribution: {},
  completionStatus: 'complete',
  limitations: [],
  versions: {
    reasoningEngine: 'reasoning-engine-v1',
    eligibilityRules: 'eligibility-rules-v1',
    materialityModel: 'materiality-model-v1',
    significanceModel: 'significance-model-v1',
    rankingModel: 'ranking-model-v1',
    attributionModel: 'portfolio-attribution-v1',
    behaviorModel: 'behavior-model-v1',
  },
};

function analysisFixture() {
  return {
    narrative: 'SOL represents 46.77% of the portfolio.',
    source: 'deterministic',
    intelligence: [],
    insights: [],
    metrics: [{ engine: 'asset', key: 'allocationPct', label: 'SOL', value: 46.77, unit: 'percent' }],
    patterns: [],
    toolsUsed: ['get_asset_intelligence'],
    plan: { mode: 'dashboard', tools: [], intents: [], entities: {} },
    analysisMode: 'dashboard',
    confidence: 'high',
    dataQuality: {
      completeness: 90,
      pricedCount: 10,
      unpricedCount: 0,
      transactionCount: 10,
      truncated: false,
      notes: [],
      isFullEntitledHistory: false,
    },
    wallet: { id: WALLET },
    periodDays: 90,
    periodLabel: 'Last 90 days',
    generatedAt: Date.now(),
    llm: { providerId: 'none', violations: [] },
    context: {},
    completionStatus: 'complete',
    scope: {
      walletId: WALLET,
      coverage: { status: 'complete', truncated: false, isFullEntitledHistory: false },
      requestedPeriod: { from: '2026-05-01', to: '2026-08-01' },
      entitlementScope: { allowedFrom: null, allowedTo: null, plan: 'pro', limitations: [] },
      entityScope: {},
      filters: {},
      source: 'server_database',
      asOf: {},
    },
    domainStatuses: [],
    grounding: { primarySource: 'server_database', screenVerified: false, discrepancies: [] },
    evidence: [],
    normalizedFindings: [],
    validation: { valid: true, checkedClaims: 0, matchedClaims: 0, unmatchedClaims: [] },
    traceId: 'trace-p2',
    versions: {
      pipelineVersion: '2.0.0',
      responseSchemaVersion: '2.0.0',
      promptVersion: 'v2.1.0-package2',
      engineVersions: {},
    },
    dataRequirementsPlan: { transactions: { mode: 'filtered' } },
    reasonedIntelligence,
  };
}

describe('Package 2 HTTP reasonedIntelligence', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockRunAnalysis.mockReset();
    mockAssertAiQuota.mockReset();
    mockRecordAiUsage.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
    mockAssertAiQuota.mockResolvedValue({ planId: 'pro' });
    mockRecordAiUsage.mockResolvedValue(undefined);
    mockRunAnalysis.mockResolvedValue(analysisFixture());
  });

  it('Analyze response includes reasonedIntelligence', async () => {
    const { POST } = await import('@/app/api/ai/analyze/route');
    const req = new NextRequest('http://localhost/api/ai/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletId: WALLET, sectionType: 'asset', asset: 'SOL' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reasonedIntelligence.selectedInsightIds).toContain('cand:f1');
    expect(body.data.reasonedIntelligence.whatMatters.headline).toMatch(/SOL/i);
  });

  it('Chat response includes the same authoritative approved insight set', async () => {
    const { POST } = await import('@/app/api/ai/chat/route');
    const req = new NextRequest('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletId: WALLET, message: 'What happened with SOL?' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reasonedIntelligence.selectedInsightIds).toEqual(
      reasonedIntelligence.selectedInsightIds,
    );
  });

  it('does not expose reasoningDiagnostics unless attached', async () => {
    const { POST } = await import('@/app/api/ai/analyze/route');
    const req = new NextRequest('http://localhost/api/ai/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletId: WALLET, sectionType: 'portfolio' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.data.reasoningDiagnostics).toBeUndefined();
  });
});
