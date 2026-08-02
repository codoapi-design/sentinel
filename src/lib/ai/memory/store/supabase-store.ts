/**
 * Supabase (service-role) adapter for Package 3 memory persistence.
 */

import { createServerClient } from '@/lib/supabase/server';

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
import type { MemoryStore } from './memory-store';

function db() {
  return createServerClient();
}

function mapConversation(row: Record<string, unknown>): AiConversation {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    walletId: (row.wallet_id as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    channel: row.channel as AiConversation['channel'],
    status: row.status as AiConversation['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    metadata: (row.metadata as AiConversation['metadata']) ?? {},
  };
}

function mapMessage(row: Record<string, unknown>): AiConversationMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    userId: String(row.user_id),
    role: row.role as AiConversationMessage['role'],
    content: String(row.content),
    relatedAnalysisId: (row.related_analysis_id as string | null) ?? null,
    traceId: (row.trace_id as string | null) ?? null,
    createdAt: String(row.created_at),
    metadata: (row.metadata as AiConversationMessage['metadata']) ?? {},
  };
}

function mapPreference(row: Record<string, unknown>): AiUserPreference {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    key: row.key as AiUserPreference['key'],
    value: row.value,
    source: row.source as AiUserPreference['source'],
    confidence: Number(row.confidence ?? 1),
    firstObservedAt: String(row.first_observed_at),
    lastConfirmedAt: (row.last_confirmed_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    active: Boolean(row.active),
  };
}

function mapAnalysis(row: Record<string, unknown>, snapshots: PersistedInsightSnapshot[] = []): PersistedReasonedAnalysis {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    walletId: String(row.wallet_id),
    conversationId: (row.conversation_id as string | null) ?? null,
    parentAnalysisId: (row.parent_analysis_id as string | null) ?? null,
    jobId: (row.job_id as string | null) ?? null,
    analysisType: String(row.analysis_type),
    analysisLevel: (row.analysis_level as PersistedReasonedAnalysis['analysisLevel']) ?? 'wallet',
    scope: row.scope as PersistedReasonedAnalysis['scope'],
    completionStatus: String(row.completion_status),
    whatMatters: row.what_matters as PersistedReasonedAnalysis['whatMatters'],
    approvedInsights: snapshots,
    monitoringPoints: (row.monitoring_points as PersistedReasonedAnalysis['monitoringPoints']) ?? [],
    attribution: row.attribution as PersistedReasonedAnalysis['attribution'],
    domainStatuses: (row.domain_statuses as PersistedReasonedAnalysis['domainStatuses']) ?? [],
    limitations: (row.limitations as string[]) ?? [],
    eligibleFindingKeys: (row.eligible_finding_keys as string[]) ?? [],
    versions: row.versions as PersistedReasonedAnalysis['versions'],
    dataAsOf: (row.data_as_of as PersistedReasonedAnalysis['dataAsOf']) ?? {},
    fingerprint: String(row.fingerprint ?? ''),
    traceId: String(row.trace_id),
    createdAt: String(row.created_at),
  };
}

function mapSnapshot(row: Record<string, unknown>): PersistedInsightSnapshot {
  return {
    snapshotId: String(row.id),
    analysisId: String(row.analysis_id),
    lifecycleKey: String(row.lifecycle_key),
    findingId: String(row.finding_id),
    findingType: String(row.finding_type),
    category: String(row.category),
    entityRefs: (row.entity_refs as PersistedInsightSnapshot['entityRefs']) ?? [],
    priorityScore: Number(row.priority_score ?? 0),
    priorityLevel: String(row.priority_level ?? 'medium'),
    materialityScore: Number(row.materiality_score ?? 0),
    significanceScore: Number(row.significance_score ?? 0),
    confidence: row.confidence as PersistedInsightSnapshot['confidence'],
    reasoningConfidence: row.reasoning_confidence as PersistedInsightSnapshot['reasoningConfidence'],
    evidenceIds: (row.evidence_ids as string[]) ?? [],
    limitations: (row.limitations as string[]) ?? [],
    observedValues: (row.observed_values as PersistedInsightSnapshot['observedValues']) ?? {},
    selected: Boolean(row.selected),
    eligibleButNotSelected: Boolean(row.eligible_but_not_selected),
    createdAt: String(row.created_at),
  };
}

