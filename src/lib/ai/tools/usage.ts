/**
 * Sentinel AI — Usage Tracking & Free Plan Quota
 *
 * Daily counters (`chat_count`, `analysis_count`) roll over for paid plans.
 * Free Plan accumulates a lifetime request total in `total_input_tokens` is NOT
 * used for that — instead we keep a parallel lifetime sum by never resetting
 * daily counters while the user's profile plan is `free`, and gate at 50.
 *
 * Tracking failures are swallowed; quota failures reject the request.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { LlmUsage } from '@/lib/ai/llm';
import { pricingTiers } from '@/lib/mock-data';
import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import { normalizePlanId } from '@/lib/plans/address-families';

export type AiUsageKind = 'chat' | 'analysis';

export interface RecordAiUsageInput {
  userId: string;
  kind: AiUsageKind;
  /** Token counts from the LLM path; absent on the deterministic path. */
  usage?: LlmUsage;
  supabase?: SupabaseClient<Database>;
  /** When true (Free Plan), daily counters do not reset — trial-lifetime total. */
  accumulateLifetime?: boolean;
}

export interface AiUsageSnapshot {
  chatCount: number;
  analysisCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastResetDate: string;
  /** chat + analysis for the active counting window. */
  requestCount: number;
}

export class AiQuotaError extends Error {
  readonly status = 403;
  readonly used: number;
  readonly limit: number;

  constructor(used: number, limit: number) {
    super(`Free Plan AI limit reached (${used}/${limit}). Upgrade to continue.`);
    this.name = 'AiQuotaError';
    this.used = used;
    this.limit = limit;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function requestCount(snapshot: Pick<AiUsageSnapshot, 'chatCount' | 'analysisCount'>): number {
  return snapshot.chatCount + snapshot.analysisCount;
}

/** Resolve the caller's plan from user_profiles (defaults to starter). */
export async function resolveUserPlanId(
  userId: string,
  supabase?: SupabaseClient<Database>,
): Promise<string> {
  try {
    const client = supabase ?? createServerClient();
    const { data } = await client
      .from('user_profiles')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle();
    return (data?.plan || 'starter').toLowerCase();
  } catch {
    return 'starter';
  }
}

export function getAiRequestLimit(planId: string | null | undefined): number | null {
  const key = (planId || 'starter').toLowerCase();
  const tier = pricingTiers.find(t => t.id === key);
  if (tier?.limits.aiRequests !== undefined) {
    return tier.limits.aiRequests ?? null;
  }
  if (normalizePlanId(planId) === 'free') return 50;
  return null;
}

/** Read current usage snapshot without mutating. */
export async function getAiUsageSnapshot(
  userId: string,
  opts?: { supabase?: SupabaseClient<Database>; accumulateLifetime?: boolean },
): Promise<AiUsageSnapshot | null> {
  const id = userId?.trim();
  if (!id) return null;

  try {
    const supabase = opts?.supabase ?? createServerClient();
    const { data: existing } = await supabase
      .from('ai_usage')
      .select('chat_count, analysis_count, last_reset_date, total_input_tokens, total_output_tokens')
      .eq('user_id', id)
      .maybeSingle();

    if (!existing) {
      return {
        chatCount: 0,
        analysisCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        lastResetDate: today(),
        requestCount: 0,
      };
    }

    const sameDay = existing.last_reset_date === today();
    const chatCount =
      opts?.accumulateLifetime || sameDay ? existing.chat_count ?? 0 : 0;
    const analysisCount =
      opts?.accumulateLifetime || sameDay ? existing.analysis_count ?? 0 : 0;

    return {
      chatCount,
      analysisCount,
      totalInputTokens: existing.total_input_tokens ?? 0,
      totalOutputTokens: existing.total_output_tokens ?? 0,
      lastResetDate: existing.last_reset_date ?? today(),
      requestCount: chatCount + analysisCount,
    };
  } catch (error) {
    console.warn('[AI Usage] Failed to read usage:', error);
    return null;
  }
}

/**
 * Rejects Free Plan callers who have used their shared AI budget.
 * Paid / uncapped plans always pass.
 */
export async function assertAiQuota(
  userId: string,
  planId?: string | null,
  supabase?: SupabaseClient<Database>,
): Promise<{ ok: true; used: number; limit: number | null; planId: string }> {
  const resolvedPlan = (planId ?? (await resolveUserPlanId(userId, supabase))).toLowerCase();
  const limit = getAiRequestLimit(resolvedPlan);
  if (limit == null) {
    return { ok: true, used: 0, limit: null, planId: resolvedPlan };
  }

  const isFree = normalizePlanId(resolvedPlan) === 'free';
  const snapshot = await getAiUsageSnapshot(userId, {
    supabase,
    accumulateLifetime: isFree,
  });
  const used = snapshot?.requestCount ?? 0;

  if (used >= limit) {
    throw new AiQuotaError(used, limit);
  }

  return { ok: true, used, limit, planId: resolvedPlan };
}

/** Records one AI interaction. Never throws and never rejects. */
export async function recordAiUsage(input: RecordAiUsageInput): Promise<AiUsageSnapshot | null> {
  const userId = input.userId?.trim();
  if (!userId) return null;

  try {
    const supabase = input.supabase ?? createServerClient();
    const date = today();
    const inputTokens = input.usage?.promptTokens ?? 0;
    const outputTokens = input.usage?.completionTokens ?? 0;

    const { data: existing } = await supabase
      .from('ai_usage')
      .select('chat_count, analysis_count, last_reset_date, total_input_tokens, total_output_tokens')
      .eq('user_id', userId)
      .maybeSingle();

    const sameDay = existing?.last_reset_date === date;
    const keepPrior = input.accumulateLifetime === true || sameDay;
    const baseChat = keepPrior ? existing?.chat_count ?? 0 : 0;
    const baseAnalysis = keepPrior ? existing?.analysis_count ?? 0 : 0;

    const next: AiUsageSnapshot = {
      chatCount: baseChat + (input.kind === 'chat' ? 1 : 0),
      analysisCount: baseAnalysis + (input.kind === 'analysis' ? 1 : 0),
      totalInputTokens: (existing?.total_input_tokens ?? 0) + inputTokens,
      totalOutputTokens: (existing?.total_output_tokens ?? 0) + outputTokens,
      lastResetDate: date,
      requestCount: 0,
    };
    next.requestCount = requestCount(next);

    const { error } = await supabase.from('ai_usage').upsert(
      {
        user_id: userId,
        chat_count: next.chatCount,
        analysis_count: next.analysisCount,
        last_reset_date: next.lastResetDate,
        total_input_tokens: next.totalInputTokens,
        total_output_tokens: next.totalOutputTokens,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.warn('[AI Usage] Failed to record usage:', error.message);
      return null;
    }

    return next;
  } catch (error) {
    console.warn('[AI Usage] Failed to record usage:', error);
    return null;
  }
}
