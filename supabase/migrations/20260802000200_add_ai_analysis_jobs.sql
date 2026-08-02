-- Package 1 closure: durable AI full-history analysis jobs
-- Server (service role) creates/updates; owners may SELECT own rows.

CREATE TABLE IF NOT EXISTS public.ai_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL DEFAULT 'full_history_analysis'
    CHECK (job_type IN ('full_history_analysis', 'filtered_history_analysis')),
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  requested_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  entitlement_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress_processed INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NULL,
  progress_pct NUMERIC NOT NULL DEFAULT 0,
  cursor_checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  error_code TEXT NULL,
  error_message TEXT NULL,
  result_ref JSONB NULL,
  idempotency_key TEXT NULL,
  trace_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_analysis_jobs_user_idempotency
  ON public.ai_analysis_jobs (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_status_created
  ON public.ai_analysis_jobs (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_wallet
  ON public.ai_analysis_jobs (wallet_id, created_at DESC);

COMMENT ON TABLE public.ai_analysis_jobs IS
  'Durable chunked AI analysis jobs. Progress is checkpoint-based, never fake.';

ALTER TABLE public.ai_analysis_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai analysis jobs" ON public.ai_analysis_jobs;
CREATE POLICY "Users can view own ai analysis jobs"
  ON public.ai_analysis_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- No client INSERT/UPDATE/DELETE — service role only.
