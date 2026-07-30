/**
 * Referral Program — rules, helpers, and server reward processing.
 *
 * Economics:
 *   - 10% commission for 6 months after referred user signs up
 *   - Activation reward: 1 free month of the paid plan, only when referrer
 *     has no active referral-reward period (anti-stacking)
 *
 * Fraud / caps:
 *   - No self-referral
 *   - Same IP/fingerprint as referrer → reject
 *   - Max activation rewards / month
 *   - Max commissions / day per referrer
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toWalletPlanId } from '@/lib/plans/entitlements';
import { isValidEvmAddress } from '@/lib/wallet/address-validation';
import type { Database } from '@/lib/supabase/types';

export const REFERRAL_COOKIE = 'radareum_ref';
export const REFERRAL_COOKIE_MAX_AGE_DAYS = 30;

export const REFERRAL_COMMISSION_PCT = 0.1;
export const REFERRAL_COMMISSION_MONTHS = 6;
export const REFERRAL_ACTIVATION_REWARD_DAYS = 30;

/** Hard caps to limit abuse / cost spikes */
export const MAX_ACTIVATION_REWARDS_PER_MONTH = 3;
export const MAX_COMMISSION_EVENTS_PER_DAY = 20;
export const MAX_PENDING_ATTRIBUTIONS_PER_CODE_PER_DAY = 50;

export function generateReferralCode(userId: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  let code = '';
  let n = hash || 1;
  for (let i = 0; i < 6; i++) {
    code += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length) + (i + 1) * 17;
  }
  // Extra entropy from timestamp slice so collisions stay rare
  const tail = Date.now().toString(36).slice(-2).toUpperCase();
  return `${code}${tail}`.slice(0, 8);
}

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 4 && code.length <= 16 ? code : null;
}

export function validatePayoutWallet(address: string): { ok: true; address: string } | { ok: false; error: string } {
  const trimmed = address.trim();
  if (!isValidEvmAddress(trimmed)) {
    return { ok: false, error: 'Enter a valid EVM wallet address (0x + 40 hex characters)' };
  }
  return { ok: true, address: trimmed };
}

export function buildReferralPath(code: string): string {
  return `/r/${encodeURIComponent(code)}`;
}

export function buildReferralAbsoluteUrl(code: string, origin?: string): string {
  const base =
    origin ||
    (typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL) ||
    '';
  return `${base.replace(/\/$/, '')}${buildReferralPath(code)}`;
}

