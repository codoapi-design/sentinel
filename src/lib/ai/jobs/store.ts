/**
 * Persistence for AI analysis jobs (service-role client).
 */

import { createServerClient } from '@/lib/supabase/server';

import { EMPTY_CHECKPOINT, type AiAnalysisJobRecord, type AiJobCheckpoint, type AiJobStatus, type AiJobType } from './types';

type JobRow = {
  id: string;
  job_type: AiJobType;
  user_id: string;
  wallet_id: string;
  status: AiJobStatus;
  requested_scope: Record<string, unknown>;
  entitlement_scope: Record<string, unknown>;
  progress_processed: number;
  progress_total: number | null;
  progress_pct: number;
  cursor_checkpoint: AiJobCheckpoint;
  retry_count: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  result_ref: Record<string, unknown> | null;
  idempotency_key: string | null;
  trace_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

function mapRow(row: JobRow): AiAnalysisJobRecord {
  return {
    id: row.id,
    jobType: row.job_type,
    userId: row.user_id,
    walletId: row.wallet_id,
    status: row.status,
    requestedScope: row.requested_scope ?? {},
    entitlementScope: row.entitlement_scope ?? {},
    progressProcessed: row.progress_processed ?? 0,
    progressTotal: row.progress_total,
    progressPct: Number(row.progress_pct) || 0,
    cursorCheckpoint: row.cursor_checkpoint ?? EMPTY_CHECKPOINT(),
    retryCount: row.retry_count ?? 0,
    maxAttempts: row.max_attempts ?? 5,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    resultRef: row.result_ref,
    idempotencyKey: row.idempotency_key,
    traceId: row.trace_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

export async function createAiAnalysisJob(input: {
  userId: string;
  walletId: string;
  jobType: AiJobType;
  requestedScope: Record<string, unknown>;
  entitlementScope: Record<string, unknown>;
  idempotencyKey?: string | null;
  traceId?: string | null;
  progressTotal?: number | null;
}): Promise<AiAnalysisJobRecord> {
  const supabase = createServerClient();

  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from('ai_analysis_jobs' as never)
      .select('*')
      .eq('user_id', input.userId)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();
    if (existing) return mapRow(existing as unknown as JobRow);
  }

  const { data, error } = await supabase
    .from('ai_analysis_jobs' as never)
    .insert({
      job_type: input.jobType,
      user_id: input.userId,
      wallet_id: input.walletId,
      status: 'queued',
      requested_scope: input.requestedScope,
      entitlement_scope: input.entitlementScope,
      progress_total: input.progressTotal ?? null,
      cursor_checkpoint: EMPTY_CHECKPOINT(),
      idempotency_key: input.idempotencyKey ?? null,
      trace_id: input.traceId ?? null,
    } as never)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create AI analysis job');
  }
  return mapRow(data as unknown as JobRow);
}

export async function getAiAnalysisJob(jobId: string, userId?: string): Promise<AiAnalysisJobRecord | null> {
  const supabase = createServerClient();
  let q = supabase.from('ai_analysis_jobs' as never).select('*').eq('id', jobId);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return mapRow(data as unknown as JobRow);
}

export async function updateAiAnalysisJob(
  jobId: string,
  patch: Partial<{
    status: AiJobStatus;
    progressProcessed: number;
    progressTotal: number | null;
    progressPct: number;
    cursorCheckpoint: AiJobCheckpoint;
    retryCount: number;
    errorCode: string | null;
    errorMessage: string | null;
    resultRef: Record<string, unknown> | null;
    startedAt: string | null;
    completedAt: string | null;
  }>,
): Promise<AiAnalysisJobRecord> {
  const supabase = createServerClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.progressProcessed !== undefined) row.progress_processed = patch.progressProcessed;
  if (patch.progressTotal !== undefined) row.progress_total = patch.progressTotal;
  if (patch.progressPct !== undefined) row.progress_pct = patch.progressPct;
  if (patch.cursorCheckpoint !== undefined) row.cursor_checkpoint = patch.cursorCheckpoint;
  if (patch.retryCount !== undefined) row.retry_count = patch.retryCount;
  if (patch.errorCode !== undefined) row.error_code = patch.errorCode;
  if (patch.errorMessage !== undefined) row.error_message = patch.errorMessage;
  if (patch.resultRef !== undefined) row.result_ref = patch.resultRef;
  if (patch.startedAt !== undefined) row.started_at = patch.startedAt;
  if (patch.completedAt !== undefined) row.completed_at = patch.completedAt;

  const { data, error } = await supabase
    .from('ai_analysis_jobs' as never)
    .update(row as never)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to update AI analysis job');
  return mapRow(data as unknown as JobRow);
}
