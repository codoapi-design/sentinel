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

export const maxDuration = 300; // Full history pagination can exceed 60s on active wallets

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Resolve a wallet ID or address to a valid DB wallet record
 * Handles both UUID IDs and address-based lookups
 */
async function resolveWallet(
  walletIdOrAddress: string,
  userId: string,
  supabase: ReturnType<typeof createServerClient>
) {
  // First try: direct UUID lookup
  const { data: walletById, error: err1 } = await supabase
    .from('wallets')
    .select('*')
    .eq('id', walletIdOrAddress)
    .eq('user_id', userId)
    .single();

  if (walletById) return walletById;

  // Second try: if it looks like an address (0x...), look up by address
  if (walletIdOrAddress.startsWith('0x') && walletIdOrAddress.length === 42) {
    const { data: walletByAddr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .ilike('address', walletIdOrAddress)
      .single();

    if (walletByAddr) return walletByAddr;
  }

  // Third try: it might be a stale client-generated ID (wallet-XXXXX)
  // In this case, we can't find it directly - but we can check if any wallet
  // belongs to this user (they may have created one but the ID wasn't synced)
  console.warn(`[WalletSync] Wallet not found with ID: ${walletIdOrAddress}`);

  return null;
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

    // Get wallet info - with address-based fallback resolution
    const wallet = await resolveWallet(walletId, user.id, supabase);

    if (!wallet) {
      console.error('[WalletSync] Wallet not found for ID:', walletId, 'user:', user.id);
      return NextResponse.json(
        { error: 'Wallet not found', hint: 'Try removing and re-adding the wallet' },
        { status: 404 },
      );
    }

    // Use the resolved wallet's actual DB ID (in case it was looked up by address)
    const resolvedWalletId = wallet.id;

    if (wallet.is_syncing) {
      return NextResponse.json(
        { error: 'Wallet is already syncing' },
        { status: 409 },
      );
    }

    console.log(`[WalletSync] Starting ${mode} sync for ${wallet.address || wallet.id} (ID: ${resolvedWalletId})`);

    const syncEngine = getSyncEngine();

    // Choose sync mode
    const result = mode === 'full'
      ? await syncEngine.fullSync(resolvedWalletId)
      : await syncEngine.incrementalSync(resolvedWalletId);

    console.log(`[WalletSync] ${mode} sync completed for ${wallet.address || wallet.id}:`, {
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
      /** True when DB contents changed — UI should re-read from Supabase. */
      changed: result.changed ?? result.totalRecordsSynced > 0,
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
