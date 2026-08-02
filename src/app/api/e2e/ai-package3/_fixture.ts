import { randomUUID } from 'node:crypto';

import type { ReasonedIntelligencePackage } from '@/lib/ai/intelligence-quality/types';
import {
  appendAssistantMessage,
  appendUserMessage,
  getMemoryStore,
  isTemporaryStyleRequest,
  persistReasonedAnalysis,
  resetMemoryStoreForTests,
  upsertExplicitPreference,
} from '@/lib/ai/memory';
import type { AnalysisScope } from '@/lib/ai/trust/types';

export const fixtureUserId = 'e2e-package3-user';
export const fixtureWalletId = '11111111-1111-4111-8111-111111111111';

/** Persist active fixture conversation id on the store via a marker preference. */
const CONV_MARKER_KEY = 'default_wallet' as const;

export function enabled() {
  return process.env.ENABLE_E2E_FIXTURES === '1';
}

const scope: AnalysisScope = {
  walletId: fixtureWalletId,
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

function pkg(label: 'A' | 'B' | 'C'): ReasonedIntelligencePackage {
  const priority = label === 'A' ? 0.55 : label === 'B' ? 0.72 : 0.86;
  const allocation = label === 'A' ? 55 : label === 'B' ? 62 : 71;
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
        priority: { score: priority, level: 'high', components: {}, reasons: [] },
        materiality: { score: priority, level: 'high', components: {}, reasons: [] },
        significance: { score: 0.7, level: 'significant', components: {}, reasons: [] },
        confidence: 'high',
        reasoningConfidence: 'high',
        evidenceIds: [],
        limitations: [],
        observedValues: { allocation_pct: allocation },
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
      headline:
        label === 'A'
          ? 'SOL concentration needs attention'
          : label === 'B'
            ? 'SOL concentration increased'
            : 'SOL concentration worsened',
      whatChanged: `Analysis ${label}`,
      whyItMatters: 'Concentration increases risk.',
    },
    monitoringPoints: [
      {
        id: 'mon-sol',
        relatedFindingId: 'sol-concentration',
        metric: 'allocation_pct',
        currentValue: allocation,
        threshold: 50,
        condition: 'increases_above',
        explanation: 'Watch SOL allocation',
      },
    ],
    completionStatus: 'completed',
    limitations: [],
    versions: {
      reasoningEngine: 'fixture-v1',
      eligibilityRules: 'fixture-v1',
      materialityModel: 'fixture-v1',
      significanceModel: 'fixture-v1',
      rankingModel: 'fixture-v1',
      attributionModel: 'fixture-v1',
      behaviorModel: 'fixture-v1',
    },
  } as unknown as ReasonedIntelligencePackage;
}

async function activeConversationId(): Promise<string | null> {
  const store = getMemoryStore();
  const conversations = await store.listConversations(fixtureUserId);
  const active = conversations.find(c => c.status === 'active') ?? conversations[0];
  return active?.id ?? null;
}

export async function persist(label: 'A' | 'B' | 'C') {
  return persistReasonedAnalysis({
    userId: fixtureUserId,
    walletId: fixtureWalletId,
    mode: 'dashboard',
    analysisType: 'wallet_overview',
    scope,
    pkg: pkg(label),
    traceId: `fixture-${label}-${randomUUID()}`,
    pipelineVersion: 'fixture-v1',
    responseSchemaVersion: 'fixture-v1',
    forcePersist: true,
  });
}

export async function seed() {
  resetMemoryStoreForTests();
  const store = getMemoryStore();
  const now = new Date().toISOString();
  const conversation = await store.createConversation({
    id: randomUUID(),
    userId: fixtureUserId,
    walletId: fixtureWalletId,
    title: 'Fixture conversation',
    channel: 'web',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    metadata: {},
  });
  await appendUserMessage({
    conversationId: conversation.id,
    userId: fixtureUserId,
    content: 'How is SOL doing?',
  });
  await appendAssistantMessage({
    conversationId: conversation.id,
    userId: fixtureUserId,
    content: 'SOL concentration is being monitored.',
  });
  await persist('A');
  await persist('B');
  await persist('C');
  await upsertExplicitPreference({
    userId: fixtureUserId,
    key: 'response_style',
    value: 'concise',
  });
  // Marker so other route chunks can discover the conversation without module locals.
  await upsertExplicitPreference({
    userId: fixtureUserId,
    key: CONV_MARKER_KEY,
    value: fixtureWalletId,
  });
  return conversation;
}

export async function state() {
  const store = getMemoryStore();
  const conversations = await store.listConversations(fixtureUserId);
  const conversationId = await activeConversationId();
  const messages = conversationId
    ? await store.listMessages(conversationId, fixtureUserId, 100)
    : [];
  return {
    conversations,
    messages,
    conversationId,
    analyses: await store.listAnalyses(fixtureUserId, fixtureWalletId),
    lifecycle: await store.listLifecycles(fixtureUserId, fixtureWalletId),
    timeline: await store.listTimeline(fixtureUserId, fixtureWalletId),
    preferences: await store.listPreferences(fixtureUserId),
    monitoring: await store.listMonitoringStates(fixtureUserId, fixtureWalletId),
  };
}

export async function chatTurn(content = 'Persist this server-side turn.') {
  let conversationId = await activeConversationId();
  if (!conversationId) {
    await seed();
    conversationId = await activeConversationId();
  }
  if (!conversationId) throw new Error('No fixture conversation');
  await appendUserMessage({
    conversationId,
    userId: fixtureUserId,
    content,
  });
  await appendAssistantMessage({
    conversationId,
    userId: fixtureUserId,
    content: `Saved reply: ${content}`,
  });
}

export async function deleteConversation() {
  const conversationId = await activeConversationId();
  if (!conversationId) return false;
  return getMemoryStore().deleteConversation(conversationId, fixtureUserId);
}

export function evaluateTemporaryStyle(message: string) {
  return { temporary: isTemporaryStyleRequest(message), persisted: false };
}