function mapLifecycle(row: Record<string, unknown>): InsightLifecycleRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    walletId: String(row.wallet_id),
    lifecycleKey: String(row.lifecycle_key),
    findingType: String(row.finding_type),
    category: String(row.category),
    entityRefs: (row.entity_refs as InsightLifecycleRecord['entityRefs']) ?? [],
    state: row.state as InsightLifecycleRecord['state'],
    firstDetectedAt: String(row.first_detected_at),
    lastDetectedAt: String(row.last_detected_at),
    resolvedAt: (row.resolved_at as string | null) ?? null,
    occurrenceCount: Number(row.occurrence_count ?? 1),
    consecutiveOccurrenceCount: Number(row.consecutive_occurrence_count ?? 1),
    currentSnapshotId: (row.current_snapshot_id as string | null) ?? null,
    previousSnapshotId: (row.previous_snapshot_id as string | null) ?? null,
    currentPriorityScore: row.current_priority_score == null ? null : Number(row.current_priority_score),
    previousPriorityScore:
      row.previous_priority_score == null ? null : Number(row.previous_priority_score),
    currentMaterialityScore:
      row.current_materiality_score == null ? null : Number(row.current_materiality_score),
    previousMaterialityScore:
      row.previous_materiality_score == null ? null : Number(row.previous_materiality_score),
    change: (row.change as InsightLifecycleRecord['change']) ?? { observedValueChanges: {} },
    supersededByLifecycleKey: (row.superseded_by_lifecycle_key as string | null) ?? null,
    memoryVersion: String(row.memory_version ?? 'lifecycle-transition-v1'),
    updatedAt: String(row.updated_at),
  };
}

function mapMonitoringState(row: Record<string, unknown>): MonitoringPointState {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    walletId: String(row.wallet_id),
    monitoringKey: String(row.monitoring_key),
    lifecycleKey: (row.lifecycle_key as string | null) ?? null,
    analysisId: (row.analysis_id as string | null) ?? null,
    metric: String(row.metric),
    state: row.state as MonitoringPointState['state'],
    currentValue: row.current_value == null ? null : Number(row.current_value),
    threshold: row.threshold == null ? null : Number(row.threshold),
    explanation: String(row.explanation ?? ''),
    lastAnalysisId: (row.last_analysis_id as string | null) ?? null,
    updatedAt: String(row.updated_at),
    createdAt: String(row.created_at),
  };
}

function mapTimeline(row: Record<string, unknown>): IntelligenceTimelineEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    walletId: String(row.wallet_id),
    eventType: row.event_type as IntelligenceTimelineEvent['eventType'],
    lifecycleKey: (row.lifecycle_key as string | undefined) ?? undefined,
    analysisId: String(row.analysis_id),
    title: String(row.title),
    summary: String(row.summary),
    priority: Number(row.priority ?? 0),
    confidence: row.confidence as IntelligenceTimelineEvent['confidence'],
    evidenceIds: (row.evidence_ids as string[]) ?? [],
    occurredAt: String(row.occurred_at),
  };
}

