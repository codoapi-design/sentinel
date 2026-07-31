/**
 * Authoritative plan resolution.
 *
 * `subscriptions` is the single source of truth for entitlements and UI plan labels.
 * `user_profiles.plan` is kept in sync as a denormalized cache for admin/reporting.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizePlanId } from '@/lib/plans/address-families';
import {
  snapshotFromSubscriptionRow,
  toPricingTierId,
  toWalletPlanId,
  type EntitlementSnapshot,
} from '@/lib/plans/entitlements';
import { pricingTiers } from '@/lib/mock-data';
import type { Database } from '@/lib/supabase/types';

export type AuthoritativePlan = {
  /** Pricing tier id: free | starter | pro | enterprise */
  pricingPlanId: string;
  /** Wallet/limits id: free | starter | pro | business */
  walletPlanId: ReturnType<typeof normalizePlanId>;
  planName: string;
  entitlement: EntitlementSnapshot;
  startDate: string | null;
  endDate: string | null;
  status: string;
};

function planNameFor(pricingPlanId: string): string {
  const tier = pricingTiers.find(t => t.id === pricingPlanId);
  return tier?.nameEn || tier?.name || pricingPlanId;
}

/**
 * Map a DB plan string to the pricing-tier id used in `pricingTiers`.
 * Business product id is `enterprise` in pricing; `business` is the wallet alias.
 */
export function canonicalizePricingPlanId(plan: string | null | undefined): string {
  return toPricingTierId(plan || 'starter');
}

/** Best-effort: keep user_profiles.plan aligned with the subscription row. */
export async function syncProfilePlanFromSubscription(
  supabase: SupabaseClient<Database>,
  userId: string,
  pricingPlanId: string,
): Promise<void> {
  // Profile historically allowed starter/pro/enterprise; free may be constrained.
  const profilePlan =
    pricingPlanId === 'free'
      ? 'free'
      : pricingPlanId === 'enterprise'
        ? 'enterprise'
        : toWalletPlanId(pricingPlanId);

  const { error } = await supabase
    .from('user_profiles')
    .update({ plan: profilePlan, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    console.warn('[resolve-plan] profile.plan sync skipped:', error.message);
  }
}

/**
 * Read the latest subscription and optionally sync the profile cache.
 */
export async function resolveAuthoritativePlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  options?: { syncProfile?: boolean },
): Promise<AuthoritativePlan | null> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_start, current_period_end')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return null;

  const pricingPlanId = canonicalizePricingPlanId(sub.plan);
  const walletPlanId = normalizePlanId(pricingPlanId);
  const entitlement = snapshotFromSubscriptionRow({
    ...sub,
    plan: pricingPlanId,
  });

  if (options?.syncProfile !== false) {
    // Keep denormalized profile in sync whenever we resolve (GET paths).
    void syncProfilePlanFromSubscription(supabase, userId, pricingPlanId);
  }

  return {
    pricingPlanId,
    walletPlanId,
    planName: planNameFor(pricingPlanId),
    entitlement: {
      ...entitlement,
      planId: pricingPlanId,
    },
    startDate: sub.current_period_start ?? null,
    endDate: sub.current_period_end ?? null,
    status: sub.status || 'none',
  };
}

/** Wallet/limits plan id only (falls back to starter when no subscription). */
export async function resolveWalletPlanId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ReturnType<typeof normalizePlanId>> {
  const resolved = await resolveAuthoritativePlan(supabase, userId, {
    syncProfile: false,
  });
  return resolved?.walletPlanId ?? 'starter';
}
