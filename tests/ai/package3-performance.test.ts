/**
 * Package 3 bounded retrieval performance / pagination tests.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  MEMORY_DEFAULTS,
  getMemoryStore,
  loadMemoryContext,
  planMemoryRetrieval,
  resetMemoryStoreForTests,
  type IntelligenceTimelineEvent,
  type InsightLifecycleRecord,
  type PersistedReasonedAnalysis,
} from '@/lib/ai/memory';
import { scoreConfidence } from '@/lib/ai/intelligence-quality/confidence-util';

const userId = 'perf-user';
const walletId = '11111111-1111-4111-8111-111111111111';

function analysis(i: number): PersistedReasonedAnalysis {
  const id = randomUUID();
  return {
    id,
    userId,
    walletId,
    analysisType: 'dashboard',
    analysisLevel: 'wallet',
    scope: {
      walletId,
      requestedPeriod: { from: '2026-01-01', to: '2026-08-01' },
      entitlementScope: {
        allowedFrom: '2025-01-01',
        allowedTo: '2026-08-01',
        plan: 'pro',
        limitations: [],
      },
      entityScope: {},
      filters: {},
      source: 'server_database',
      coverage: { status: 'complete', isFullEntitledHistory: true, truncated: false },
      asOf: {},
    },
    completionStatus: 'completed',
    whatMatters: {
      primaryFindingId: null,
      secondaryFindingIds: [],
      headline: `Analysis ${i}`,
      whatChanged: 'x',
      whyItMatters: 'y',
    },
    approvedInsights: [],
    monitoringPoints: [],
    attribution: {},
    domainStatuses: [],
    limitations: [],
    eligibleFindingKeys: [],
    versions: {
      pipelineVersion: '1',
      responseSchemaVersion: '1',
      reasoningEngine: 'r1',
      eligibilityRules: 'e1',
      rankingModel: 'rank1',
      attributionModel: 'a1',
      memoryModel: 'm1',
    },
    dataAsOf: {},
    fingerprint: `fp-${i}-${id}`,
    traceId: `t-${i}`,
    createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 28))).toISOString(),
  };
}

beforeEach(() => {
  resetMemoryStoreForTests();
});

describe('Package 3 performance bounds', () => {
  it('conversation recent window stays bounded at 1k messages', async () => {
    const store = getMemoryStore();
    const conv = await store.createConversation({
      id: randomUUID(),
      userId,
      walletId,
      title: 'perf',
      channel: 'web',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    });
    for (let i = 0; i < 1000; i++) {
      await store.addMessage({
        id: randomUUID(),
        conversationId: conv.id,
        userId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `msg ${i}`,
        createdAt: new Date().toISOString(),
        metadata: { source: 'server' },
      });
    }
    const t0 = Date.now();
    const recent = await store.listMessages(conv.id, userId, MEMORY_DEFAULTS.recentMessageLimit);
    const ms = Date.now() - t0;
    expect(recent).toHaveLength(MEMORY_DEFAULTS.recentMessageLimit);
    expect(recent[0]?.content).toContain('msg');
    expect(ms).toBeLessThan(500);
  });

  it('selects previous analyses with hard limit (100 present)', async () => {
    const store = getMemoryStore();
    for (let i = 0; i < 100; i++) await store.saveAnalysis(analysis(i));
    const t0 = Date.now();
    const plan = planMemoryRetrieval({
      question: 'what changed since last time',
      mode: 'dashboard',
      walletId,
      analysisType: 'dashboard',
    });
    const bundle = await loadMemoryContext({ userId, plan, walletId });
    const ms = Date.now() - t0;
    expect(bundle.previousAnalyses.length).toBeLessThanOrEqual(
      plan.tokenBudget.maxHistoricalAnalyses,
    );
    expect(bundle.charactersUsed).toBeLessThanOrEqual(plan.tokenBudget.maxCharacters);
    expect(ms).toBeLessThan(1000);
  });

  it('lifecycle resolution stays indexed by key with 1000 records', async () => {
    const store = getMemoryStore();
    const rows: InsightLifecycleRecord[] = [];
    for (let i = 0; i < 1000; i++) {
      rows.push({
        id: randomUUID(),
        userId,
        walletId,
        lifecycleKey: `wallet:${walletId}:asset:TOK${i}:type:x:scope:s`,
        findingType: 'x',
        category: 'portfolio',
        entityRefs: [],
        state: 'stable',
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
        occurrenceCount: 1,
        consecutiveOccurrenceCount: 1,
        change: { observedValueChanges: {} },
        memoryVersion: 'v1',
        updatedAt: new Date().toISOString(),
      });
    }
    await store.upsertLifecycles(rows);
    const t0 = Date.now();
    const listed = await store.listLifecycles(userId, walletId);
    const byKey = new Map(listed.map(l => [l.lifecycleKey, l]));
    expect(byKey.size).toBe(1000);
    expect(byKey.get(rows[500]!.lifecycleKey)?.state).toBe('stable');
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('timeline first page is bounded among 10k events', async () => {
    const store = getMemoryStore();
    const events: IntelligenceTimelineEvent[] = [];
    for (let i = 0; i < 10_000; i++) {
      events.push({
        id: randomUUID(),
        userId,
        walletId,
        eventType: i % 2 === 0 ? 'insight_new' : 'insight_worsened',
        analysisId: randomUUID(),
        title: `e${i}`,
        summary: 's',
        priority: 0.5,
        confidence: scoreConfidence({ sample: 50, historical: 50 }),
        evidenceIds: [],
        occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 60)).toISOString(),
      });
    }
    // Chunk inserts to avoid huge sync loops blocking the event loop too long in CI.
    for (let i = 0; i < events.length; i += 500) {
      await store.addTimelineEvents(events.slice(i, i + 500));
    }
    const t0 = Date.now();
    const page = await store.listTimeline(userId, walletId, 50);
    expect(page).toHaveLength(50);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