export class SupabaseMemoryStore implements MemoryStore {
  async createConversation(row: AiConversation): Promise<AiConversation> {
    const { data, error } = await db()
      .from('ai_conversations' as never)
      .insert({
        id: row.id,
        user_id: row.userId,
        wallet_id: row.walletId,
        title: row.title,
        channel: row.channel,
        status: row.status,
        metadata: row.metadata,
        last_message_at: row.lastMessageAt,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      } as never)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'createConversation failed');
    return mapConversation(data as Record<string, unknown>);
  }

  async getConversation(id: string, userId: string): Promise<AiConversation | null> {
    const { data } = await db()
      .from('ai_conversations' as never)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .neq('status', 'deleted')
      .maybeSingle();
    return data ? mapConversation(data as Record<string, unknown>) : null;
  }

  async listConversations(userId: string): Promise<AiConversation[]> {
    const { data } = await db()
      .from('ai_conversations' as never)
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'deleted')
      .order('updated_at', { ascending: false });
    return (data as Record<string, unknown>[] | null)?.map(mapConversation) ?? [];
  }

  async updateConversation(
    id: string,
    userId: string,
    patch: Partial<Pick<AiConversation, 'title' | 'status' | 'lastMessageAt' | 'metadata' | 'updatedAt'>>,
  ): Promise<AiConversation | null> {
    const { data } = await db()
      .from('ai_conversations' as never)
      .update({
        title: patch.title,
        status: patch.status,
        last_message_at: patch.lastMessageAt,
        metadata: patch.metadata,
        updated_at: patch.updatedAt ?? new Date().toISOString(),
      } as never)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    return data ? mapConversation(data as Record<string, unknown>) : null;
  }

  async deleteConversation(id: string, userId: string): Promise<boolean> {
    const updated = await this.updateConversation(id, userId, {
      status: 'deleted',
      updatedAt: new Date().toISOString(),
    });
    return Boolean(updated);
  }

  async addMessage(row: AiConversationMessage): Promise<AiConversationMessage> {
    const { data, error } = await db()
      .from('ai_conversation_messages' as never)
      .insert({
        id: row.id,
        conversation_id: row.conversationId,
        user_id: row.userId,
        role: row.role,
        content: row.content,
        related_analysis_id: row.relatedAnalysisId ?? null,
        trace_id: row.traceId ?? null,
        metadata: row.metadata,
        created_at: row.createdAt,
      } as never)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'addMessage failed');
    await db()
      .from('ai_conversations' as never)
      .update({
        last_message_at: row.createdAt,
        updated_at: row.createdAt,
      } as never)
      .eq('id', row.conversationId);
    return mapMessage(data as Record<string, unknown>);
  }

  async listMessages(
    conversationId: string,
    userId: string,
    limit = 100,
  ): Promise<AiConversationMessage[]> {
    const owned = await this.getConversation(conversationId, userId);
    if (!owned) return [];
    const { data } = await db()
      .from('ai_conversation_messages' as never)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    return rows.reverse().map(mapMessage);
  }

  async saveSummary(row: AiConversationSummary): Promise<AiConversationSummary> {
    const { data, error } = await db()
      .from('ai_conversation_summaries' as never)
      .insert({
        id: row.id,
        conversation_id: row.conversationId,
        summary_version: row.summaryVersion,
        covered_until_message_id: row.coveredUntilMessageId,
        covered_message_count: row.coveredMessageCount,
        summary: row.summary,
        created_at: row.createdAt,
      } as never)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'saveSummary failed');
    return row;
  }

  async getLatestSummary(conversationId: string): Promise<AiConversationSummary | null> {
    const { data } = await db()
      .from('ai_conversation_summaries' as never)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      summaryVersion: String(row.summary_version),
      coveredUntilMessageId: String(row.covered_until_message_id),
      coveredMessageCount: Number(row.covered_message_count ?? 0),
      summary: row.summary as AiConversationSummary['summary'],
      createdAt: String(row.created_at),
    };
  }

  async upsertPreference(row: AiUserPreference): Promise<AiUserPreference> {
    await db()
      .from('ai_user_preferences' as never)
      .update({ active: false, updated_at: new Date().toISOString() } as never)
      .eq('user_id', row.userId)
      .eq('key', row.key)
      .eq('active', true);

    const { data, error } = await db()
      .from('ai_user_preferences' as never)
      .insert({
        id: row.id,
        user_id: row.userId,
        key: row.key,
        value: row.value,
        source: row.source,
        confidence: row.confidence,
        first_observed_at: row.firstObservedAt,
        last_confirmed_at: row.lastConfirmedAt,
        expires_at: row.expiresAt,
        active: true,
      } as never)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'upsertPreference failed');
    return mapPreference(data as Record<string, unknown>);
  }

  async listPreferences(userId: string): Promise<AiUserPreference[]> {
    const { data } = await db()
      .from('ai_user_preferences' as never)
      .select('*')
      .eq('user_id', userId)
      .eq('active', true);
    return (data as Record<string, unknown>[] | null)?.map(mapPreference) ?? [];
  }

  async deactivatePreference(userId: string, key: string): Promise<boolean> {
    const { data } = await db()
      .from('ai_user_preferences' as never)
      .update({ active: false, updated_at: new Date().toISOString() } as never)
      .eq('user_id', userId)
      .eq('key', key)
      .eq('active', true)
      .select('id');
    return Boolean(data && (data as unknown[]).length);
  }

  async findAnalysisByFingerprint(
    userId: string,
    fingerprint: string,
  ): Promise<PersistedReasonedAnalysis | null> {
    const { data } = await db()
      .from('ai_reasoned_analysis_results' as never)
      .select('*')
      .eq('user_id', userId)
      .eq('fingerprint', fingerprint)
      .maybeSingle();
    if (!data) return null;
    const analysis = mapAnalysis(data as Record<string, unknown>);
    const snaps = await this.loadSnapshots(analysis.id);
    return { ...analysis, approvedInsights: snaps };
  }

  async saveAnalysis(row: PersistedReasonedAnalysis): Promise<PersistedReasonedAnalysis> {
    const { error } = await db()
      .from('ai_reasoned_analysis_results' as never)
      .insert({
        id: row.id,
        user_id: row.userId,
        wallet_id: row.walletId,
        conversation_id: row.conversationId ?? null,
        parent_analysis_id: row.parentAnalysisId ?? null,
        job_id: row.jobId ?? null,
        analysis_type: row.analysisType,
        analysis_level: row.analysisLevel,
        scope: row.scope,
        completion_status: row.completionStatus,
        what_matters: row.whatMatters,
        monitoring_points: row.monitoringPoints,
        attribution: row.attribution,
        domain_statuses: row.domainStatuses,
        limitations: row.limitations,
        eligible_finding_keys: row.eligibleFindingKeys,
        versions: row.versions,
        data_as_of: row.dataAsOf,
        fingerprint: row.fingerprint,
        trace_id: row.traceId,
        created_at: row.createdAt,
      } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async getAnalysis(id: string, userId: string): Promise<PersistedReasonedAnalysis | null> {
    const { data } = await db()
      .from('ai_reasoned_analysis_results' as never)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return null;
    const analysis = mapAnalysis(data as Record<string, unknown>);
    return { ...analysis, approvedInsights: await this.loadSnapshots(id) };
  }

  async listAnalyses(
    userId: string,
    walletId: string,
    limit = 20,
  ): Promise<PersistedReasonedAnalysis[]> {
    const { data } = await db()
      .from('ai_reasoned_analysis_results' as never)
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false })
      .limit(limit);
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const out: PersistedReasonedAnalysis[] = [];
    for (const row of rows) {
      const a = mapAnalysis(row);
      out.push({ ...a, approvedInsights: await this.loadSnapshots(a.id) });
    }
    return out;
  }

  private async loadSnapshots(analysisId: string): Promise<PersistedInsightSnapshot[]> {
    const { data } = await db()
      .from('ai_insight_snapshots' as never)
      .select('*')
      .eq('analysis_id', analysisId);
    return (data as Record<string, unknown>[] | null)?.map(mapSnapshot) ?? [];
  }

  async saveSnapshots(rows: PersistedInsightSnapshot[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await db()
      .from('ai_insight_snapshots' as never)
      .upsert(
        rows.map(r => ({
          id: r.snapshotId,
          analysis_id: r.analysisId,
          lifecycle_key: r.lifecycleKey,
          finding_id: r.findingId,
          finding_type: r.findingType,
          category: r.category,
          entity_refs: r.entityRefs,
          priority_score: r.priorityScore,
          priority_level: r.priorityLevel,
          materiality_score: r.materialityScore,
          significance_score: r.significanceScore,
          confidence: r.confidence,
          reasoning_confidence: r.reasoningConfidence ?? null,
          evidence_ids: r.evidenceIds,
          limitations: r.limitations,
          observed_values: r.observedValues,
          selected: r.selected,
          eligible_but_not_selected: r.eligibleButNotSelected,
          created_at: r.createdAt,
        })) as never,
      );
    if (error) throw new Error(error.message);
  }

  async listLifecycles(userId: string, walletId: string): Promise<InsightLifecycleRecord[]> {
    const { data } = await db()
      .from('ai_insight_lifecycles' as never)
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_id', walletId);
    return (data as Record<string, unknown>[] | null)?.map(mapLifecycle) ?? [];
  }

  async upsertLifecycles(rows: InsightLifecycleRecord[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await db()
      .from('ai_insight_lifecycles' as never)
      .upsert(
        rows.map(r => ({
          id: r.id,
          user_id: r.userId,
          wallet_id: r.walletId,
          lifecycle_key: r.lifecycleKey,
          finding_type: r.findingType,
          category: r.category,
          entity_refs: r.entityRefs,
          state: r.state,
          first_detected_at: r.firstDetectedAt,
          last_detected_at: r.lastDetectedAt,
          resolved_at: r.resolvedAt ?? null,
          occurrence_count: r.occurrenceCount,
          consecutive_occurrence_count: r.consecutiveOccurrenceCount,
          current_snapshot_id: r.currentSnapshotId ?? null,
          previous_snapshot_id: r.previousSnapshotId ?? null,
          current_priority_score: r.currentPriorityScore ?? null,
          previous_priority_score: r.previousPriorityScore ?? null,
          current_materiality_score: r.currentMaterialityScore ?? null,
          previous_materiality_score: r.previousMaterialityScore ?? null,
          change: r.change,
          superseded_by_lifecycle_key: r.supersededByLifecycleKey ?? null,
          memory_version: r.memoryVersion,
          updated_at: r.updatedAt,
        })) as never,
        { onConflict: 'user_id,wallet_id,lifecycle_key' },
      );
    if (error) throw new Error(error.message);
  }

  async listMonitoringStates(userId: string, walletId: string): Promise<MonitoringPointState[]> {
    const { data } = await db()
      .from('ai_monitoring_point_states' as never)
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_id', walletId);
    return (data as Record<string, unknown>[] | null)?.map(mapMonitoringState) ?? [];
  }

  async upsertMonitoringStates(rows: MonitoringPointState[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await db()
      .from('ai_monitoring_point_states' as never)
      .upsert(rows.map(row => ({
        id: row.id,
        user_id: row.userId,
        wallet_id: row.walletId,
        monitoring_key: row.monitoringKey,
        lifecycle_key: row.lifecycleKey ?? null,
        analysis_id: row.analysisId ?? null,
        metric: row.metric,
        state: row.state,
        current_value: row.currentValue ?? null,
        threshold: row.threshold ?? null,
        explanation: row.explanation,
        last_analysis_id: row.lastAnalysisId ?? null,
        updated_at: row.updatedAt,
        created_at: row.createdAt,
      })) as never, { onConflict: 'wallet_id,monitoring_key' });
    if (error) throw new Error(error.message);
  }

  async addTimelineEvents(rows: IntelligenceTimelineEvent[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await db()
      .from('ai_intelligence_timeline_events' as never)
      .insert(
        rows.map(r => ({
          id: r.id,
          user_id: r.userId,
          wallet_id: r.walletId,
          event_type: r.eventType,
          lifecycle_key: r.lifecycleKey ?? null,
          analysis_id: r.analysisId,
          title: r.title,
          summary: r.summary,
          priority: r.priority,
          confidence: r.confidence,
          evidence_ids: r.evidenceIds,
          occurred_at: r.occurredAt,
        })) as never,
      );
    if (error && !/duplicate|unique/i.test(error.message)) {
      throw new Error(error.message);
    }
  }

  async listTimeline(
    userId: string,
    walletId: string,
    limit = 50,
  ): Promise<IntelligenceTimelineEvent[]> {
    const { data } = await db()
      .from('ai_intelligence_timeline_events' as never)
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_id', walletId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    return (data as Record<string, unknown>[] | null)?.map(mapTimeline) ?? [];
  }

  async deleteWalletAiHistory(userId: string, walletId: string): Promise<void> {
    const supabase = db();
    await supabase
      .from('ai_conversations' as never)
      .update({ status: 'deleted', updated_at: new Date().toISOString() } as never)
      .eq('user_id', userId)
      .eq('wallet_id', walletId);
    await supabase
      .from('ai_reasoned_analysis_results' as never)
      .delete()
      .eq('user_id', userId)
      .eq('wallet_id', walletId);
    await supabase
      .from('ai_insight_lifecycles' as never)
      .delete()
      .eq('user_id', userId)
      .eq('wallet_id', walletId);
    await supabase
      .from('ai_monitoring_point_states' as never)
      .delete()
      .eq('user_id', userId)
      .eq('wallet_id', walletId);
    await supabase
      .from('ai_intelligence_timeline_events' as never)
      .delete()
      .eq('user_id', userId)
      .eq('wallet_id', walletId);
  }

  async deleteUserAiHistory(userId: string): Promise<void> {
    const supabase = db();
    await supabase
      .from('ai_conversations' as never)
      .update({ status: 'deleted', updated_at: new Date().toISOString() } as never)
      .eq('user_id', userId);
    await supabase.from('ai_user_preferences' as never).delete().eq('user_id', userId);
    await supabase.from('ai_reasoned_analysis_results' as never).delete().eq('user_id', userId);
    await supabase.from('ai_insight_lifecycles' as never).delete().eq('user_id', userId);
    await supabase.from('ai_monitoring_point_states' as never).delete().eq('user_id', userId);
    await supabase.from('ai_intelligence_timeline_events' as never).delete().eq('user_id', userId);
  }
}
