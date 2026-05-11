import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[Alchemy Webhook] Received:', JSON.stringify(body).slice(0, 500));

    // Process Alchemy webhook events (address activity, mined transactions, etc.)
    // In production, this would trigger data sync for the affected wallet

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Alchemy Webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Alchemy webhook verification
  return NextResponse.json({ status: 'ok', service: 'sentinel-alchemy-webhook' });
}
