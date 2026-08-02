import type { MonitoringPoint } from '@/lib/ai/intelligence-quality/types';

import { buildMonitoringKey } from './identity';
import type {
  InsightLifecycleRecord,
  MonitoringLifecycleState,
  MonitoringPointState,
  PersistedInsightSnapshot,
} from '../types';

export interface MonitoringTransitionHint {
  monitoringKey: string;
  lifecycleKey?: string | null;
  state: MonitoringLifecycleState;
  title: string;
}

export interface MonitoringTransitionInput {
  userId: string;
  walletId: string;
  analysisId: string;
  nowIso: string;
  monitoringPoints: MonitoringPoint[];
  presentSnapshots: PersistedInsightSnapshot[];
  previousRecords: MonitoringPointState[];
  lifecycleRecords?: InsightLifecycleRecord[];
  canEvaluateAbsence: boolean;
  scopeValid?: boolean;
  expireAt?: string | null;
}

export interface MonitoringTransitionResult {
  upserts: MonitoringPointState[];
  timelineHints: MonitoringTransitionHint[];
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function valueForMetric(point: MonitoringPoint, snapshots: PersistedInsightSnapshot[]): number | null {
  if (numeric(point.currentValue) != null) return point.currentValue!;
  const snapshot = snapshots.find(s => s.findingId === point.relatedFindingId);
  if (!snapshot) return null;
  const entries = Object.entries(snapshot.observedValues);
  const normalizedMetric = point.metric.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = entries.find(([key]) => key.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedMetric)
    ?? entries.find(([key]) => key.toLowerCase().includes(point.metric.toLowerCase()));
  return numeric(match?.[1]);
}

function thresholdForPoint(point: MonitoringPoint, snapshots: PersistedInsightSnapshot[]): number | null {
  if (numeric(point.threshold) != null) return point.threshold!;
  const snapshot = snapshots.find(s => s.findingId === point.relatedFindingId);
  if (!snapshot) return null;
  const metric = point.metric.toLowerCase().replace(/[^a-z0-9]/g, '');
  const entry = Object.entries(snapshot.observedValues).find(([key]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalized === `${metric}threshold` || normalized === 'threshold';
  });
  const value = entry?.[1];
  const n = numeric(value);
  return n == null ? null : n;
}

function higherIsBetter(metric: string): boolean {
  return /diversif|coverage|liquid|health|quality/i.test(metric);
}

function conditionIsBad(point: MonitoringPoint, current: number | null, threshold: number | null): boolean | null {
  if (current == null || threshold == null) return null;
  if (point.condition === 'increases_above') return current >= threshold;
  if (point.condition === 'decreases_below') return current <= threshold;
  if (point.condition === 'changes_materially') return Math.abs(current) >= Math.abs(threshold);
  if (point.condition === 'new_event' || point.condition === 'persists') return null;
  return higherIsBetter(point.metric) ? current <= threshold : current >= threshold;
}

function favorableMove(metric: string, previous: number | null | undefined, current: number | null): boolean {
  if (previous == null || current == null || previous === current) return false;
  return higherIsBetter(metric) ? current > previous : current < previous;
}

function lifecycleForPoint(point: MonitoringPoint, snapshots: PersistedInsightSnapshot[]): string | null {
  return snapshots.find(s => s.findingId === point.relatedFindingId)?.lifecycleKey ?? null;
}

function hintFor(state: MonitoringLifecycleState, key: string, lifecycleKey?: string | null): MonitoringTransitionHint | null {
  const titles: Partial<Record<MonitoringLifecycleState, string>> = {
    triggered: 'Monitoring condition triggered',
    improved: 'Monitoring condition improved',
    resolved: 'Monitoring condition resolved',
    expired: 'Monitoring condition expired',
    superseded: 'Monitoring condition superseded',
  };
  const title = titles[state];
  return title ? { monitoringKey: key, lifecycleKey, state, title } : null;
}

export function resolveMonitoringTransitions(input: MonitoringTransitionInput): MonitoringTransitionResult {
  const previous = new Map(input.previousRecords.map(record => [record.monitoringKey, record]));
  const lifecycleByKey = new Map((input.lifecycleRecords ?? []).map(record => [record.lifecycleKey, record]));
  const upserts: MonitoringPointState[] = [];
  const timelineHints: MonitoringTransitionHint[] = [];
  const seen = new Set<string>();
  const expired = input.scopeValid === false
    || Boolean(input.expireAt && new Date(input.expireAt).getTime() <= new Date(input.nowIso).getTime());

  for (const point of input.monitoringPoints) {
    const lifecycleKey = lifecycleForPoint(point, input.presentSnapshots);
    const key = buildMonitoringKey({
      walletId: input.walletId,
      metric: point.metric,
      relatedFindingId: point.relatedFindingId,
      lifecycleKey,
    });
    seen.add(key);
    const prior = previous.get(key);
    if (prior?.lastAnalysisId === input.analysisId) continue;

    const currentValue = valueForMetric(point, input.presentSnapshots);
    const threshold = thresholdForPoint(point, input.presentSnapshots);
    const bad = conditionIsBad(point, currentValue, threshold);
    const superseded = Boolean(lifecycleKey && lifecycleByKey.get(lifecycleKey)?.state === 'superseded');
    let state: MonitoringLifecycleState = 'active';

    if (superseded) state = 'superseded';
    else if (expired) state = 'expired';
    else if (bad === true) state = 'triggered';
    else if (prior?.state === 'triggered' && bad === false && input.canEvaluateAbsence) state = 'resolved';
    else if (favorableMove(point.metric, prior?.currentValue, currentValue)) state = 'improved';
    else if (prior) state = prior.state === 'resolved' ? 'active' : prior.state;

    const row: MonitoringPointState = {
      id: prior?.id ?? `monitor:${key}`,
      userId: input.userId,
      walletId: input.walletId,
      monitoringKey: key,
      lifecycleKey,
      analysisId: input.analysisId,
      metric: point.metric,
      state,
      currentValue,
      threshold,
      explanation: point.explanation,
      lastAnalysisId: input.analysisId,
      createdAt: prior?.createdAt ?? input.nowIso,
      updatedAt: input.nowIso,
    };
    upserts.push(row);
    if (!prior || prior.state !== state) {
      const hint = hintFor(state, key, lifecycleKey);
      if (hint) timelineHints.push(hint);
    }
  }

  for (const prior of input.previousRecords) {
    if (seen.has(prior.monitoringKey) || prior.lastAnalysisId === input.analysisId) continue;
    const lifecycle = prior.lifecycleKey ? lifecycleByKey.get(prior.lifecycleKey) : undefined;
    let state: MonitoringLifecycleState | null = null;
    if (lifecycle?.state === 'superseded') state = 'superseded';
    else if (expired) state = 'expired';
    // Absence alone is not evidence that a monitoring condition cleared.
    if (!state || state === prior.state) continue;
    const row = { ...prior, state, analysisId: input.analysisId, lastAnalysisId: input.analysisId, updatedAt: input.nowIso };
    upserts.push(row);
    const hint = hintFor(state, prior.monitoringKey, prior.lifecycleKey);
    if (hint) timelineHints.push(hint);
  }

  return { upserts, timelineHints };
}
