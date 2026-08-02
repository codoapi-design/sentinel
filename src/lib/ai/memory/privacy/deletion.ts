import { getMemoryStore } from '../store/memory-store';

export async function deleteConversationForUser(userId: string, conversationId: string) {
  return getMemoryStore().deleteConversation(conversationId, userId);
}

export async function deleteWalletAiHistory(userId: string, walletId: string) {
  await getMemoryStore().deleteWalletAiHistory(userId, walletId);
}

export async function deleteAllUserAiMemory(userId: string) {
  await getMemoryStore().deleteUserAiHistory(userId);
}

export async function exportUserAiMemory(userId: string, walletId?: string) {
  const store = getMemoryStore();
  const conversations = await store.listConversations(userId);
  const preferences = await store.listPreferences(userId);
  const analyses = walletId
    ? await store.listAnalyses(userId, walletId, 100)
    : (
        await Promise.all(
          conversations
            .filter(c => c.walletId)
            .map(c => store.listAnalyses(userId, c.walletId!, 20)),
        )
      ).flat();
  const timeline = walletId ? await store.listTimeline(userId, walletId, 200) : [];
  const lifecycles = walletId ? await store.listLifecycles(userId, walletId) : [];

  return {
    exportedAt: new Date().toISOString(),
    userId,
    conversations: conversations.map(c => ({
      id: c.id,
      title: c.title,
      walletId: c.walletId,
      status: c.status,
      updatedAt: c.updatedAt,
    })),
    preferences: preferences.map(p => ({
      key: p.key,
      value: p.value,
      source: p.source,
    })),
    analyses: analyses.map(a => ({
      id: a.id,
      walletId: a.walletId,
      createdAt: a.createdAt,
      headline: a.whatMatters.headline,
      completionStatus: a.completionStatus,
      versions: a.versions,
    })),
    lifecycles: lifecycles.map(l => ({
      lifecycleKey: l.lifecycleKey,
      state: l.state,
      occurrenceCount: l.occurrenceCount,
    })),
    timeline: timeline.map(t => ({
      id: t.id,
      eventType: t.eventType,
      title: t.title,
      occurredAt: t.occurredAt,
    })),
  };
}
