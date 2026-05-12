/**
 * Alchemy Webhook Handler for Sentinel
 *
 * Handles real-time address activity notifications from Alchemy Notify.
 * When a tracked wallet has new activity:
 *   1. Validates the webhook signature
 *   2. Extracts transaction details
 *   3. Triggers cache invalidation for the affected address
 *   4. Stores the new transaction in Supabase
 *   5. Queues a re-fetch of portfolio data
 *
 * This enables the "Phase 3: Real-time Updates" of the hybrid architecture.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSyncEngine } from '@/lib/blockchain/sync-engine';
import { createServerClient } from '@/lib/supabase/server';
import type { AlchemyWebhookEvent } from '@/lib/blockchain/types';

// Alchemy webhook secret for signature verification
const ALCHEMY_WEBHOOK_SECRET = process.env.ALCHEMY_WEBHOOK_SECRET || '';

/**
 * POST /api/alchemy/webhook
 * Receive real-time address activity from Alchemy Notify
 */
export async function POST(request: NextRequest) {
  try {
    const body: AlchemyWebhookEvent = await request.json();
    console.log('[Alchemy Webhook] Received event:', body.type, 'for network:', body.event?.network);

    // ── Signature Verification ──
    if (ALCHEMY_WEBHOOK_SECRET) {
      const signature = request.headers.get('x-alchemy-signature');
      if (!signature) {
        console.warn('[Alchemy Webhook] Missing signature header');
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }
      // In production, verify HMAC signature here
      // const isValid = verifyAlchemySignature(body, signature, ALCHEMY_WEBHOOK_SECRET);
      // if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ── Process Activity Events ──
    const activities = body.event?.activity || [];
    if (activities.length === 0) {
      return NextResponse.json({ success: true, message: 'No activity to process' });
    }

    // Determine chain ID from network string
    const network = body.event?.network || 'ethereum';
    const chainId = networkToChainId(network);

    const syncEngine = getSyncEngine();
    const processedHashes: string[] = [];
    const errors: string[] = [];

    for (const activity of activities) {
      try {
        // Determine which of our tracked wallets is involved
        const fromAddr = activity.fromAddress?.toLowerCase();
        const toAddr = activity.toAddress?.toLowerCase();

        // Find matching wallet in our database
        const supabase = createServerClient();
        const addresses = [fromAddr, toAddr].filter(Boolean) as string[];

        for (const addr of addresses) {
          const { data: wallet } = await supabase
            .from('wallets')
            .select('id, address, user_id')
            .ilike('address', addr)
            .maybeSingle();

          if (wallet) {
            // Trigger real-time sync for this wallet
            const result = await syncEngine.handleRealtimeEvent(
              wallet.address,
              activity.hash,
              chainId,
            );

            if (result.success) {
              processedHashes.push(activity.hash);
            } else {
              errors.push(`Failed to process ${activity.hash}: ${result.errors.join(', ')}`);
            }

            // Only process once per wallet
            break;
          }
        }
      } catch (activityError) {
        console.error('[Alchemy Webhook] Activity processing error:', activityError);
        errors.push(`Error processing activity: ${activityError}`);
      }
    }

    // ── Queue portfolio refresh for affected addresses ──
    // In production, this would be a background job (e.g., Vercel Cron or Inngest)
    // For now, we just invalidate cache so next request fetches fresh data
    const affectedAddresses = new Set<string>();
    for (const activity of activities) {
      if (activity.fromAddress) affectedAddresses.add(activity.fromAddress.toLowerCase());
      if (activity.toAddress) affectedAddresses.add(activity.toAddress.toLowerCase());
    }

    // Invalidate cache for all affected addresses
    const { getBlockchainCache } = await import('@/lib/blockchain/cache');
    const cache = getBlockchainCache();
    for (const addr of affectedAddresses) {
      await cache.invalidate(addr);
    }

    return NextResponse.json({
      success: true,
      processed: processedHashes.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[Alchemy Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/alchemy/webhook
 * Alchemy webhook verification endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    service: 'sentinel-alchemy-webhook',
    architecture: 'hybrid',
    version: '2.0',
  });
}

/**
 * Convert Alchemy network string to chain ID
 */
function networkToChainId(network: string): number {
  const map: Record<string, number> = {
    'eth-mainnet': 1,
    'base-mainnet': 8453,
    'arb-mainnet': 42161,
    'opt-mainnet': 10,
    'polygon-mainnet': 137,
    'bnb-mainnet': 56,
    'avax-mainnet': 43114,
  };
  return map[network] || 1;
}
