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
import { createServerClient } from '@/lib/supabase/server';
import { getSyncEngine } from '@/lib/blockchain/sync-engine';

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
    const mode = body.mode || 'incremental'; // 'full' or 'incremental'

    const supabase = createServerClient();

    // Get wallet info
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .single();

    if (walletError || !wallet) {
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

    const syncEngine = getSyncEngine();

    // Choose sync mode
    const result = mode === 'full'
      ? await syncEngine.fullSync(walletId)
      : await syncEngine.incrementalSync(walletId);

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
    console.error('Wallet Sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
