import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// Subscription API
// ============================================================
// Note: Currently using localStorage for demo.
// When Supabase is connected, this will persist to the database.

// POST /api/subscription — Create or update subscription
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, billingPeriod, price, txHash, paymentToken, paymentChain, userAddress } = body;

    if (!planId || !billingPeriod || !price || !txHash) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const startDate = new Date();
    const endDate = new Date(
      startDate.getTime() + (billingPeriod === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000
    );

    const subscription = {
      planId,
      billingPeriod,
      price,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      txHash,
      paymentToken,
      paymentChain,
      status: 'active' as const,
      userAddress,
    };

    // TODO: When Supabase is connected:
    // 1. Verify the transaction on-chain (check txHash, amount, recipient)
    // 2. Store subscription in Supabase
    // 3. Link to user account

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

  // TODO: When Supabase is connected:
  // Query subscription from database

  return NextResponse.json({
    subscription: null,
    message: 'No subscription found. Using localStorage until Supabase is connected.',
  });
}
