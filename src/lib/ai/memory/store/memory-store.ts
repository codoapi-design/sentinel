/**
 * Injectable memory store — in-memory for tests, Supabase for production.
 */

import type {
  AiConversation,
  AiConversationMessage,
  AiConversationSummary,
  AiUserPreference,
  InsightLifecycleRecord,
  IntelligenceTimelineEvent,
  MonitoringPointState,
  PersistedInsightSnapshot,
  PersistedReasonedAnalysis,
} from '../types';
import { SupabaseMemoryStore } from './supabase-store';

export interface MemoryStore {
  // conversations
  createConversation(row: AiConversation): Promise<AiConversation>;
  getConversation(id: string, userId: string): Promise<AiConversation | null>;
  listConversations(userId: string): Promise<AiConversation[]>;
  updateConversation(
    id: string,
    userId: string,
    patch: Partial<Pick<AiConversation, 'title' | 'status' | 'lastMessageAt' | 'metadata' | 'updatedAt'>>,
  ): Promise<AiConversation | null>;
  deleteConversation(id: string, userId: string): Promise<boolean>;

  addMessage(row: AiConversationMessage): Promise<AiConversationMessage>;
  listMessages(conversationId: string, userId: string, limit?: number): Promise<AiConversationMessage[]>;
  saveSummary(row: AiConversationSummary): Promise<AiConversationSummary>;
  getLatestSummary(conversationId: string): Promise<AiConversationSummary | null>;

  // preferences
  upsertPreference(row: AiUserPreference): Promise<AiUserPreference>;
  listPreferences(userId: string): Promise<AiUserPreference[]>;
  deactivatePreference(userId: string, key: string): Promise<boolean>;

  // analyses
  findAnalysisByFingerprint(userId: string, fingerprint: string): Promise<PersistedReasonedAnalysis | null>;
  saveAnalysis(row: PersistedReasonedAnalysis): Promise<PersistedReasonedAnalysis>;
  getAnalysis(id: string, userId: string): Promise<PersistedReasonedAnalysis | null>;
  listAnalyses(userId: string, walletId: string, limit?: number): Promise<PersistedReasonedAnalysis[]>;
  saveSnapshots(rows: PersistedInsightSnapshot[]): Promise<void>;

  // lifecycle / timeline
  listLifecycles(userId: string, walletId: string): Promise<InsightLifecycleRecord[]>;
  upsertLifecycles(rows: InsightLifecycleRecord[]): Promise<void>;
  listMonitoringStates(userId: string, walletId: string): Promise<MonitoringPointState[]>;
  upsertMonitoringStates(rows: MonitoringPointState[]): Promise<void>;
  addTimelineEvents(rows: IntelligenceTimelineEvent[]): Promise<void>;
  listTimeline(userId: string, walletId: string, limit?: number): Promise<IntelligenceTimelineEvent[]>;

  // privacy
  deleteWalletAiHistory(userId: string, walletId: string): Promise<void>;
  deleteUserAiHistory(userId: string): Promise<void>;
}

class InMemoryMemoryStore implements MemoryStore {
  conversations = new Map<string, AiConversation>();
  messages = new Map<string, AiConversationMessage[]>();
  summaries = new Map<string, AiConversationSummary[]>();
  preferences = new Map<string, AiUserPreference[]>();
  analyses = new Map<string, PersistedReasonedAnalysis>();
  snapshots = new Map<string, PersistedInsightSnapshot[]>();
  lifecycles = new Map<string, InsightLifecycleRecord>();
  monitoringStates = new Map<string, MonitoringPointState>();
  timeline: IntelligenceTimelineEvent[] = [];