export function hashSensitive(value: string | null | undefined): string | null {
  if (!value) return null;
  // Lightweight non-crypto fingerprint for fraud signals (not for security secrets).
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export type ReferralRewardResult = {
  commissionUsd: number;
  activationGranted: boolean;
  blockedReason: string | null;
};

/**
 * Process a paid subscription for referral rewards.
 * Call only for paid plans (not free trial).
 */
export async function processReferralPaidConversion(args: {
  supabase: SupabaseClient<Database>;
  payerUserId: string;
  planId: string;
  priceUsd: number;
  billingPeriod: 'monthly' | 'yearly';
}): Promise<ReferralRewardResult> {
  const { supabase, payerUserId, planId, priceUsd, billingPeriod } = args;
  const empty: ReferralRewardResult = {
    commissionUsd: 0,
    activationGranted: false,
    blockedReason: null,
  };

  if (priceUsd <= 0 || planId === 'free') {
    return { ...empty, blockedReason: 'free_plan' };
  }

  const { data: attribution } = await supabase
    .from('referral_attributions')
    .select('*')
    .eq('referred_user_id', payerUserId)
    .in('status', ['signed_up', 'converted'])
    .maybeSingle();

  if (!attribution) return { ...empty, blockedReason: 'no_attribution' };

  if (attribution.referrer_user_id === payerUserId) {
    return { ...empty, blockedReason: 'self_referral' };
  }

  const now = new Date();
  const periodEnd = attribution.commission_period_end
    ? new Date(attribution.commission_period_end)
    : null;

  if (!periodEnd || periodEnd.getTime() < now.getTime()) {
    return { ...empty, blockedReason: 'commission_window_expired' };
  }

  const { data: referrer } = await supabase
    .from('referral_profiles')
    .select('*')
    .eq('user_id', attribution.referrer_user_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!referrer) return { ...empty, blockedReason: 'referrer_inactive' };

  // Daily commission cap
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: dayCount } = await supabase
    .from('referral_events')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_user_id', referrer.user_id)
    .eq('event_type', 'commission')
    .gte('created_at', dayStart.toISOString());

  if ((dayCount || 0) >= MAX_COMMISSION_EVENTS_PER_DAY) {
    await supabase.from('referral_events').insert({
      referrer_user_id: referrer.user_id,
      referred_user_id: payerUserId,
      attribution_id: attribution.id,
      event_type: 'blocked',
      plan_id: planId,
      amount_usd: 0,
      note: 'Daily commission cap reached',
      metadata: { cap: MAX_COMMISSION_EVENTS_PER_DAY },
    });
    return { ...empty, blockedReason: 'daily_commission_cap' };
  }

  const commissionUsd = Math.round(priceUsd * REFERRAL_COMMISSION_PCT * 10000) / 10000;

  await supabase.from('referral_events').insert({
    referrer_user_id: referrer.user_id,
    referred_user_id: payerUserId,
    attribution_id: attribution.id,
    event_type: 'commission',
    plan_id: planId,
    amount_usd: commissionUsd,
    commission_pct: REFERRAL_COMMISSION_PCT,
    note: `10% of ${billingPeriod} subscription (pending on-chain payout)`,
    metadata: {
      priceUsd,
      payoutWallet: referrer.payout_wallet,
      billingPeriod,
    },
  });

  const isFirstPaid = !attribution.first_paid_at;
  await supabase
    .from('referral_attributions')
    .update({
      status: 'converted',
      first_paid_at: attribution.first_paid_at || now.toISOString(),
      total_commission_usd: Number(attribution.total_commission_usd || 0) + commissionUsd,
      updated_at: now.toISOString(),
    })
    .eq('id', attribution.id);

  await supabase
    .from('referral_profiles')
    .update({
      total_commission_usd: Number(referrer.total_commission_usd || 0) + commissionUsd,
      paid_conversions: Number(referrer.paid_conversions || 0) + (isFirstPaid ? 1 : 0),
      updated_at: now.toISOString(),
    })
    .eq('user_id', referrer.user_id);

  // Activation reward — only if no concurrent reward period is active
  let activationGranted = false;
  const rewardUntil = referrer.reward_plan_active_until
    ? new Date(referrer.reward_plan_active_until)
    : null;
  const rewardActive = rewardUntil != null && rewardUntil.getTime() > now.getTime();

  if (!rewardActive) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const { count: monthRewards } = await supabase
      .from('referral_events')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', referrer.user_id)
      .eq('event_type', 'activation_reward')
      .gte('created_at', monthStart.toISOString());

    if ((monthRewards || 0) < MAX_ACTIVATION_REWARDS_PER_MONTH) {
      const rewardEnd = addDays(now, REFERRAL_ACTIVATION_REWARD_DAYS);
      const walletPlan = toWalletPlanId(planId);

      await supabase
        .from('referral_profiles')
        .update({
          reward_plan_id: planId,
          reward_plan_active_until: rewardEnd.toISOString(),
          activation_rewards_granted: Number(referrer.activation_rewards_granted || 0) + 1,
          updated_at: now.toISOString(),
        })
        .eq('user_id', referrer.user_id);

      // Extend / set subscription period for referrer as complimentary month
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id, current_period_end, plan')
        .eq('user_id', referrer.user_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const periodStart = now.toISOString();
      const periodEndIso = rewardEnd.toISOString();
      const subRow = {
        user_id: referrer.user_id,
        plan: planId,
        status: 'active',
        current_period_start: periodStart,
        current_period_end: periodEndIso,
        cancel_at_period_end: false,
        updated_at: now.toISOString(),
      };

      if (existingSub?.id) {
        // If they already have a longer paid period, keep the later end — still stamp reward flag
        const existingEnd = existingSub.current_period_end
          ? new Date(existingSub.current_period_end)
          : null;
        const keepEnd =
          existingEnd && existingEnd.getTime() > rewardEnd.getTime()
            ? existingEnd.toISOString()
            : periodEndIso;
        await supabase
          .from('subscriptions')
          .update({
            ...subRow,
            current_period_end: keepEnd,
            // Prefer higher plan if already on higher? Keep rewarded plan for marketing clarity.
            plan: planId,
          })
          .eq('id', existingSub.id);
      } else {
        await supabase.from('subscriptions').insert(subRow);
      }

      await supabase
        .from('user_profiles')
        .update({ plan: walletPlan, updated_at: now.toISOString() })
        .eq('user_id', referrer.user_id);

      await supabase.from('referral_events').insert({
        referrer_user_id: referrer.user_id,
        referred_user_id: payerUserId,
        attribution_id: attribution.id,
        event_type: 'activation_reward',
        plan_id: planId,
        amount_usd: 0,
        note: `Complimentary ${REFERRAL_ACTIVATION_REWARD_DAYS}-day ${planId} plan`,
        metadata: { rewardUntil: rewardEnd.toISOString() },
      });

      await supabase
        .from('referral_attributions')
        .update({
          activation_reward_granted: true,
          updated_at: now.toISOString(),
        })
        .eq('id', attribution.id);

      activationGranted = true;
    }
  }

  return { commissionUsd, activationGranted, blockedReason: null };
}

