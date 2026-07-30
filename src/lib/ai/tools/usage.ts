/**
 * Radareum AI — Usage Tracking & Plan Quotas
 *
 * Counting windows:
 *   - Free Plan: lifetime (no daily reset) for the trial budget
 *   - Starter / Pro: calendar-month window (YYYY-MM)
 *   - Business: unlimited (no gate)
 *
 * Also requires an active subscription period (server entitlement).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { LlmUsage } from '@/lib/ai/llm';
import { pricingTiers } from '@/lib/mock-data';
import { normalizePlanId } from '@/lib/plans/address-families';
import {
  assertServerEntitlement,
  SubscriptionEntitlementError,
} from '@/lib/plans/entitlements-server';
import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

export type AiUsageKind = 'chat' | 'analysis';

export type AiQuotaWindow = 'lifetime' | 'month' | 'day';

export interface RecordAiUsageInput {
  userId: string;
  kind: AiUsageKind;
  usage?: LlmUsage;
  supabase?: SupabaseClient<Database>;
  window?: AiQuotaWindow;
}

export interface AiUsageSnapshot {
  chatCount: number;
  analysisCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastResetDate: string;
  requestCount: number;
}

export class AiQuotaError extends Error {
  readonly status = 403;
  readonly used: number;
  readonly limit: number;

  constructor(used: number, limit: number, planLabel = 'plan') {
    super(
      `${planLabel} AI limit reached (${used}/${limit}). Upgrade or wait for the next period to continue.`,
    );
    this.name = 'AiQuotaError';
    this.used = used;
    this.limit = limit;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function requestCount(snapshot: Pick<AiUsageSnapshot, 'chatCount' | 'analysisCount'>): number {
  return snapshot.chatCount + snapshot.analysisCount;
}

export function resolveAiQuotaWindow(planId: string | null | undefined): AiQuotaWindow {
  const normalized = normalizePlanId(planId);
  if (normalized === 'free') return 'lifetime';
  if (normalized === 'business') return 'month'; // unused when unlimited
  return 'month';
}

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
  const tier = pricingTiers.find(t => t.id === key || (key === 'business' && t.id === 'enterprise'));
  if (tier?.limits.aiRequests !== undefined) {
    return tier.limits.aiRequests ?? null;
  }
  if (normalizePlanId(planId) === 'free') return 50;
  return null;
}

function countsInWindow(
  existing: {
    chat_count: number | null;
    analysis_count: number | null;
    last_reset_date: string | null;
  } | null,
  window: AiQuotaWindow,
): { chat: number; analysis: number; resetDate: string } {
  const date = today();
  if (!existing) return { chat: 0, analysis: 0, resetDate: date };

  if (window === 'lifetime') {
    return {
      chat: existing.chat_count ?? 0,
      analysis: existing.analysis_count ?? 0,
      resetDate: date,
    };
  }

  if (window === 'month') {
    const sameMonth = monthKey(existing.last_reset_date ?? '') === monthKey(date);
    return {
      chat: sameMonth ? existing.chat_count ?? 0 : 0,
      analysis: sameMonth ? existing.analysis_count ?? 0 : 0,
      resetDate: date,
    };
  }

  const sameDay = existing.last_reset_date === date;
  return {
    chat: sameDay ? existing.chat_count ?? 0 : 0,
    analysis: sameDay ? existing.analysis_count ?? 0 : 0,
    resetDate: date,
  };
}

export async function getAiUsageSnapshot(
  userId: string,
  opts?: { supabase?: SupabaseClient<Database>; window?: AiQuotaWindow },
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

    const window = opts?.window ?? 'month';
    const base = countsInWindow(existing, window);

    return {
      chatCount: base.chat,
      analysisCount: base.analysis,
      totalInputTokens: existing?.total_input_tokens ?? 0,
      totalOutputTokens: existing?.total_output_tokens ?? 0,
      lastResetDate: existing?.last_reset_date ?? today(),
      requestCount: base.chat + base.analysis,
    };
  } catch (error) {
    console.warn('[AI Usage] Failed to read usage:', error);
    return null;
  }
}

/**
 * Requires active subscription, then enforces plan AI caps.
 */
export async function assertAiQuota(
  userId: string,
  planId?: string | null,
  supabase?: SupabaseClient<Database>,
): Promise<{ ok: true; used: number; limit: number | null; planId: string }> {
  const entitlement = await assertServerEntitlement(userId, supabase);
  const resolvedPlan = (planId ?? entitlement.planId).toLowerCase();
  const limit = getAiRequestLimit(resolvedPlan);
  if (limit == null) {
    return { ok: true, used: 0, limit: null, planId: resolvedPlan };
  }

  const window = resolveAiQuotaWindow(resolvedPlan);
  const snapshot = await getAiUsageSnapshot(userId, { supabase, window });
  const used = snapshot?.requestCount ?? 0;
  const tier = pricingTiers.find(
    t => t.id === resolvedPlan || (resolvedPlan === 'business' && t.id === 'enterprise'),
  );
  const label = tier?.nameEn ?? 'Plan';

  if (used >= limit) {
    throw new AiQuotaError(used, limit, label);
  }

  return { ok: true, used, limit, planId: resolvedPlan };
}

export async function recordAiUsage(input: RecordAiUsageInput): Promise<AiUsageSnapshot | null> {
  const userId = input.userId?.trim();
  if (!userId) return null;

  try {
    const supabase = input.supabase ?? createServerClient();
    const planId = await resolveUserPlanId(userId, supabase);
    const window = input.window ?? resolveAiQuotaWindow(planId);
    const inputTokens = input.usage?.promptTokens ?? 0;
    const outputTokens = input.usage?.completionTokens ?? 0;

    const { data: existing } = await supabase
      .from('ai_usage')
      .select('chat_count, analysis_count, last_reset_date, total_input_tokens, total_output_tokens')
      .eq('user_id', userId)
      .maybeSingle();

    const base = countsInWindow(existing, window);
    const next: AiUsageSnapshot = {
      chatCount: base.chat + (input.kind === 'chat' ? 1 : 0),
      analysisCount: base.analysis + (input.kind === 'analysis' ? 1 : 0),
      totalInputTokens: (existing?.total_input_tokens ?? 0) + inputTokens,
      totalOutputTokens: (existing?.total_output_tokens ?? 0) + outputTokens,
      lastResetDate: base.resetDate,
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

export { SubscriptionEntitlementError };