  async createConversation(row: AiConversation) {
    this.conversations.set(row.id, row);
    this.messages.set(row.id, []);
    return row;
  }
  async getConversation(id: string, userId: string) {
    const c = this.conversations.get(id);
    if (!c || c.userId !== userId || c.status === 'deleted') return null;
    return c;
  }
  async listConversations(userId: string) {
    return [...this.conversations.values()]
      .filter(c => c.userId === userId && c.status !== 'deleted')
      .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  }
  async updateConversation(id: string, userId: string, patch: Partial<AiConversation>) {
    const c = await this.getConversation(id, userId);
    if (!c) return null;
    const next = { ...c, ...patch, id: c.id, userId: c.userId };
    this.conversations.set(id, next);
    return next;
  }
  async deleteConversation(id: string, userId: string) {
    const c = await this.getConversation(id, userId);
    if (!c) return false;
    this.conversations.set(id, { ...c, status: 'deleted', updatedAt: new Date().toISOString() });
    return true;
  }
  async addMessage(row: AiConversationMessage) {
    const list = this.messages.get(row.conversationId) ?? [];
    list.push(row);
    this.messages.set(row.conversationId, list);
    const c = this.conversations.get(row.conversationId);
    if (c) {
      this.conversations.set(row.conversationId, {
        ...c,
        lastMessageAt: row.createdAt,
        updatedAt: row.createdAt,
      });
    }
    return row;
  }
  async listMessages(conversationId: string, userId: string, limit = 100) {
    const c = await this.getConversation(conversationId, userId);
    if (!c) return [];
    const list = this.messages.get(conversationId) ?? [];
    return list.slice(-limit);
  }
  async saveSummary(row: AiConversationSummary) {
    const list = this.summaries.get(row.conversationId) ?? [];
    list.push(row);
    this.summaries.set(row.conversationId, list);
    return row;
  }
  async getLatestSummary(conversationId: string) {
    const list = this.summaries.get(conversationId) ?? [];
    return list[list.length - 1] ?? null;
  }
  async upsertPreference(row: AiUserPreference) {
    const list = (this.preferences.get(row.userId) ?? []).filter(
      p => !(p.key === row.key && p.active),
    );
    list.push(row);
    this.preferences.set(row.userId, list);
    return row;
  }
  async listPreferences(userId: string) {
    return (this.preferences.get(userId) ?? []).filter(p => p.active);
  }
  async deactivatePreference(userId: string, key: string) {
    const list = this.preferences.get(userId) ?? [];
    let ok = false;
    this.preferences.set(
      userId,
      list.map(p => {
        if (p.key === key && p.active) {
          ok = true;
          return { ...p, active: false };
        }
        return p;
      }),
    );
    return ok;
  }
  async findAnalysisByFingerprint(userId: string, fingerprint: string) {
    return (
      [...this.analyses.values()].find(a => a.userId === userId && a.fingerprint === fingerprint) ??
      null
    );
  }
  async saveAnalysis(row: PersistedReasonedAnalysis) {
    this.analyses.set(row.id, row);
    return row;
  }
  async getAnalysis(id: string, userId: string) {
    const a = this.analyses.get(id);
    if (!a || a.userId !== userId) return null;
    return a;
  }
  async listAnalyses(userId: string, walletId: string, limit = 20) {
    return [...this.analyses.values()]
      .filter(a => a.userId === userId && a.walletId === walletId)
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      .slice(0, limit);
  }
  async saveSnapshots(rows: PersistedInsightSnapshot[]) {
    for (const r of rows) {
      const list = this.snapshots.get(r.analysisId) ?? [];
      list.push(r);
      this.snapshots.set(r.analysisId, list);
    }
  }
  async listLifecycles(userId: string, walletId: string) {
    return [...this.lifecycles.values()].filter(l => l.userId === userId && l.walletId === walletId);
  }
  async upsertLifecycles(rows: InsightLifecycleRecord[]) {
    for (const r of rows) {
      this.lifecycles.set(`${r.userId}:${r.walletId}:${r.lifecycleKey}`, r);
    }
  }
  async listMonitoringStates(userId: string, walletId: string) {
    return [...this.monitoringStates.values()].filter(
      state => state.userId === userId && state.walletId === walletId,
    );
  }
  async upsertMonitoringStates(rows: MonitoringPointState[]) {
    for (const row of rows) {
      this.monitoringStates.set(`${row.userId}:${row.walletId}:${row.monitoringKey}`, row);
    }
  }
  async addTimelineEvents(rows: IntelligenceTimelineEvent[]) {
    for (const r of rows) {
      const dup = this.timeline.some(
        t =>
          t.walletId === r.walletId &&
          t.analysisId === r.analysisId &&
          t.eventType === r.eventType &&
          (t.lifecycleKey ?? '') === (r.lifecycleKey ?? ''),
      );
      if (!dup) this.timeline.push(r);
    }
  }
  async listTimeline(userId: string, walletId: string, limit = 50) {
    return this.timeline
      .filter(t => t.userId === userId && t.walletId === walletId)
      .sort((a, b) => (b.occurredAt > a.occurredAt ? 1 : -1))
      .slice(0, limit);
  }
  async deleteWalletAiHistory(userId: string, walletId: string) {
    for (const [id, a] of this.analyses) {
      if (a.userId === userId && a.walletId === walletId) this.analyses.delete(id);
    }
    for (const [k, l] of this.lifecycles) {
      if (l.userId === userId && l.walletId === walletId) this.lifecycles.delete(k);
    }
    for (const [k, state] of this.monitoringStates) {
      if (state.userId === userId && state.walletId === walletId) this.monitoringStates.delete(k);
    }
    this.timeline = this.timeline.filter(t => !(t.userId === userId && t.walletId === walletId));
    for (const [id, c] of this.conversations) {
      if (c.userId === userId && c.walletId === walletId) {
        this.conversations.set(id, { ...c, status: 'deleted' });
      }
    }
  }
  async deleteUserAiHistory(userId: string) {
    for (const [id, c] of this.conversations) {
      if (c.userId === userId) this.conversations.set(id, { ...c, status: 'deleted' });
    }
    this.preferences.delete(userId);
    for (const [id, a] of this.analyses) {
      if (a.userId === userId) this.analyses.delete(id);
    }
    for (const [k, l] of this.lifecycles) {
      if (l.userId === userId) this.lifecycles.delete(k);
    }
    for (const [k, state] of this.monitoringStates) {
      if (state.userId === userId) this.monitoringStates.delete(k);
    }
    this.timeline = this.timeline.filter(t => t.userId !== userId);
  }
}

/** Survive Next.js route-module duplication (separate webpack chunks). */
const GLOBAL_KEY = '__radareum_ai_memory_store__';

type GlobalMemory = typeof globalThis & {
  [GLOBAL_KEY]?: MemoryStore;
};

function isTestRuntime(): boolean {
  return (
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test' ||
    process.env.AI_MEMORY_STORE === 'memory' ||
    process.env.ENABLE_E2E_FIXTURES === '1'
  );
}

export function resetMemoryStoreForTests(): InMemoryMemoryStore {
  const store = new InMemoryMemoryStore();
  (globalThis as GlobalMemory)[GLOBAL_KEY] = store;
  return store;
}

export function getMemoryStore(): MemoryStore {
  const g = globalThis as GlobalMemory;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = isTestRuntime() ? new InMemoryMemoryStore() : new SupabaseMemoryStore();
  }
  return g[GLOBAL_KEY]!;
}

/** Inject a store (tests / local overrides). */
export function useMemoryStore(store: MemoryStore): void {
  (globalThis as GlobalMemory)[GLOBAL_KEY] = store;
}
