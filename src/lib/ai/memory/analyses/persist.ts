import { randomUUID } from 'node:crypto';

import type { ReasonedIntelligencePackage } from '@/lib/ai/intelligence-quality/types';
import type { AnalysisScope } from '@/lib/ai/trust/types';

import { resolveLifecycleTransitions } from '../lifecycle/transitions';
import { resolveMonitoringTransitions } from '../monitoring/transitions';
import { getMemoryStore } from '../store/memory-store';
import type { IntelligenceTimelineEvent, PersistedReasonedAnalysis } from '../types';
import { buildAnalysisFingerprint, shouldPersistAnalysis } from './fingerprint';
import { buildPersistedAnalysis } from './serialize';
import { scoreConfidence } from '@/lib/ai/intelligence-quality/confidence-util';
import { MEMORY_DEFAULTS } from '../config';

export interface PersistAnalysisResult {
  analysis: PersistedReasonedAnalysis;
  reused: boolean;
  timelineEventsCreated: number;
  lifecycleUpdates: number;
}

function canEvaluateAbsence(pkg: ReasonedIntelligencePackage): boolean {
  if (pkg.completionStatus === 'failed' || pkg.completionStatus === 'insufficient_data') {
    return false;
  }
  const holdings = pkg.domainStatuses.find(d => d.domain === 'holdings');
  const snapshots = pkg.domainStatuses.find(d => d.domain === 'snapshots');
  const holdingsOk = holdings && (holdings.status === 'available' || holdings.status === 'partial');
  // Allocation-style absence needs holdings; don't require perfect snapshots for all types
  return Boolean(holdingsOk) && pkg.scope.coverage.status !== 'unavailable';
}

export async function persistReasonedAnalysis(input: {
  userId: string;
  walletId: string;
  mode: string;
  analysisType: string;
  scope: AnalysisScope;
  pkg: ReasonedIntelligencePackage;
  traceId: string;
  pipelineVersion: string;
  responseSchemaVersion: string;
  conversationId?: string | null;
  parentAnalysisId?: string | null;
  jobId?: string | null;
  forcePersist?: boolean;
}): Promise<PersistAnalysisResult | null> {
  if (
    !shouldPersistAnalysis({
      mode: input.mode,
      completionStatus: input.pkg.completionStatus,
      selectedCount: input.pkg.selectedInsightIds.length,
      forcePersist: input.forcePersist,
    })
  ) {
    return null;
  }

  const store = getMemoryStore();
  const fingerprint = buildAnalysisFingerprint({
    userId: input.userId,
    walletId: input.walletId,
    analysisType: input.analysisType,
    analysisLevel: 'wallet',
    scope: input.scope,
    pkg: input.pkg,
    pipelineVersion: input.pipelineVersion,
    reasoningEngine: input.pkg.versions.reasoningEngine,
  });

  // Serialize concurrent persists for the same fingerprint (process-local).
  const lockKey = `${input.userId}:${fingerprint}`;
  const g = globalThis as { __radareum_fp_locks?: Map<string, Promise<unknown>> };
  if (!g.__radareum_fp_locks) g.__radareum_fp_locks = new Map();
  const locks = g.__radareum_fp_locks;
  const previousGate = locks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  locks.set(
    lockKey,
    previousGate.then(() => gate).catch(() => gate),
  );
  await previousGate.catch(() => undefined);

  try {
    const existing = await store.findAnalysisByFingerprint(input.userId, fingerprint);
    if (existing) {
      return {
        analysis: existing,
        reused: true,
        timelineEventsCreated: 0,
        lifecycleUpdates: 0,
      };
    }

    const nowIso = new Date().toISOString();
    const id = randomUUID();
    const analysis = buildPersistedAnalysis({
      id,
      userId: input.userId,
      walletId: input.walletId,
      analysisType: input.analysisType,
      scope: input.scope,
      pkg: input.pkg,
      fingerprint,
      traceId: input.traceId,
      pipelineVersion: input.pipelineVersion,
      responseSchemaVersion: input.responseSchemaVersion,
      conversationId: input.conversationId,
      parentAnalysisId: input.parentAnalysisId,
      jobId: input.jobId,
      nowIso,
    });

    await store.saveAnalysis(analysis);
    await store.saveSnapshots(analysis.approvedInsights);

    const previous = await store.listLifecycles(input.userId, input.walletId);
    const present = analysis.approvedInsights.filter(s => s.selected || s.eligibleButNotSelected);
    const { upserts, timelineHints } = resolveLifecycleTransitions({
      userId: input.userId,
      walletId: input.walletId,
      nowIso,
      presentSnapshots: present,
      previousRecords: previous,
      canEvaluateAbsence: canEvaluateAbsence(input.pkg),
      analysisCompatible: true,
    });
    await store.upsertLifecycles(upserts);

    const previousMonitoringStates = await store.listMonitoringStates(input.userId, input.walletId);
    const monitoring = resolveMonitoringTransitions({
      userId: input.userId,
      walletId: input.walletId,
      analysisId: analysis.id,
      nowIso,
      monitoringPoints: input.pkg.monitoringPoints,
      presentSnapshots: present,
      previousRecords: previousMonitoringStates,
      lifecycleRecords: upserts,
      canEvaluateAbsence: canEvaluateAbsence(input.pkg),
      scopeValid: input.pkg.scope.coverage.status !== 'unavailable',
    });
    await store.upsertMonitoringStates(monitoring.upserts);

    const events: IntelligenceTimelineEvent[] = timelineHints
      .filter(h => {
        const snap = present.find(s => s.lifecycleKey === h.lifecycleKey);
        const priority = snap?.priorityScore ?? 0.5;
        return (
          priority >= MEMORY_DEFAULTS.timelineMinPriority ||
          h.state === 'resolved' ||
          h.state === 'reopened'
        );
      })
      .map(h => ({
        id: randomUUID(),
        userId: input.userId,
        walletId: input.walletId,
        eventType: h.eventType as IntelligenceTimelineEvent['eventType'],
        lifecycleKey: h.lifecycleKey,
        analysisId: analysis.id,
        title: h.title,
        summary: `Lifecycle state → ${h.state}`,
        priority: present.find(s => s.lifecycleKey === h.lifecycleKey)?.priorityScore ?? 0.5,
        confidence: scoreConfidence({ sample: 70, historical: 60 }),
        evidenceIds: [],
        occurredAt: nowIso,
      }));

    events.push(
      ...monitoring.timelineHints.map(hint => ({
        id: randomUUID(),
        userId: input.userId,
        walletId: input.walletId,
        eventType: `monitoring_${hint.state}` as IntelligenceTimelineEvent['eventType'],
        lifecycleKey: hint.lifecycleKey ?? undefined,
        analysisId: analysis.id,
        title: hint.title,
        summary: `Monitoring state → ${hint.state}`,
        priority: 0.5,
        confidence: scoreConfidence({ sample: 70, historical: 60 }),
        evidenceIds: [],
        occurredAt: nowIso,
      })),
    );

    await store.addTimelineEvents(events);

    return {
      analysis,
      reused: false,
      timelineEventsCreated: events.length,
      lifecycleUpdates: upserts.length,
    };
  } finally {
    release();
    if (locks.get(lockKey) === gate) locks.delete(lockKey);
  }
}
