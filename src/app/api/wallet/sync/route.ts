import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { getSyncEngine } from '@/lib/blockchain/sync-engine';
import { getBlockchainCache } from '@/lib/blockchain/cache';

export const maxDuration = 300; // Full history pagination can exceed 60s on active wallets

/**
 * POST /api/wallet/sync
 *
 * Trigger a wallet data sync using the hybrid blockchain architecture.
 *
 * Requires authenticated user (cookie-based session).
 *
 * Body:
 * - walletId: UUID of the wallet to sync (required)
 * - mode: 'full' | 'incremental' (default: 'incremental')
 */
export async function POST(request: NextRequest) {
  try {
    // ── Authenticate via cookie session ──
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    // ── Parse request body ──
    const body = await request.json();
    const { walletId, mode = 'incremental' } = body as {
      walletId?: string;
      mode?: 'full' | 'incremental';
    };

    if (!walletId) {
      return NextResponse.json(
        { error: 'walletId is required' },
        { status: 400 },
      );
    }

    if (!['full', 'incremental'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be "full" or "incremental"' },
        { status: 400 },
      );
    }

    // Use service role client for data operations
    const supabase = createServerClient();

    // ── Verify wallet ownership ──
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, address, user_id, is_syncing')
      .eq('id', walletId)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 },
      );
    }

    if (wallet.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You do not own this wallet' },
        { status: 403 },
      );
    }

    // ── Check if already syncing ──
    if (wallet.is_syncing) {
      return NextResponse.json(
        { error: 'Wallet is already being synced. Please wait.' },
        { status: 409 },
      );
    }

    // ── Run sync ──
    const syncEngine = getSyncEngine();
    const result = mode === 'full'
      ? await syncEngine.fullSync(walletId)
      : await syncEngine.incrementalSync(walletId);

    return NextResponse.json({
      success: result.overallSuccess,
      data: {
        walletId: result.walletId,
        address: result.address,
        mode,
        totalRecordsSynced: result.totalRecordsSynced,
        totalDurationMs: result.totalDurationMs,
        results: result.results.map(r => ({
          provider: r.provider,
          dataType: r.dataType,
          recordsSynced: r.recordsSynced,
          durationMs: r.durationMs,
          success: r.success,
          fromCache: r.fromCache,
          errors: r.errors,
        })),
      },
    });
  } catch (error) {
    console.error('[WalletSync] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/wallet/sync
 *
 * Get sync status for a wallet.
 */
export async function GET(request: NextRequest) {
  try {
    // ── Authenticate via cookie session ──
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    // Use service role client for data operations
    const supabase = createServerClient();

    // ── Parse query params ──
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('walletId');

    if (!walletId) {
      return NextResponse.json(
        { error: 'walletId is required' },
        { status: 400 },
      );
    }

    // ── Verify wallet ownership ──
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, address, user_id, is_syncing, last_synced_at, last_synced_block')
      .eq('id', walletId)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 },
      );
    }

    if (wallet.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You do not own this wallet' },
        { status: 403 },
      );
    }

    // ── Get sync status from cache table ──
    const { data: syncStatuses } = await supabase
      .from('sync_status')
      .select('*')
      .eq('wallet_id', walletId)
      .order('last_synced_at', { ascending: false });

    // ── Get cache stats ──
    const cache = getBlockchainCache();
    const cacheStats = await cache.getStats(wallet.address || wallet.id);

    return NextResponse.json({
      success: true,
      data: {
        walletId,
        address: wallet.address,
        isSyncing: wallet.is_syncing || false,
        lastSyncedAt: wallet.last_synced_at,
        lastSyncedBlock: wallet.last_synced_block,
        syncHistory: syncStatuses || [],
        cacheStats,
      },
    });
  } catch (error) {
    console.error('[WalletSync] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
