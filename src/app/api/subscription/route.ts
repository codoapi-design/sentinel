import { NextRequest, NextResponse } from 'next/server';

import { buildPeriodEnd } from '@/lib/plans/entitlements';
import { ensureFreeTrialSubscription } from '@/lib/plans/ensure-free-trial';
import { pricingTiers } from '@/lib/mock-data';
import { processReferralPaidConversion } from '@/lib/referrals/core';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';

// ============================================================
// Subscription API
// ============================================================

// POST /api/subscription — Create or renew subscription (starts a fresh period)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      planId,
      billingPeriod,
      price,
      txHash,
      paymentToken,
      paymentChain,
      userAddress,
      startDate: bodyStart,
      endDate: bodyEnd,
    } = body;

    if (!planId || !billingPeriod || txHash == null || txHash === '') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const tier = pricingTiers.find(t => t.id === planId);
    const isFree = planId === 'free' || tier?.isFree === true || price === 0;
    if (!isFree && (price == null || Number(price) < 0)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const period = billingPeriod === 'yearly' ? 'yearly' : 'monthly';
    const startDate = bodyStart ? new Date(bodyStart) : new Date();
    const endDate = bodyEnd
      ? new Date(bodyEnd)
      : buildPeriodEnd(startDate, planId, period);

    const subscription = {
      planId,
      billingPeriod: period,
      price: isFree ? 0 : Number(price),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      txHash: isFree ? 'free-trial' : String(txHash),
      paymentToken: isFree ? 'FREE' : paymentToken,
      paymentChain: isFree ? 0 : paymentChain,
      status: 'active' as const,
      userAddress,
    };

    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();

    if (user) {
      // Persist period so server sync/AI gates can enforce expiry.
      // Profile.plan is synced from the subscription row (authoritative).
      try {
        const admin = createServerClient();
        const { toPricingTierId } = await import('@/lib/plans/entitlements');
        const { syncProfilePlanFromSubscription } = await import('@/lib/plans/resolve-plan');
        const pricingPlanId = toPricingTierId(planId);

        const { data: existing } = await admin
          .from('subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const row = {
          user_id: user.id,
          plan: pricingPlanId,
          status: 'active',
          current_period_start: subscription.startDate,
          current_period_end: subscription.endDate,
          updated_at: new Date().toISOString(),
        };

        if (existing?.id) {
          await admin.from('subscriptions').update(row).eq('id', existing.id);
        } else {
          await admin.from('subscriptions').insert(row);
        }

        await syncProfilePlanFromSubscription(admin, user.id, pricingPlanId);

        // Referral rewards (paid plans only)
        if (!isFree && user) {
          try {
            const reward = await processReferralPaidConversion({
              supabase: admin,
              payerUserId: user.id,
              planId: pricingPlanId,
              priceUsd: Number(subscription.price) || 0,
              billingPeriod: period,
            });
            if (reward.commissionUsd > 0 || reward.activationGranted) {
              console.log('[Subscription] Referral reward processed:', reward);
            }
          } catch (refErr) {
            console.warn('[Subscription] Referral reward skipped:', refErr);
          }
        }
      } catch (err) {
        console.warn('[Subscription] subscriptions upsert skipped:', err);
      }
    }

    return NextResponse.json({
      success: true,
      subscription,
      resumeSync: true,
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}

// GET /api/subscription — Check subscription status for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const admin = createServerClient();

    // OAuth / first login: grant Free Plan if the user has no subscription yet
    try {
      await ensureFreeTrialSubscription(user.id, admin);
    } catch (err) {
      console.warn('[Subscription GET] ensure free trial skipped:', err);
    }

    const { resolveAuthoritativePlan } = await import('@/lib/plans/resolve-plan');
    const resolved = await resolveAuthoritativePlan(admin, user.id, { syncProfile: true });

    if (!resolved) {
      return NextResponse.json({
        subscription: null,
        entitled: false,
      });
    }

    return NextResponse.json({
      subscription: {
        planId: resolved.pricingPlanId,
        planName: resolved.planName,
        status: resolved.entitlement.entitled ? 'active' : 'expired',
        startDate: resolved.startDate,
        endDate: resolved.endDate,
      },
      entitled: resolved.entitlement.entitled,
    });
  } catch (error) {
    console.error('Subscription GET error:', error);
    const userAddress = request.nextUrl.searchParams.get('address');
    if (!userAddress) {
      return NextResponse.json({ subscription: null, entitled: false });
    }
    return NextResponse.json({
      subscription: null,
      entitled: false,
      message: 'No subscription found.',
    });
  }
}
