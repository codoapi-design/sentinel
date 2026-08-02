-- Package 1: AI request traces + idempotency keys
-- Reversible: DROP TABLE IF EXISTS ... CASCADE;
-- Service role (server) writes; users may SELECT own rows only.

-- ---------------------------------------------------------------------------
-- ai_request_traces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_request_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  wallet_id UUID NULL REFERENCES public.wallets(id) ON DELETE SET NULL,
  entry_point TEXT NOT NULL CHECK (entry_point IN ('analyze', 'chat')),
  mode TEXT NOT NULL,
  requested_period JSONB NULL,
  data_requirements_plan JSONB NULL,
  tools_planned JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
  timings JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT NULL,
  input_tokens INTEGER NULL,
  output_tokens INTEGER NULL,
  estimated_cost_usd NUMERIC NULL,
  fallback_status TEXT NULL,
  fallback_reason TEXT NULL,
  domain_statuses JSONB NULL,
  final_confidence JSONB NULL,
  completion_status TEXT NULL,
  response_status INTEGER NOT NULL DEFAULT 200,
  error_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_request_traces_user_created
  ON public.ai_request_traces (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_request_traces_wallet
  ON public.ai_request_traces (wallet_id, created_at DESC);

COMMENT ON TABLE public.ai_request_traces IS
  'Package 1 observability for AI analyze/chat requests. No secrets or full prompts.';

ALTER TABLE public.ai_request_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai request traces" ON public.ai_request_traces;
CREATE POLICY "Users can view own ai request traces"
  ON public.ai_request_traces FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for authenticated clients — server service role only.
DROP POLICY IF EXISTS "Users cannot insert ai request traces" ON public.ai_request_traces;

-- ---------------------------------------------------------------------------
-- ai_idempotency_keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  user_id UUID NOT NULL,
  entry_point TEXT NOT NULL CHECK (entry_point IN ('analyze', 'chat')),
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'failed')),
  usage_charged BOOLEAN NOT NULL DEFAULT false,
  trace_id TEXT NULL,
  response_status INTEGER NULL,
  response_body JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_idempotency_keys_created
  ON public.ai_idempotency_keys (created_at DESC);

COMMENT ON TABLE public.ai_idempotency_keys IS
  'Package 1 idempotency for AI usage accounting and response replay.';

ALTER TABLE public.ai_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai idempotency keys" ON public.ai_idempotency_keys;
CREATE POLICY "Users can view own ai idempotency keys"
  ON public.ai_idempotency_keys FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Exact filtered transaction aggregates (optional RPC)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_transaction_aggregates(
  p_wallet_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_token_symbol TEXT DEFAULT NULL,
  p_network TEXT DEFAULT NULL
)
RETURNS TABLE (
  tx_count BIGINT,
  inflow_usd NUMERIC,
  outflow_usd NUMERIC,
  net_flow_usd NUMERIC,
  gas_fees_usd NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- Owned wallet => one aggregate row (zeros if no txs).
  -- Non-owned / missing wallet => zero rows (denied).
  SELECT
    COUNT(t.id)::BIGINT AS tx_count,
    COALESCE(SUM(CASE
      WHEN COALESCE(t.direction, '') IN ('in', 'inbound', 'receive')
        OR t.type IN ('income', 'staking')
      THEN COALESCE(t.value_usd, 0) ELSE 0 END), 0) AS inflow_usd,
    COALESCE(SUM(CASE
      WHEN COALESCE(t.direction, '') IN ('out', 'outbound', 'send')
        OR t.type IN ('expense', 'gas')
      THEN COALESCE(t.value_usd, 0) ELSE 0 END), 0) AS outflow_usd,
    COALESCE(SUM(CASE
      WHEN COALESCE(t.direction, '') IN ('in', 'inbound', 'receive')
        OR t.type IN ('income', 'staking')
      THEN COALESCE(t.value_usd, 0)
      WHEN COALESCE(t.direction, '') IN ('out', 'outbound', 'send')
        OR t.type IN ('expense', 'gas')
      THEN -COALESCE(t.value_usd, 0)
      ELSE 0 END), 0) AS net_flow_usd,
    COALESCE(SUM(COALESCE(t.gas_fee_eth, 0) * COALESCE(t.price_usd, 0)), 0) AS gas_fees_usd
  FROM public.wallets w
  LEFT JOIN public.transactions t
    ON t.wallet_id = w.id
   AND (p_from_date IS NULL OR t.date >= p_from_date::text)
   AND (p_to_date IS NULL OR t.date <= p_to_date::text)
   AND (p_token_symbol IS NULL OR lower(t.token_symbol) = lower(p_token_symbol))
   AND (p_network IS NULL OR t.network = p_network)
  WHERE w.id = p_wallet_id
    AND w.user_id = auth.uid()
  GROUP BY w.id;
$$;

COMMENT ON FUNCTION public.ai_transaction_aggregates IS
  'Exact scoped transaction aggregates for AI Package 1; RLS via SECURITY INVOKER + wallet ownership.';

GRANT EXECUTE ON FUNCTION public.ai_transaction_aggregates TO authenticated;

-- ---------------------------------------------------------------------------
-- Harden ai_usage: clients must not forge usage counters.
-- Prefer service-role writes from the Next.js server. Keep SELECT for owners.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_usage'
  ) THEN
    ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can insert own ai usage" ON public.ai_usage;
    DROP POLICY IF EXISTS "Users can update own ai usage" ON public.ai_usage;
    -- Retain owner SELECT; admin policies from admin-schema.sql remain if present.
  END IF;
END $$;
