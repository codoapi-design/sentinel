/**
 * Server-only subscription entitlement lookups.
 * Import this only from API routes / server modules — never from client stores.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  snapshotFromProfilePlan,
  snapshotFromSubscriptionRow,
  snapshotNone,
  SubscriptionEntitlementError,
  SUBSCRIPTION_EXPIRED_MESSAGE,
  type EntitlementSnapshot,
} from '@/lib/plans/entitlements';
import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

/**
 * Server entitlement: subscriptions table first, then profile.plan as soft signal.
 * Expired / missing period → not entitled (sync + AI blocked).
 */
export async function resolveServerEntitlement(
  userId: string,
  supabase?: SupabaseClient<Database>,
): Promise<EntitlementSnapshot> {
  const client = supabase ?? createServerClient();

  try {
    const { data: sub } = await client
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sub) {
      return snapshotFromSubscriptionRow(sub);
    }
  } catch (err) {
    console.warn('[Entitlement] subscriptions lookup failed:', err);
  }

  // Soft fallback: profile plan without a subscriptions row (legacy / first boot).
  // Once a subscriptions period exists, expiry is enforced above.
  try {
    const { data: profile } = await client
      .from('user_profiles')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.plan) {
      return snapshotFromProfilePlan(profile.plan);
    }
  } catch (err) {
    console.warn('[Entitlement] profile lookup failed:', err);
  }

  return snapshotNone();
}

export async function assertServerEntitlement(
  userId: string,
  supabase?: SupabaseClient<Database>,
): Promise<EntitlementSnapshot> {
  const snap = await resolveServerEntitlement(userId, supabase);
  if (!snap.entitled) {
    throw new SubscriptionEntitlementError(
      snap.reason ?? SUBSCRIPTION_EXPIRED_MESSAGE,
      402,
    );
  }
  return snap;
}

export { SubscriptionEntitlementError };
