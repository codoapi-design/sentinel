/**
 * Package 3 concurrency / idempotency tests.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  appendAssistantMessage,
  appendUserMessage,
  createConversation,
  persistReasonedAnalysis,
  resetMemoryStoreForTests,
  getMemoryStore,
} from '@/lib/ai/memory';
import type { ReasonedIntelligencePackage } from '@/lib/ai/intelligence-quality/types';
import type { AnalysisScope } from '@/lib/ai/trust/types';

const userId = 'conc-user';
const walletId = '22222222-2222-4222-8222-222222222222';

const scope: AnalysisScope = {
  walletId,
  requestedPeriod: { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
  entitlementScope: {
    allowedFrom: '2025-01-01T00:00:00.000Z',
    allowedTo: '2026-08-01T00:00:00.000Z',
    plan: 'pro',
    limitations: [],
  },
  entityScope: {},
  filters: {},
  source: 'server_database',
  coverage: { status: 'complete', isFullEntitledHistory: true, truncated: false },
  asOf: { holdings: '2026-08-01T00:00:00.000Z' },
};

function pkg(): ReasonedIntelligencePackage {
  return {
    schemaVersion: '1',
    scope,
    domainStatuses: [{ domain: 'holdings', status: 'available', notes: [] }],
    observations: [],
    candidateFindings: [],
    approvedInsights: [
      {
        id: 'sol-concentration',
        type: 'high_asset_dependency',
        category: 'allocation',
        entityIds: ['SOL'],
        priority: { score: 0.7, level: 'high', components: {}, reasons: [] },
        materiality: { score: 0.7, level: 'high', components: {}, reasons: [] },
        significance: { score: 0.6, level: 'significant', components: {}, reasons: [] },
        confidence: 'high',
        reasoningConfidence: 'high',
        evidenceIds: [],
        limitations: [],
      },
    ],
    graph: { nodes: [], edges: [] },
    attribution: {},
    contradictions: [],
    rankedInsightIds: ['sol-concentration'],
    selectedInsightIds: ['sol-concentration'],
    whatMatters: {
      primaryFindingId: 'sol-concentration',
      secondaryFindingIds: [],
      headline: 'SOL concentration',
      whatChanged: 'up',
      whyItMatters: 'risk',
    },
    monitoringPoints: [
      {
        id: 'm1',
        relatedFindingId: 'sol-concentration',
        metric: 'allocation_pct',
        currentValue: 55,
        threshold: 50,
        condition: 'increases_above',
        explanation: 'watch',
      },
    ],
    completionStatus: 'completed',
    limitations: [],
    versions: {
      reasoningEngine: 'r1',
      eligibilityRules: 'e1',
      materialityModel: 'm1',
      significanceModel: 's1',
      rankingModel: 'rk1',
      attributionModel: 'a1',
      behaviorModel: 'b1',
    },
  } as unknown as ReasonedIntelligencePackage;
}

beforeEach(() => {
  resetMemoryStoreForTests();
});

describe('Package 3 concurrency / idempotency', () => {
  it('concurrent identical persists reuse fingerprint and do not double lifecycle', async () => {
    const args = {
      userId,
      walletId,
      mode: 'dashboard',
      analysisType: 'dashboard',
      scope,
      pkg: pkg(),
      pipelineVersion: 'p1',
      responseSchemaVersion: 'r1',
    };
    const [a, b] = await Promise.all([
      persistReasonedAnalysis({ ...args, traceId: 't1' }),
      persistReasonedAnalysis({ ...args, traceId: 't2' }),
    ]);
    expect(a?.analysis.id).toBeTruthy();
    expect(b?.analysis.id).toBe(a?.analysis.id);
    expect(a?.reused || b?.reused).toBe(true);
    const lives = await getMemoryStore().listLifecycles(userId, walletId);
    expect(lives).toHaveLength(1);
    expect(lives[0]!.occurrenceCount).toBe(1);
    const timeline = await getMemoryStore().listTimeline(userId, walletId, 20);
    const dedup = new Set(timeline.map(t => `${t.eventType}:${t.lifecycleKey}:${t.analysisId}`));
    expect(dedup.size).toBe(timeline.length);
  });

  it('worker-style retry with same fingerprint does not duplicate monitoring', async () => {
    const args = {
      userId,
      walletId,
      mode: 'dashboard',
      analysisType: 'dashboard',
      scope,
      pkg: pkg(),
      traceId: 'retry-1',
      pipelineVersion: 'p1',
      responseSchemaVersion: 'r1',
    };
    const first = await persistReasonedAnalysis(args);
    const second = await persistReasonedAnalysis({ ...args, traceId: 'retry-2' });
    expect(second?.reused).toBe(true);
    expect(second?.analysis.id).toBe(first?.analysis.id);
    const mons = await getMemoryStore().listMonitoringStates(userId, walletId);
    expect(mons.length).toBeLessThanOrEqual(1);
  });

  it('chat message append is sequential and countable', async () => {
    const conv = await createConversation({ userId, walletId, title: 'c' });
    await appendUserMessage({ conversationId: conv.id, userId, content: 'hi' });
    await appendAssistantMessage({ conversationId: conv.id, userId, content: 'hello' });
    await appendUserMessage({ conversationId: conv.id, userId, content: 'hi' });
    const messages = await getMemoryStore().listMessages(conv.id, userId, 50);
    expect(messages).toHaveLength(3);
  });
});
