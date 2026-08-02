/**
 * Serverless-compatible continuation worker for full-history AI jobs.
 *
 * Each tick loads at most AI_JOB_CHUNK_SIZE rows, updates durable aggregates +
 * cursor, and returns. Callers (route / cron) continue until completed/failed.
 * Never reports fake progress — progress_processed is exact rows read.
 */

import { createServerClient } from '@/lib/supabase/server';

import { getAiAnalysisJob, updateAiAnalysisJob } from './store';
import { AI_JOB_CHUNK_SIZE, EMPTY_CHECKPOINT, type AiJobCheckpoint } from './types';

type TxChunkRow = {
  id: string;
  timestamp: number | null;
  value_usd: number | null;
  gas_fee_eth: number | null;
  price_usd: number | null;
  direction: string | null;
  type: string | null;
};

function numberOrZero(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function classifyFlow(row: TxChunkRow): { inflow: number; outflow: number } {
  const usd = numberOrZero(row.value_usd);
  const dir = (row.direction ?? '').toLowerCase();
  const type = (row.type ?? '').toLowerCase();
  if (dir === 'in' || dir === 'inbound' || dir === 'receive' || type === 'income' || type === 'staking') {
    return { inflow: usd, outflow: 0 };
  }
  if (dir === 'out' || dir === 'outbound' || dir === 'send' || type === 'expense' || type === 'gas') {
    return { inflow: 0, outflow: usd };
  }
  return { inflow: 0, outflow: 0 };
}

export interface TickResult {
  jobId: string;
  status: string;
  processed: number;
  total: number | null;
  progressPct: number;
  done: boolean;
  resultRef?: Record<string, unknown> | null;
  errorCode?: string | null;
}

/**
 * Process one bounded chunk for a job. Safe to retry: checkpoint is exclusive
 * cursor on timestamp (newest-first), so resumed ticks do not double-count.
 */
export async function processAiAnalysisJobTick(jobId: string): Promise<TickResult> {
  const job = await getAiAnalysisJob(jobId);
  if (!job) {
    return {
      jobId,
      status: 'failed',
      processed: 0,
      total: null,
      progressPct: 0,
      done: true,
      errorCode: 'JOB_NOT_FOUND',
    };
  }

  if (job.status === 'completed' || job.status === 'cancelled') {
    return {
      jobId,
      status: job.status,
      processed: job.progressProcessed,
      total: job.progressTotal,
      progressPct: job.progressPct,
      done: true,
      resultRef: job.resultRef,
    };
  }

  if (job.status === 'failed' && job.retryCount >= job.maxAttempts) {
    return {
      jobId,
      status: 'failed',
      processed: job.progressProcessed,
      total: job.progressTotal,
      progressPct: job.progressPct,
      done: true,
      errorCode: job.errorCode,
    };
  }

  const checkpoint: AiJobCheckpoint = job.cursorCheckpoint?.aggregates
    ? job.cursorCheckpoint
    : EMPTY_CHECKPOINT();

  try {
    if (job.status === 'queued' || job.status === 'failed') {
      await updateAiAnalysisJob(jobId, {
        status: 'running',
        startedAt: job.startedAt ?? new Date().toISOString(),
        errorCode: null,
        errorMessage: null,
        retryCount: job.status === 'failed' ? job.retryCount + 1 : job.retryCount,
      });
    }

    const supabase = createServerClient();
    const scope = job.requestedScope as {
      from?: string;
      to?: string;
      asset?: string;
      network?: string;
    };
    const ent = job.entitlementScope as { allowedFrom?: string | null; allowedTo?: string | null };

    // Count once
    let total = job.progressTotal;
    if (total == null) {
      let countQ = supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('wallet_id', job.walletId);
      const fromDate = (ent.allowedFrom || scope.from || '').slice(0, 10);
      const toDate = (ent.allowedTo || scope.to || '').slice(0, 10);
      if (fromDate) countQ = countQ.gte('date', fromDate);
      if (toDate) countQ = countQ.lte('date', toDate);
      if (scope.asset) countQ = countQ.ilike('token_symbol', scope.asset);
      if (scope.network) countQ = countQ.eq('network', scope.network);
      const { count, error: countErr } = await countQ;
      if (countErr) throw new Error(countErr.message);
      total = count ?? 0;
    }

    let q = supabase
      .from('transactions')
      .select('id, timestamp, value_usd, gas_fee_eth, price_usd, direction, type')
      .eq('wallet_id', job.walletId)
      .order('timestamp', { ascending: false })
      .limit(AI_JOB_CHUNK_SIZE);

    const fromDate = (ent.allowedFrom || scope.from || '').slice(0, 10);
    const toDate = (ent.allowedTo || scope.to || '').slice(0, 10);
    if (fromDate) q = q.gte('date', fromDate);
    if (toDate) q = q.lte('date', toDate);
    if (scope.asset) q = q.ilike('token_symbol', scope.asset);
    if (scope.network) q = q.eq('network', scope.network);
    if (checkpoint.cursorMs != null) {
      q = q.lt('timestamp', checkpoint.cursorMs);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as TxChunkRow[];
    const aggregates = { ...checkpoint.aggregates };

    for (const row of rows) {
      const { inflow, outflow } = classifyFlow(row);
      aggregates.txCount += 1;
      aggregates.inflowUsd += inflow;
      aggregates.outflowUsd += outflow;
      aggregates.netFlowUsd += inflow - outflow;
      aggregates.gasFeesUsd += numberOrZero(row.gas_fee_eth) * numberOrZero(row.price_usd);
      aggregates.volumeUsd += Math.abs(numberOrZero(row.value_usd));
    }

    const processed = checkpoint.processed + rows.length;
    const last = rows[rows.length - 1];
    const nextCursor =
      rows.length > 0 && last?.timestamp != null ? numberOrZero(last.timestamp) : checkpoint.cursorMs;

    const nextCheckpoint: AiJobCheckpoint = {
      cursorMs: nextCursor,
      processed,
      total,
      aggregates,
    };

    const progressPct =
      total && total > 0 ? Math.min(100, Math.round((processed / total) * 10000) / 100) : rows.length === 0 ? 100 : 0;

    const complete = rows.length === 0 || (total != null && processed >= total);

    if (complete) {
      const resultRef = {
        schemaVersion: '2.0.0',
        coverage: {
          status: 'complete',
          processedRecords: processed,
          matchingRecords: total,
          isFullEntitledHistory: true,
          truncated: false,
        },
        aggregates,
        engine: 'flow',
        engineVersion: '2.0.0',
        completedAt: new Date().toISOString(),
      };

      const updated = await updateAiAnalysisJob(jobId, {
        status: 'completed',
        progressProcessed: processed,
        progressTotal: total,
        progressPct: 100,
        cursorCheckpoint: nextCheckpoint,
        resultRef,
        completedAt: new Date().toISOString(),
      });

      return {
        jobId,
        status: updated.status,
        processed: updated.progressProcessed,
        total: updated.progressTotal,
        progressPct: 100,
        done: true,
        resultRef: updated.resultRef,
      };
    }

    const updated = await updateAiAnalysisJob(jobId, {
      status: 'running',
      progressProcessed: processed,
      progressTotal: total,
      progressPct,
      cursorCheckpoint: nextCheckpoint,
    });

    return {
      jobId,
      status: updated.status,
      processed: updated.progressProcessed,
      total: updated.progressTotal,
      progressPct: updated.progressPct,
      done: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryCount = job.retryCount + 1;
    const failed = retryCount >= job.maxAttempts;
    await updateAiAnalysisJob(jobId, {
      status: failed ? 'failed' : 'queued',
      retryCount,
      errorCode: 'JOB_TICK_FAILED',
      errorMessage: message.slice(0, 500),
    });
    return {
      jobId,
      status: failed ? 'failed' : 'queued',
      processed: job.progressProcessed,
      total: job.progressTotal,
      progressPct: job.progressPct,
      done: failed,
      errorCode: 'JOB_TICK_FAILED',
    };
  }
}

/** Drain a job synchronously with a tick budget (tests / small wallets). */
export async function runAiAnalysisJobToCompletion(
  jobId: string,
  maxTicks = 10_000,
): Promise<TickResult> {
  let last: TickResult = {
    jobId,
    status: 'queued',
    processed: 0,
    total: null,
    progressPct: 0,
    done: false,
  };
  for (let i = 0; i < maxTicks; i++) {
    last = await processAiAnalysisJobTick(jobId);
    if (last.done) return last;
  }
  return { ...last, errorCode: 'MAX_TICKS_EXCEEDED', done: false };
}
