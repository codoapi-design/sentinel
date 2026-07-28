/**
 * POST /api/pricing/backfill
 *
 * Fills missing `value_usd` / `price_usd` on a wallet's transactions using the
 * pricing layer's historical providers.
 *
 * Body: { walletId: string, limit?: number, dryRun?: boolean, force?: boolean }
 *
 * The run is capped at `MAX_BACKFILL_LIMIT` transactions per request so a
 * single call cannot exhaust the route's execution budget. The job is
 * idempotent and resumable — call it repeatedly until `scanned` comes back 0.
 *
 * GET /api/pricing/backfill returns the process-local pricing usage snapshot
 * (provider request counts, cache hit rate) for cost monitoring.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import {
  BackfillAccessError,
  DEFAULT_BACKFILL_LIMIT,
  MAX_BACKFILL_LIMIT,
  backfillTransactionPrices,
} from '@/lib/pricing/backfill';
import { getPricingStats } from '@/lib/pricing/price-service';

export const maxDuration = 60;

async function requireUser(): Promise<{ id: string } | null> {
  const cookieClient = await createCookieServerClient();
  const {
    data: { user },
    error,
  } = await cookieClient.auth.getUser();
  return error || !user ? null : { id: user.id };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const walletId = typeof body?.walletId === 'string' ? body.walletId.trim() : '';
    const dryRun = body?.dryRun === true;
    const force = body?.force === true;

    const requestedLimit = Number(body?.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(MAX_BACKFILL_LIMIT, Math.max(1, Math.floor(requestedLimit)))
      : DEFAULT_BACKFILL_LIMIT;

    if (!walletId) {
      return NextResponse.json({ error: 'walletId is required' }, { status: 400 });
    }

    // Ownership is enforced here and re-checked inside the job, so the job is
    // also safe to call from cron or scripts.
    const supabase = createServerClient();
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id')
      .eq('id', walletId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (walletError) {
      console.error('[Pricing Backfill API] Wallet lookup failed:', walletError.message);
      return NextResponse.json({ error: 'Failed to verify wallet' }, { status: 500 });
    }
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const report = await backfillTransactionPrices({
      walletId,
      userId: user.id,
      limit,
      dryRun,
      force,
    });

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    if (error instanceof BackfillAccessError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('[Pricing Backfill API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      data: {
        limits: {
          defaultLimit: DEFAULT_BACKFILL_LIMIT,
          maxLimit: MAX_BACKFILL_LIMIT,
        },
        stats: getPricingStats(),
      },
    });
  } catch (error) {
    console.error('[Pricing Backfill API] Stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
