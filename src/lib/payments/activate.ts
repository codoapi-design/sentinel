import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPeriodEnd, toWalletPlanId } from '@/lib/plans/entitlements';
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
  const endDate = buildPeriodEnd(startDate, args.planId, args.billingPeriod);
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  await args.supabase
    .from('user_profiles')
    .update({ plan: toWalletPlanId(args.planId), updated_at: new Date().toISOString() })
    .eq('user_id', args.userId);

  const { data: existing } = await args.supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', args.userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = {
    user_id: args.userId,
    plan: args.planId,
    status: 'active',
    current_period_start: startIso,
    current_period_end: endIso,
    cancel_at_period_end: false,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await args.supabase.from('subscriptions').update(row).eq('id', existing.id);
  } else {
    await args.supabase.from('subscriptions').insert(row);
  }

  try {
    await processReferralPaidConversion({
      supabase: args.supabase,
      payerUserId: args.userId,
      planId: args.planId,
      priceUsd: args.priceUsd,
      billingPeriod: args.billingPeriod,
    });
  } catch (err) {
    console.warn('[Payments] Referral reward skipped:', err);
  }

  return { startDate: startIso, endDate: endIso };
}