/**
 * Bind a signed-in user to a referral code (from cookie).
 */
export async function attributeReferralSignup(args: {
  supabase: SupabaseClient<Database>;
  referredUserId: string;
  referralCode: string;
  ipHash?: string | null;
  fingerprintHash?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const code = normalizeReferralCode(args.referralCode);
  if (!code) return { ok: false, reason: 'invalid_code' };

  const { data: referrer } = await args.supabase
    .from('referral_profiles')
    .select('user_id, referral_code, status')
    .eq('referral_code', code)
    .eq('status', 'active')
    .maybeSingle();

  if (!referrer) return { ok: false, reason: 'code_not_found' };
  if (referrer.user_id === args.referredUserId) {
    return { ok: false, reason: 'self_referral' };
  }

  // Already attributed?
  const { data: existing } = await args.supabase
    .from('referral_attributions')
    .select('id')
    .eq('referred_user_id', args.referredUserId)
    .maybeSingle();
  if (existing) return { ok: false, reason: 'already_attributed' };

  // Same IP / fingerprint as an earlier attribution from this referrer for THIS user path —
  // check if referrer recently had join event from same fingerprint (soft block)
  if (args.fingerprintHash) {
    const { data: twin } = await args.supabase
      .from('referral_attributions')
      .select('id, referred_user_id')
      .eq('referrer_user_id', referrer.user_id)
      .eq('fingerprint_hash', args.fingerprintHash)
      .neq('referred_user_id', args.referredUserId)
      .limit(1)
      .maybeSingle();

    // Allow — fingerprint collision alone isn't enough; combine with IP
    if (twin && args.ipHash) {
      const { data: ipTwin } = await args.supabase
        .from('referral_attributions')
        .select('id')
        .eq('referrer_user_id', referrer.user_id)
        .eq('ip_hash', args.ipHash)
        .eq('fingerprint_hash', args.fingerprintHash)
        .limit(1)
        .maybeSingle();
      if (ipTwin) {
        await args.supabase.from('referral_attributions').insert({
          referrer_user_id: referrer.user_id,
          referred_user_id: args.referredUserId,
          referral_code: code,
          status: 'rejected',
          reject_reason: 'fingerprint_ip_collision',
          ip_hash: args.ipHash,
          fingerprint_hash: args.fingerprintHash,
        });
        return { ok: false, reason: 'fraud_signal' };
      }
    }
  }

  const now = new Date();
  const commissionPeriodEnd = addMonths(now, REFERRAL_COMMISSION_MONTHS);

  const { error } = await args.supabase.from('referral_attributions').insert({
    referrer_user_id: referrer.user_id,
    referred_user_id: args.referredUserId,
    referral_code: code,
    status: 'signed_up',
    signed_up_at: now.toISOString(),
    commission_period_end: commissionPeriodEnd.toISOString(),
    ip_hash: args.ipHash ?? null,
    fingerprint_hash: args.fingerprintHash ?? null,
  });

  if (error) {
    console.warn('[Referral] attribute insert failed:', error.message);
    return { ok: false, reason: 'insert_failed' };
  }

  // Increment referral count
  const { data: profile } = await args.supabase
    .from('referral_profiles')
    .select('total_referrals')
    .eq('user_id', referrer.user_id)
    .maybeSingle();

  await args.supabase
    .from('referral_profiles')
    .update({
      total_referrals: Number(profile?.total_referrals || 0) + 1,
      updated_at: now.toISOString(),
    })
    .eq('user_id', referrer.user_id);

  await args.supabase
    .from('user_profiles')
    .update({ referred_by: referrer.user_id, updated_at: now.toISOString() })
    .eq('user_id', args.referredUserId);

  return { ok: true };
}
