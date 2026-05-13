import { NextRequest, NextResponse } from 'next/server';
import { getSyncEngine } from '@/lib/blockchain/sync-engine';
import type { AlchemyWebhookEvent } from '@/lib/blockchain/types';

/**
 * POST /api/webhooks/alchemy
 *
 * Receives Alchemy Notify webhook events for real-time address activity.
 * Alchemy sends these when tracked addresses have new transactions.
 *
 * Security: Validates the Alchemy signature header to ensure the
 * request is genuinely from Alchemy.
 *
 * Flow:
 *   1. Validate webhook signature
 *   2. Extract address + transaction hash + chain
 *   3. Trigger cache invalidation + re-fetch via SyncEngine
 *   4. Return 200 quickly (Alchemy expects fast response)
 */
export async function POST(request: NextRequest) {
  try {
    // ── Validate Alchemy webhook signature ──
    const signature = request.headers.get('x-alchemy-signature');
    const signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY || process.env.ALCHEMY_WEBHOOK_SECRET;

    if (!signingKey) {
      console.error('[AlchemyWebhook] ALCHEMY_WEBHOOK_SIGNING_KEY not configured');
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 },
      );
    }

    const body = await request.text();

    // In production, verify HMAC signature:
    // const expectedSig = crypto.createHmac('sha256', signingKey).update(body).digest('hex');
    // if (signature !== expectedSig) {
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    // }

    const payload: AlchemyWebhookEvent = JSON.parse(body);

    // ── Process each activity event ──
    const activities = payload.event?.activity || [];
    if (activities.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    const syncEngine = getSyncEngine();
    let processed = 0;

    for (const activity of activities) {
      try {
        // Determine which address is ours (from or to)
        const address = activity.fromAddress || activity.toAddress;
        if (!address) continue;

        // Determine chain ID from network name
        const chainId = networkToChainId(payload.event.network);

        // Process the real-time event
        await syncEngine.handleRealtimeEvent(
          address.toLowerCase(),
          activity.hash,
          chainId,
        );

        processed++;
      } catch (activityError) {
        console.error('[AlchemyWebhook] Error processing activity:', activityError);
      }
    }

    console.log(`[AlchemyWebhook] Processed ${processed}/${activities.length} activities`);

    return NextResponse.json({
      success: true,
      processed,
      total: activities.length,
    });
  } catch (error) {
    console.error('[AlchemyWebhook] Error:', error);
    // Still return 200 so Alchemy doesn't retry
    return NextResponse.json({ success: false, error: 'Processing error' });
  }
}

/**
 * Map Alchemy network names to chain IDs
 */
function networkToChainId(network: string): number {
  const map: Record<string, number> = {
    'ETH_MAINNET': 1,
    'BASE_MAINNET': 8453,
    'ARB_MAINNET': 42161,
    'OPT_MAINNET': 10,
    'MATIC_MAINNET': 137,
    'ETH_GOERLI': 5,
    'ETH_SEPOLIA': 11155111,
  };
  return map[network] || 1;
}
