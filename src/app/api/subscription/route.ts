import { NextRequest, NextResponse } from 'next/server';

import { createCookieServerClient } from '@/lib/supabase/server';

const FREE_TRIAL_DAYS = 3;

// ============================================================
// Subscription API
// ============================================================
// Note: Currently using localStorage for demo.
// When Supabase is connected, this will persist to the database.

// POST /api/subscription — Create or update subscription
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
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const isFree = planId === 'free' || price === 0;
    if (!isFree && (price == null || Number(price) <= 0)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const startDate = bodyStart ? new Date(bodyStart) : new Date();
    const endDate = bodyEnd
      ? new Date(bodyEnd)
      : new Date(
          startDate.getTime() +
            (isFree
              ? FREE_TRIAL_DAYS
              : billingPeriod === 'yearly'
                ? 365
                : 30) *
              24 *
              60 *
              60 *
              1000
        );

    const subscription = {
      planId,
      billingPeriod,
      price: isFree ? 0 : Number(price),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      txHash: isFree ? 'free-trial' : txHash,
      paymentToken: isFree ? 'FREE' : paymentToken,
      paymentChain: isFree ? 0 : paymentChain,
      status: 'active' as const,
      userAddress,
    };

    // Best-effort: stamp plan on the authenticated profile so AI quota can resolve it.
    try {
      const cookieClient = await createCookieServerClient();
      const {
        data: { user },
      } = await cookieClient.auth.getUser();
      if (user) {
        await cookieClient
          .from('user_profiles')
          .update({ plan: planId, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      }
    } catch (err) {
      console.warn('[Subscription] Profile plan update skipped:', err);
    }

    return NextResponse.json({
      success: true,
      subscription,
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}

// GET /api/subscription — Check subscription status
export async function GET(request: NextRequest) {
  const userAddress = request.nextUrl.searchParams.get('address');

  if (!userAddress) {
    return NextResponse.json(
      { error: 'Address is required' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    subscription: null,
    message: 'No subscription found. Using localStorage until Supabase is connected.',
  });
}
