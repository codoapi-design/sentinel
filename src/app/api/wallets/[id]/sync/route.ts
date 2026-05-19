/**
 * Wallet Sync API Route
 *
 * POST /api/wallets/[id]/sync
 * Trigger a data sync for a wallet using the hybrid architecture
 *
 * Modes:
 *   - full: Complete initial sync from all providers (Covalent history + Zerion balances + DeBank DeFi)
 *   - incremental: Only fetch new data since last sync (Alchemy new transactions + updated balances)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { getSyncEngine } from '@/lib/blockchain/sync-engine';

export const maxDuration = 60; // Allow up to 60 seconds for sync

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/wallets/[id]/sync
 * Sync wallet data using hybrid provider architecture
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: walletId } = await params;
    const body = await request.json().catch(() => ({}));
    const mode = body.mode || 'incremental';

    // ── Authenticate user via cookie session ──
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();

    if (authError || !user) {
      console.error('[WalletSync] Auth error:', authError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    // Use service role client for data operations (bypasses RLS)
    const supabase = createServerClient();

    // Get wallet info - verify it belongs to this user
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      console.error('[WalletSync] Wallet not found:', walletError);
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 },
      );
    }

    if (wallet.is_syncing) {
      return NextResponse.json(
        { error: 'Wallet is already syncing' },
        { status: 409 },
      );
    }

    console.log(`[WalletSync] Starting ${mode} sync for ${wallet.address}`);

    const syncEngine = getSyncEngine();

    // Choose sync mode
    const result = mode === 'full'
      ? await syncEngine.fullSync(walletId)
      : await syncEngine.incrementalSync(walletId);

    console.log(`[WalletSync] ${mode} sync completed for ${wallet.address}:`, {
      success: result.overallSuccess,
      records: result.totalRecordsSynced,
      durationMs: result.totalDurationMs,
      results: result.results.map(r => ({
        provider: r.provider,
        dataType: r.dataType,
        recordsSynced: r.recordsSynced,
        success: r.success,
        errors: r.errors,
      })),
    });

    return NextResponse.json({
      success: result.overallSuccess,
      mode,
      walletId: result.walletId,
      address: result.address,
      totalRecordsSynced: result.totalRecordsSynced,
      durationMs: result.totalDurationMs,
      results: result.results.map(r => ({
        provider: r.provider,
        dataType: r.dataType,
        recordsSynced: r.recordsSynced,
        durationMs: r.durationMs,
        success: r.success,
        fromCache: r.fromCache,
        errors: r.errors.length > 0 ? r.errors : undefined,
      })),
    });
  } catch (error) {
    console.error('[WalletSync] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
