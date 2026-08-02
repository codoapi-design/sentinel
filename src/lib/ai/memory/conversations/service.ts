import { randomUUID } from 'node:crypto';

import { MEMORY_DEFAULTS, MEMORY_MODEL_VERSIONS } from '../config';
import { getMemoryStore } from '../store/memory-store';
import type { AiConversation, AiConversationMessage, AiConversationSummary } from '../types';

export async function createConversation(input: {
  userId: string;
  walletId?: string | null;
  title?: string;
  channel?: AiConversation['channel'];
}): Promise<AiConversation> {
  const now = new Date().toISOString();
  const row: AiConversation = {
    id: randomUUID(),
    userId: input.userId,
    walletId: input.walletId ?? null,
    title: input.title ?? 'New conversation',
    channel: input.channel ?? 'web',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    metadata: {},
  };
  return getMemoryStore().createConversation(row);
}

export async function ensureConversation(input: {
  userId: string;
  conversationId?: string | null;
  walletId?: string | null;
}): Promise<AiConversation> {
  if (input.conversationId) {
    const existing = await getMemoryStore().getConversation(input.conversationId, input.userId);
    if (existing) return existing;
  }
  return createConversation({
    userId: input.userId,
    walletId: input.walletId,
  });
}

export async function appendUserMessage(input: {
  conversationId: string;
  userId: string;
  content: string;
  traceId?: string;
  metadata?: AiConversationMessage['metadata'];
}): Promise<AiConversationMessage> {
  const row: AiConversationMessage = {
    id: randomUUID(),
    conversationId: input.conversationId,
    userId: input.userId,
    role: 'user',
    content: input.content,
    traceId: input.traceId ?? null,
    createdAt: new Date().toISOString(),
    metadata: { source: 'server', ...input.metadata },
  };
  return getMemoryStore().addMessage(row);
}

export async function appendAssistantMessage(input: {
  conversationId: string;
  userId: string;
  content: string;
  relatedAnalysisId?: string | null;
  traceId?: string;
  metadata?: AiConversationMessage['metadata'];
}): Promise<AiConversationMessage> {
  const row: AiConversationMessage = {
    id: randomUUID(),
    conversationId: input.conversationId,
    userId: input.userId,
    role: 'assistant',
    content: input.content,
    relatedAnalysisId: input.relatedAnalysisId ?? null,
    traceId: input.traceId ?? null,
    createdAt: new Date().toISOString(),
    metadata: { source: 'server', ...input.metadata },
  };
  return getMemoryStore().addMessage(row);
}

export async function loadRecentMessages(
  conversationId: string,
  userId: string,
  limit: number = MEMORY_DEFAULTS.recentMessageLimit,
): Promise<AiConversationMessage[]> {
  return getMemoryStore().listMessages(conversationId, userId, limit);
}

/** Deterministic structured summary — no LLM required. */
export function buildDeterministicSummary(
  messages: AiConversationMessage[],
): AiConversationSummary['summary'] {
  const userMsgs = messages.filter(m => m.role === 'user');
  const assistant = messages.filter(m => m.role === 'assistant');
  const entities = new Map<string, { type: string; symbol?: string }>();
  const entityRe = /\b(SOL|ETH|BTC|USDC|USDT|[A-Z]{2,6})\b/g;
  for (const m of messages) {
    for (const hit of m.content.matchAll(entityRe)) {
      entities.set(hit[1], { type: 'asset', symbol: hit[1] });
    }
  }
  const unresolved = userMsgs
    .slice(-3)
    .filter(m => /\?|why|how|what/i.test(m.content))
    .map(m => m.content.slice(0, 200));

  return {
    userGoals: userMsgs.slice(0, 5).map(m => m.content.slice(0, 160)),
    confirmedPreferences: [],
    discussedEntities: [...entities.values()],
    unresolvedQuestions: unresolved,
    priorConclusions: assistant.slice(-3).map(m => ({
      findingType: 'prior_assistant_conclusion',
      historicalOnly: true as const,
      analysisId: m.relatedAnalysisId ?? undefined,
    })),
  };
}

export async function maybeSummarizeConversation(
  conversationId: string,
  userId: string,
): Promise<AiConversationSummary | null> {
  const store = getMemoryStore();
  const all = await store.listMessages(conversationId, userId, 500);
  if (all.length < MEMORY_DEFAULTS.summaryTriggerMessageCount) return null;
  const coveredUntil = all[all.length - MEMORY_DEFAULTS.recentMessageLimit - 1];
  if (!coveredUntil) return null;
  const older = all.slice(0, all.length - MEMORY_DEFAULTS.recentMessageLimit);
  const summary: AiConversationSummary = {
    id: randomUUID(),
    conversationId,
    summaryVersion: MEMORY_MODEL_VERSIONS.conversationSummary,
    coveredUntilMessageId: coveredUntil.id,
    coveredMessageCount: older.length,
    summary: buildDeterministicSummary(older),
    createdAt: new Date().toISOString(),
  };
  return store.saveSummary(summary);
}
