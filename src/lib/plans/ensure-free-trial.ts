import { buildPeriodEnd, toWalletPlanId } from '@/lib/plans/entitlements';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

const FREE_PLAN_ID = 'free';

export type FreeTrialResult = {
  created: boolean;
  startDate: string;
  endDate: string;
};

/**
 * Ensures a new user gets a 3-day Free Plan subscription row.
 * Idempotent: does nothing if any subscriptions row already exists.
 *
 * Note: `subscriptions` is authoritative for entitlements. `user_profiles.plan`
 * is updated when the DB check constraint allows `free`.
 */
export async function ensureFreeTrialSubscription(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<FreeTrialResult> {
  const { data: existing, error: existingError } = await supabase
    .from('subscriptions')
    .select('id, plan, status, current_period_start, current_period_end')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to read subscriptions: ${existingError.message}`);
  }

  if (existing) {
    return {
      created: false,
      startDate: existing.current_period_start || new Date().toISOString(),
      endDate: existing.current_period_end || new Date().toISOString(),
    };
  }

  const start = new Date();
  const end = buildPeriodEnd(start, FREE_PLAN_ID, 'monthly');
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const now = new Date().toISOString();

  // Match live schema (no cancel_at_period_end column in production).
  const { error: insertError } = await supabase.from('subscriptions').insert({
    user_id: userId,
    plan: FREE_PLAN_ID,
    status: 'active',
    current_period_start: startIso,
    current_period_end: endIso,
    updated_at: now,
  });

  if (insertError) {
    throw new Error(`Failed to create Free Plan: ${insertError.message}`);
  }

  // Profile check historically allowed starter/pro/enterprise only — soft-fail if free blocked.
  const walletPlan = toWalletPlanId(FREE_PLAN_ID);
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ plan: walletPlan, updated_at: now })
    .eq('user_id', userId);

  if (profileError) {
    console.warn(
      '[ensureFreeTrial] profile.plan update skipped (subscription still active):',
      profileError.message,
    );
  }

  return { created: true, startDate: startIso, endDate: endIso };
}
