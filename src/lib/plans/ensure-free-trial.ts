import { buildPeriodEnd, toWalletPlanId } from '@/lib/plans/entitlements';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

const FREE_PLAN_ID = 'free';

/**
 * Ensures a new user gets a 3-day Free Plan subscription row.
 * Idempotent: does nothing if any subscriptions row already exists.
 */
export async function ensureFreeTrialSubscription(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<{ created: boolean; startDate: string; endDate: string } | null> {
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, plan, status, current_period_start, current_period_end')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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

  await supabase.from('subscriptions').insert({
    user_id: userId,
    plan: FREE_PLAN_ID,
    status: 'active',
    current_period_start: startIso,
    current_period_end: endIso,
    cancel_at_period_end: false,
    updated_at: now,
  });

  await supabase
    .from('user_profiles')
    .update({ plan: toWalletPlanId(FREE_PLAN_ID), updated_at: now })
    .eq('user_id', userId);

  return { created: true, startDate: startIso, endDate: endIso };
}
