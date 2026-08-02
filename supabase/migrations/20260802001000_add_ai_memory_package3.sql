-- Package 3: Persistent intelligence memory
-- Rollback: DROP TABLE IF EXISTS in reverse dependency order CASCADE;
-- Defaults: wallet delete cascades AI wallet history; conversations scoped to wallet deleted via trigger/RPC.

-- ---------------------------------------------------------------------------
-- ai_conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  title TEXT NULL,
  channel TEXT NOT NULL DEFAULT 'web'
    CHECK (channel IN ('web', 'telegram', 'system')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_message_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
  ON public.ai_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_status
  ON public.ai_conversations (user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_wallet
  ON public.ai_conversations (wallet_id, updated_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users can view own ai conversations"
  ON public.ai_conversations FOR SELECT
  USING (auth.uid() = user_id AND status <> 'deleted');

DROP POLICY IF EXISTS "Users can insert own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users can insert own ai conversations"
  ON public.ai_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id AND channel = 'web');

DROP POLICY IF EXISTS "Users can update own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users can update own ai conversations"
  ON public.ai_conversations FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users can delete own ai conversations"
  ON public.ai_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ai_conversation_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system_event')),
  content TEXT NOT NULL,
  related_analysis_id UUID NULL,
  trace_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages_conv_created
  ON public.ai_conversation_messages (conversation_id, created_at ASC);

ALTER TABLE public.ai_conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai messages" ON public.ai_conversation_messages;
CREATE POLICY "Users can view own ai messages"
  ON public.ai_conversation_messages FOR SELECT
  USING (auth.uid() = user_id);

-- Clients may only insert their own user-role messages (no forged assistant history).
DROP POLICY IF EXISTS "Users can insert own user messages" ON public.ai_conversation_messages;
CREATE POLICY "Users can insert own user messages"
  ON public.ai_conversation_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role = 'user');

-- ---------------------------------------------------------------------------
-- ai_conversation_summaries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  summary_version TEXT NOT NULL,
  covered_until_message_id UUID NOT NULL,
  covered_message_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_summaries_conv
  ON public.ai_conversation_summaries (conversation_id, created_at DESC);

ALTER TABLE public.ai_conversation_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai summaries" ON public.ai_conversation_summaries;
CREATE POLICY "Users can view own ai summaries"
  ON public.ai_conversation_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- ai_user_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  source TEXT NOT NULL
    CHECK (source IN ('explicit_user_setting', 'explicit_chat_confirmation', 'inferred')),
  confidence NUMERIC NOT NULL DEFAULT 1,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_user_preferences_active_key
  ON public.ai_user_preferences (user_id, key)
  WHERE active = true;

ALTER TABLE public.ai_user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai preferences" ON public.ai_user_preferences;
CREATE POLICY "Users can view own ai preferences"
  ON public.ai_user_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ai preferences" ON public.ai_user_preferences;
CREATE POLICY "Users can insert own ai preferences"
  ON public.ai_user_preferences FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND source IN ('explicit_user_setting', 'explicit_chat_confirmation')
  );

DROP POLICY IF EXISTS "Users can update own ai preferences" ON public.ai_user_preferences;
CREATE POLICY "Users can update own ai preferences"
  ON public.ai_user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own ai preferences" ON public.ai_user_preferences;
