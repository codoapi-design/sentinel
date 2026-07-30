import { NextRequest, NextResponse } from 'next/server';

import {
  generateReferralCode,
  hashSensitive,
  validatePayoutWallet,
  buildReferralAbsoluteUrl,
  REFERRAL_COMMISSION_PCT,
  REFERRAL_COMMISSION_MONTHS,
  MAX_ACTIVATION_REWARDS_PER_MONTH,
} from '@/lib/referrals/core';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';

/**
 * GET /api/referral — status for current user + policy meta
 * POST /api/referral — join program { payoutWallet }
 */
export async function GET() {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const admin = createServerClient();
    const { data: profile } = await admin
      .from('referral_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: userProfile } = await admin
      .from('user_profiles')
      .select('full_name, email, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();

    const displayName =
      userProfile?.full_name?.trim() ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'Member';

    const policy = {
      commissionPct: REFERRAL_COMMISSION_PCT,
      commissionMonths: REFERRAL_COMMISSION_MONTHS,
      activationRewardDays: 30,
      maxActivationRewardsPerMonth: MAX_ACTIVATION_REWARDS_PER_MONTH,
      rules: [
        'Earn 10% of every paid subscription from users who join via your link, for 6 months after they sign up.',
        'When a referred user pays, you also unlock one complimentary month of the same plan — only if you are not already on an active referral reward period.',
        'While your complimentary month is active, new paid referrals still earn you 10%, but do not grant another free month.',
        'After the complimentary month ends, the next paid referral can unlock another matching free month (subject to monthly caps).',
        'Free Plan trials do not count as paid conversions.',
        'Self-referrals and suspicious duplicate activity are blocked.',
        'Commission payouts are sent on-chain to your registered EVM wallet (90% platform / 10% referrer via smart contract).',
      ],
    };

    if (!profile) {
      return NextResponse.json({
        joined: false,
        policy,
        profile: null,
        displayName,
        email: user.email,
        avatarUrl: userProfile?.avatar_url || null,
      });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || undefined;
    const link = buildReferralAbsoluteUrl(profile.referral_code, origin);

    const { data: recent } = await admin
      .from('referral_events')
      .select('id, event_type, plan_id, amount_usd, note, created_at')
      .eq('referrer_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const rewardActive =
      !!profile.reward_plan_active_until &&
      new Date(profile.reward_plan_active_until).getTime() > Date.now();

    return NextResponse.json({
      joined: true,
      policy,
      displayName,
      email: user.email,
      avatarUrl: userProfile?.avatar_url || null,
      profile: {
        referralCode: profile.referral_code,
        payoutWallet: profile.payout_wallet,
        totalReferrals: profile.total_referrals,
        paidConversions: profile.paid_conversions,
        totalCommissionUsd: Number(profile.total_commission_usd || 0),
        activationRewardsGranted: profile.activation_rewards_granted,
        rewardPlanId: profile.reward_plan_id,
        rewardPlanActiveUntil: profile.reward_plan_active_until,
        rewardActive,
        link,
        status: profile.status,
      },
      recentEvents: recent || [],
    });
  } catch (error) {
    console.error('[Referral GET]', error);
    return NextResponse.json({ error: 'Failed to load referral status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const walletCheck = validatePayoutWallet(String(body.payoutWallet || ''));
    if (!walletCheck.ok) {
      return NextResponse.json({ error: walletCheck.error }, { status: 400 });
    }

    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const admin = createServerClient();
    const { data: existing } = await admin
      .from('referral_profiles')
      .select('user_id, referral_code')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyJoined: true,
        referralCode: existing.referral_code,
      });
    }

    // Prevent obvious self-farm: one payout wallet → one active profile
    const { data: walletTaken } = await admin
      .from('referral_profiles')
      .select('user_id')
      .ilike('payout_wallet', walletCheck.address)
      .neq('user_id', user.id)
      .maybeSingle();

    if (walletTaken) {
      return NextResponse.json(
        { error: 'This payout wallet is already linked to another referral account' },
        { status: 409 },
      );
    }

    let code = generateReferralCode(user.id);
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await admin
        .from('referral_profiles')
        .select('user_id')
        .eq('referral_code', code)
        .maybeSingle();
      if (!clash) break;
      code = generateReferralCode(`${user.id}-${i}-${Date.now()}`);
    }

    const { error } = await admin.from('referral_profiles').insert({
      user_id: user.id,
      referral_code: code,
      payout_wallet: walletCheck.address,
      status: 'active',
    });

    if (error) {
      console.error('[Referral Join]', error);
      return NextResponse.json({ error: 'Could not join referral program' }, { status: 500 });
    }

    await admin.from('referral_events').insert({
      referrer_user_id: user.id,
      event_type: 'join',
      amount_usd: 0,
      note: 'Joined referral program',
      metadata: {
        payoutWallet: walletCheck.address,
        ipHash: hashSensitive(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')),
      },
    });

    const origin =
      request.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      undefined;

    return NextResponse.json({
      success: true,
      referralCode: code,
      link: buildReferralAbsoluteUrl(code, origin || undefined),
      payoutWallet: walletCheck.address,
    });
  } catch (error) {
    console.error('[Referral POST]', error);
    return NextResponse.json({ error: 'Failed to join referral program' }, { status: 500 });
  }
}
