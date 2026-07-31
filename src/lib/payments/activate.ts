import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPeriodEnd, toPricingTierId } from '@/lib/plans/entitlements';
import { syncProfilePlanFromSubscription } from '@/lib/plans/resolve-plan';
import { processReferralPaidConversion } from '@/lib/referrals/core';
import type { Database } from '@/lib/supabase/types';

export async function activatePaidSubscription(args: {
  supabase: SupabaseClient<Database>;
  userId: string;
  planId: string;
  billingPeriod: 'monthly' | 'yearly';
  priceUsd: number;
  txHash: string;
  paymentToken: string;
  paymentChain: number;
}): Promise<{ startDate: string; endDate: string }> {
  const startDate = new Date();
  const pricingPlanId = toPricingTierId(args.planId);
  const endDate = buildPeriodEnd(startDate, pricingPlanId, args.billingPeriod);
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  const { data: existing } = await args.supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', args.userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = {
    user_id: args.userId,
    plan: pricingPlanId,
    status: 'active',
    current_period_start: startIso,
    current_period_end: endIso,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await args.supabase.from('subscriptions').update(row).eq('id', existing.id);
  } else {
    await args.supabase.from('subscriptions').insert(row);
  }

  await syncProfilePlanFromSubscription(args.supabase, args.userId, pricingPlanId);

  try {
    await processReferralPaidConversion({
      supabase: args.supabase,
      payerUserId: args.userId,
      planId: pricingPlanId,
      priceUsd: args.priceUsd,
      billingPeriod: args.billingPeriod,
    });
  } catch (err) {
    console.warn('[Payments] Referral reward skipped:', err);
  }

  return { startDate: startIso, endDate: endIso };
}