CREATE POLICY "Users can delete own ai preferences"
  ON public.ai_user_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ai_reasoned_analysis_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_reasoned_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  conversation_id UUID NULL REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  parent_analysis_id UUID NULL REFERENCES public.ai_reasoned_analysis_results(id) ON DELETE SET NULL,
  job_id UUID NULL,
  analysis_type TEXT NOT NULL,
  analysis_level TEXT NOT NULL DEFAULT 'wallet'
    CHECK (analysis_level IN ('wallet', 'user_portfolio')),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  completion_status TEXT NOT NULL,
  what_matters JSONB NOT NULL DEFAULT '{}'::jsonb,
  monitoring_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  domain_statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  eligible_finding_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_as_of JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NULL,
  trace_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_reasoned_analysis_fingerprint
  ON public.ai_reasoned_analysis_results (user_id, fingerprint)
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_reasoned_analysis_wallet_created
  ON public.ai_reasoned_analysis_results (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reasoned_analysis_user_created
  ON public.ai_reasoned_analysis_results (user_id, created_at DESC);

ALTER TABLE public.ai_reasoned_analysis_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai analyses" ON public.ai_reasoned_analysis_results;
CREATE POLICY "Users can view own ai analyses"
  ON public.ai_reasoned_analysis_results FOR SELECT
  USING (auth.uid() = user_id);

-- No client insert/update/delete — service role only.

-- ---------------------------------------------------------------------------
-- ai_insight_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_insight_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES public.ai_reasoned_analysis_results(id) ON DELETE CASCADE,
  lifecycle_key TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  category TEXT NOT NULL,
  entity_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority_score NUMERIC NOT NULL DEFAULT 0,
  priority_level TEXT NOT NULL DEFAULT 'medium',
  materiality_score NUMERIC NOT NULL DEFAULT 0,
  significance_score NUMERIC NOT NULL DEFAULT 0,
  confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasoning_confidence JSONB NULL,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  observed_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected BOOLEAN NOT NULL DEFAULT false,
  eligible_but_not_selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, finding_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_insight_snapshots_lifecycle
  ON public.ai_insight_snapshots (lifecycle_key);

ALTER TABLE public.ai_insight_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai insight snapshots" ON public.ai_insight_snapshots;
CREATE POLICY "Users can view own ai insight snapshots"
  ON public.ai_insight_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_reasoned_analysis_results a
      WHERE a.id = analysis_id AND a.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- ai_insight_lifecycles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_insight_lifecycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  lifecycle_key TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  category TEXT NOT NULL,
  entity_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  state TEXT NOT NULL
    CHECK (state IN (
      'new','recurring','persistent','worsening','improving','stable',
      'resolved','reopened','superseded','unknown'
    )),
  first_detected_at TIMESTAMPTZ NOT NULL,
  last_detected_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  consecutive_occurrence_count INTEGER NOT NULL DEFAULT 1,
  current_snapshot_id UUID NULL,
  previous_snapshot_id UUID NULL,
  current_priority_score NUMERIC NULL,
  previous_priority_score NUMERIC NULL,
  current_materiality_score NUMERIC NULL,
  previous_materiality_score NUMERIC NULL,
  change JSONB NOT NULL DEFAULT '{}'::jsonb,
  superseded_by_lifecycle_key TEXT NULL,
  memory_version TEXT NOT NULL DEFAULT 'lifecycle-transition-v1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, wallet_id, lifecycle_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_insight_lifecycles_wallet_state
  ON public.ai_insight_lifecycles (wallet_id, state, last_detected_at DESC);

ALTER TABLE public.ai_insight_lifecycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai lifecycles" ON public.ai_insight_lifecycles;
CREATE POLICY "Users can view own ai lifecycles"
  ON public.ai_insight_lifecycles FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ai_monitoring_point_states
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_monitoring_point_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  monitoring_key TEXT NOT NULL,
  lifecycle_key TEXT NULL,
  analysis_id UUID NULL REFERENCES public.ai_reasoned_analysis_results(id) ON DELETE SET NULL,
  metric TEXT NOT NULL,
  state TEXT NOT NULL
    CHECK (state IN ('active','triggered','improved','resolved','expired','superseded')),
  current_value NUMERIC NULL,
  threshold NUMERIC NULL,
  explanation TEXT NOT NULL DEFAULT '',
  last_analysis_id UUID NULL REFERENCES public.ai_reasoned_analysis_results(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, monitoring_key)
);

ALTER TABLE public.ai_monitoring_point_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai monitoring states" ON public.ai_monitoring_point_states;
CREATE POLICY "Users can view own ai monitoring states"
  ON public.ai_monitoring_point_states FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ai_intelligence_timeline_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_intelligence_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  lifecycle_key TEXT NULL,
  analysis_id UUID NOT NULL REFERENCES public.ai_reasoned_analysis_results(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  priority NUMERIC NOT NULL DEFAULT 0,
  confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_timeline_dedup
  ON public.ai_intelligence_timeline_events (
    wallet_id, analysis_id, event_type, COALESCE(lifecycle_key, '')
  );

CREATE INDEX IF NOT EXISTS idx_ai_timeline_wallet_occurred
  ON public.ai_intelligence_timeline_events (wallet_id, occurred_at DESC);

ALTER TABLE public.ai_intelligence_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai timeline" ON public.ai_intelligence_timeline_events;
CREATE POLICY "Users can view own ai timeline"
  ON public.ai_intelligence_timeline_events FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.ai_reasoned_analysis_results IS
  'Package 3 persisted Package-2 reasoned analyses. Historical only — not current financial truth.';
COMMENT ON TABLE public.ai_insight_lifecycles IS
  'Package 3 insight lifecycle across analyses. Service-role writes only.';
