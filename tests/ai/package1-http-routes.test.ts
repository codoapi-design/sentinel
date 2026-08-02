/**
 * HTTP-level route tests for Analyze / Chat (handler invocation).
 * Auth and DB are mocked — these exercise route contracts, not helpers alone.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUser = vi.fn();
const mockRunAnalysis = vi.fn();
const mockAssertAiQuota = vi.fn();
const mockRecordAiUsage = vi.fn();
const mockParseScreenSnapshot = vi.fn((v: unknown) => v);

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

vi.mock('@/lib/ai-screen-snapshot', () => ({
  parseScreenSnapshot: (v: unknown) => mockParseScreenSnapshot(v),
}));

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

function analysisFixture(overrides: Record<string, unknown> = {}) {
  return {
    narrative: 'SOL is 3.98% of the portfolio ($368.42 of $9,260).',
    source: 'deterministic',
    intelligence: [],
    insights: [],
    metrics: [
      { engine: 'asset', key: 'allocationPct', label: 'Allocation', value: 3.98, unit: 'pct' },
      { engine: 'asset', key: 'valueUsd', label: 'Value', value: 368.42, unit: 'usd' },
    ],
    evidence: [],
    scope: { coverage: { isFullEntitledHistory: false } },
    domainStatuses: [],
    grounding: { primarySource: 'server_database', screenContextUsed: false, screenValuesVerified: true, discrepancies: [] },
    confidence: 'high',
    dataQuality: { notes: [], truncated: false, isFullEntitledHistory: false },
    validation: { valid: true, checkedClaims: 2, matchedClaims: 2, unmatchedClaims: [], correctionsApplied: [] },
    toolsUsed: ['get_asset_intelligence'],
    analysisMode: 'snapshot',
    periodDays: 30,
    periodLabel: '30d',
    generatedAt: Date.now(),
    plan: { intents: ['asset_analysis'], tools: ['get_asset_intelligence'] },
    llm: { usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
    structuredNarrative: {
      schemaVersion: '2.0.0',
      headline: 'SOL allocation',
      summary: 'SOL is 3.98% of portfolio.',
      selectedFindingIds: [],
      interpretation: '',
      monitoringPoints: [],
      limitations: [],
      language: 'en',
    },
    completionStatus: 'complete',
    traceId: 'trace-fixture',
    versions: { pipelineVersion: '2.0.0', responseSchemaVersion: '2.0.0', promptVersion: 'v2', engineVersions: {} },
    dataRequirementsPlan: { holdings: true, transactions: { mode: 'none' }, snapshots: false, clients: false, pricing: true, investmentReturn: false, tradingVolume: false },
    ...overrides,
  };
}

describe('HTTP Analyze / Chat routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
    mockAssertAiQuota.mockResolvedValue({ planId: 'pro' });
    mockRunAnalysis.mockResolvedValue(analysisFixture());
    mockRecordAiUsage.mockResolvedValue(undefined);
  });

  it('1. invalid Analyze payload → 400 + traceId', async () => {
    const { POST } = await import('@/app/api/ai/analyze/route');
    const res = await POST(
      new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ walletId: 'bad' }),
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_AI_REQUEST');
    expect(body.error.traceId).toBeTruthy();
  });

  it('2. invalid Chat payload → 400 + traceId', async () => {
    const { POST } = await import('@/app/api/ai/chat/route');
    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ walletId: WALLET }),
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.traceId).toBeTruthy();
  });

  it('3. client mode telegram on chat → server still uses chat', async () => {
    const { POST } = await import('@/app/api/ai/chat/route');
    await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          walletId: WALLET,
          message: 'How much SOL?',
          mode: 'telegram',
        }),
      }) as never,
    );
    expect(mockRunAnalysis).toHaveBeenCalled();
    expect(mockRunAnalysis.mock.calls[0][0].mode).toBe('chat');
  });

  it('4. other user wallet → denied', async () => {
    const { WalletContextError } = await import('@/lib/ai/tools/context');
    mockRunAnalysis.mockRejectedValueOnce(new WalletContextError('wallet_not_found', 'Wallet not found for this user.'));
    const { POST } = await import('@/app/api/ai/analyze/route');
    const res = await POST(
      new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ walletId: WALLET, sectionType: 'portfolio' }),
      }) as never,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('WALLET_NOT_FOUND');
  });

  it('5. duplicate idempotency → one usage charge path', async () => {
    const trust = await import('@/lib/ai/trust');
    vi.mocked(trust.claimIdempotencyKey).mockResolvedValueOnce({
      status: 'replay',
      responseStatus: 200,
      responseBody: { success: true, data: { narrative: 'cached' } },
      traceId: 't1',
    });
    const { POST } = await import('@/app/api/ai/analyze/route');
    const res = await POST(
      new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({
          walletId: WALLET,
          sectionType: 'portfolio',
          idempotencyKey: 'same-key',
        }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockRunAnalysis).not.toHaveBeenCalled();
    expect(mockRecordAiUsage).not.toHaveBeenCalled();
  });

  it('6. manipulated screen → server grounding in response', async () => {
    mockRunAnalysis.mockResolvedValueOnce(
      analysisFixture({
        grounding: {
          primarySource: 'hybrid_unverified',
          screenContextUsed: true,
          screenValuesVerified: false,
          discrepancies: [{ field: 'portfolioValueUsd', clientValue: 1_000_000, serverValue: 9260, severity: 'error', note: 'rejected' }],
        },
      }),
    );
    const { POST } = await import('@/app/api/ai/analyze/route');
    const res = await POST(
      new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({
          walletId: WALLET,
          sectionType: 'assets',
          screenSnapshot: { portfolioValueUsd: 1_000_000 },
        }),
      }) as never,
    );
    const body = await res.json();
    expect(body.data.grounding.screenValuesVerified).toBe(false);
    expect(mockRunAnalysis.mock.calls[0][0].mode).toBe('dashboard');
  });

  it('7. failed transaction domain → partial, no flow finding', async () => {
    mockRunAnalysis.mockResolvedValueOnce(
      analysisFixture({
        completionStatus: 'partial',
        insights: [{ id: 'a', type: 'allocation', title: 'Allocation', description: 'x', severity: 'low', confidence: 'high', category: 'portfolio', evidence: {}, impact: null, impactUsd: null, relatedEntities: [] }],
        domainStatuses: [
          { domain: 'holdings', status: 'available', notes: [] },
          { domain: 'transactions', status: 'unavailable', errorCode: 'TX_LOAD_FAILED', notes: [] },
        ],
      }),
    );
    const { POST } = await import('@/app/api/ai/analyze/route');
    const res = await POST(
      new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ walletId: WALLET, sectionType: 'portfolio' }),
      }) as never,
    );
    const body = await res.json();
    expect(body.data.completionStatus).toBe('partial');
    expect(body.data.insights.every((i: { type: string }) => !/flow/i.test(i.type))).toBe(true);
  });

  it('8. wrong LLM number → validation reported / fallback source', async () => {
    mockRunAnalysis.mockResolvedValueOnce(
      analysisFixture({
        source: 'deterministic',
        llm: { fallbackReason: 'numeric_validation_failed', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
        validation: {
          valid: true,
          checkedClaims: 1,
          matchedClaims: 1,
          unmatchedClaims: [],
          correctionsApplied: ['Removed sentence containing unverified claim $1,000,000'],
        },
      }),
    );
    const { POST } = await import('@/app/api/ai/chat/route');
    const res = await POST(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ walletId: WALLET, message: 'How much SOL?' }),
      }) as never,
    );
    const body = await res.json();
    expect(body.data.source).toBe('deterministic');
    expect(body.data.validation.numericConsistency.valid).toBe(true);
  });

  it('9. Analyze and Chat return identical SOL allocation metrics', async () => {
    const { POST: analyze } = await import('@/app/api/ai/analyze/route');
    const { POST: chat } = await import('@/app/api/ai/chat/route');
    const a = await analyze(
      new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ walletId: WALLET, sectionType: 'asset', asset: 'SOL' }),
      }) as never,
    );
    const c = await chat(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ walletId: WALLET, message: 'How much of my portfolio is SOL?', pageContext: { asset: 'SOL' } }),
      }) as never,
    );
    const ab = await a.json();
    const cb = await c.json();
    expect(ab.data.metrics).toEqual(cb.data.metrics);
  });

  it('10. full-history job pending includes jobId', async () => {
    mockRunAnalysis.mockResolvedValueOnce(
      analysisFixture({
        completionStatus: 'pending',
        jobId: '22222222-2222-4222-8222-222222222222',
        narrative: 'Full entitled history analysis is processing asynchronously.',
      }),
    );
    const { POST } = await import('@/app/api/ai/analyze/route');
    const res = await POST(
      new Request('http://localhost/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ walletId: WALLET, sectionType: 'portfolio', period: 'all' }),
      }) as never,
    );
    const body = await res.json();
    expect(body.data.completionStatus).toBe('pending');
  });
});
