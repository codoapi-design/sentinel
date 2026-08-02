import { MEMORY_DEFAULTS, MEMORY_MODEL_VERSIONS } from '../config';
import type { InsightLifecycleRecord, LifecycleState, PersistedInsightSnapshot } from '../types';
import { classifyScoreMove } from './policies';

export interface LifecycleResolutionInput {
  userId: string;
  walletId: string;
  nowIso: string;
  /** Current snapshots that exist (selected or eligible-not-selected). */
  presentSnapshots: PersistedInsightSnapshot[];
  previousRecords: InsightLifecycleRecord[];
  /** True when required domains for evaluation are available and analysis completed enough. */
  canEvaluateAbsence: boolean;
  analysisCompatible: boolean;
}

export interface LifecycleResolutionResult {
  upserts: InsightLifecycleRecord[];
  timelineHints: Array<{ lifecycleKey: string; eventType: string; state: LifecycleState; title: string }>;
}

function emptyChange(): InsightLifecycleRecord['change'] {
  return { priorityDelta: null, materialityDelta: null, observedValueChanges: {} };
}

export function resolveLifecycleTransitions(input: LifecycleResolutionInput): LifecycleResolutionResult {
  const byKey = new Map(input.previousRecords.map(r => [r.lifecycleKey, r]));
  const presentKeys = new Set(input.presentSnapshots.map(s => s.lifecycleKey));
  const upserts: InsightLifecycleRecord[] = [];
  const timelineHints: LifecycleResolutionResult['timelineHints'] = [];

  for (const snap of input.presentSnapshots) {
    const prev = byKey.get(snap.lifecycleKey);
    if (!prev) {
      const rec: InsightLifecycleRecord = {
        id: `lc:${snap.lifecycleKey}`,
        userId: input.userId,
        walletId: input.walletId,
        lifecycleKey: snap.lifecycleKey,
        findingType: snap.findingType,
        category: snap.category,
        entityRefs: snap.entityRefs,
        state: 'new',
        firstDetectedAt: input.nowIso,
        lastDetectedAt: input.nowIso,
        resolvedAt: null,
        occurrenceCount: 1,
        consecutiveOccurrenceCount: 1,
        currentSnapshotId: snap.snapshotId,
        previousSnapshotId: null,
        currentPriorityScore: snap.priorityScore,
        previousPriorityScore: null,
        currentMaterialityScore: snap.materialityScore,
        previousMaterialityScore: null,
        change: emptyChange(),
        memoryVersion: MEMORY_MODEL_VERSIONS.lifecycleTransition,
        updatedAt: input.nowIso,
      };
      upserts.push(rec);
      timelineHints.push({
        lifecycleKey: snap.lifecycleKey,
        eventType: 'insight_new',
        state: 'new',
        title: `${snap.findingType} detected`,
      });
      continue;
    }

    const move = classifyScoreMove({
      findingType: snap.findingType,
      previousMateriality: prev.currentMaterialityScore ?? prev.previousMaterialityScore ?? 0,
      currentMateriality: snap.materialityScore,
      worsenDelta: MEMORY_DEFAULTS.worseningMaterialityDelta,
      improveDelta: MEMORY_DEFAULTS.improvingMaterialityDelta,
      stableEpsilon: MEMORY_DEFAULTS.stablePriorityEpsilon,
    });

    let state: LifecycleState = 'recurring';
    if (prev.state === 'resolved') state = 'reopened';
    else if (prev.consecutiveOccurrenceCount + 1 >= 3) state = move === 'stable' ? 'persistent' : move;
    else if (move === 'worsening') state = 'worsening';
    else if (move === 'improving') state = 'improving';
    else if (move === 'stable' && prev.consecutiveOccurrenceCount >= 1) state = 'stable';
    else state = 'recurring';

    const matDelta =
      snap.materialityScore - (prev.currentMaterialityScore ?? snap.materialityScore);
    const priDelta = snap.priorityScore - (prev.currentPriorityScore ?? snap.priorityScore);

    const rec: InsightLifecycleRecord = {
      ...prev,
      state,
      lastDetectedAt: input.nowIso,
      resolvedAt: null,
      occurrenceCount: prev.occurrenceCount + 1,
      consecutiveOccurrenceCount: prev.state === 'resolved' ? 1 : prev.consecutiveOccurrenceCount + 1,
      previousSnapshotId: prev.currentSnapshotId ?? null,
      currentSnapshotId: snap.snapshotId,
      previousPriorityScore: prev.currentPriorityScore ?? null,
      currentPriorityScore: snap.priorityScore,
      previousMaterialityScore: prev.currentMaterialityScore ?? null,
      currentMaterialityScore: snap.materialityScore,
      change: {
        priorityDelta: priDelta,
        materialityDelta: matDelta,
        observedValueChanges: {},
      },
      memoryVersion: MEMORY_MODEL_VERSIONS.lifecycleTransition,
      updatedAt: input.nowIso,
    };
    upserts.push(rec);

    if (state === 'reopened') {
      timelineHints.push({
        lifecycleKey: snap.lifecycleKey,
        eventType: 'insight_reopened',
        state,
        title: `${snap.findingType} reopened`,
      });
    } else if (state === 'worsening') {
      timelineHints.push({
        lifecycleKey: snap.lifecycleKey,
        eventType: 'insight_worsened',
        state,
        title: `${snap.findingType} worsened`,
      });
    } else if (state === 'improving') {
      timelineHints.push({
        lifecycleKey: snap.lifecycleKey,
        eventType: 'insight_improved',
        state,
        title: `${snap.findingType} improved`,
      });
    }
  }

  // Absences
  for (const prev of input.previousRecords) {
    if (presentKeys.has(prev.lifecycleKey)) continue;
    if (prev.state === 'resolved' || prev.state === 'superseded') {
      upserts.push(prev);
      continue;
    }
    if (!input.canEvaluateAbsence || !input.analysisCompatible) {
      upserts.push({
        ...prev,
        state: 'unknown',
        consecutiveOccurrenceCount: 0,
        updatedAt: input.nowIso,
        memoryVersion: MEMORY_MODEL_VERSIONS.lifecycleTransition,
      });
      continue;
    }
    upserts.push({
      ...prev,
      state: 'resolved',
      resolvedAt: input.nowIso,
      consecutiveOccurrenceCount: 0,
      previousSnapshotId: prev.currentSnapshotId ?? null,
      currentSnapshotId: null,
      updatedAt: input.nowIso,
      memoryVersion: MEMORY_MODEL_VERSIONS.lifecycleTransition,
    });
    timelineHints.push({
      lifecycleKey: prev.lifecycleKey,
      eventType: 'insight_resolved',
      state: 'resolved',
      title: `${prev.findingType} resolved`,
    });
  }

  return { upserts, timelineHints };
}
