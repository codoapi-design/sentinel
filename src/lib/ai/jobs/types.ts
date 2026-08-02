export type AiJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AiJobType = 'full_history_analysis' | 'filtered_history_analysis';

export interface AiJobCheckpoint {
  /** Exclusive lower bound cursor: process rows with timestamp < cursorMs, newest-first. */
  cursorMs: number | null;
  /** Rows successfully aggregated so far. */
  processed: number;
  /** Exact matching total when known. */
  total: number | null;
  aggregates: {
    txCount: number;
    inflowUsd: number;
    outflowUsd: number;
    netFlowUsd: number;
    gasFeesUsd: number;
    volumeUsd: number;
  };
}

export interface AiAnalysisJobRecord {
  id: string;
  jobType: AiJobType;
  userId: string;
  walletId: string;
  status: AiJobStatus;
  requestedScope: Record<string, unknown>;
  entitlementScope: Record<string, unknown>;
  progressProcessed: number;
  progressTotal: number | null;
  progressPct: number;
  cursorCheckpoint: AiJobCheckpoint;
  retryCount: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  resultRef: Record<string, unknown> | null;
  idempotencyKey: string | null;
  traceId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export const AI_JOB_CHUNK_SIZE = 500;

export const EMPTY_CHECKPOINT = (): AiJobCheckpoint => ({
  cursorMs: null,
  processed: 0,
  total: null,
  aggregates: {
    txCount: 0,
    inflowUsd: 0,
    outflowUsd: 0,
    netFlowUsd: 0,
    gasFeesUsd: 0,
    volumeUsd: 0,
  },
});
