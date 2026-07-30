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
import { getSyncEngine, releaseStaleSyncLock } from '@/lib/blockchain/sync-engine';
import { enforceWalletTransactionCap } from '@/lib/plans/enforce-tx-cap';
import {
  assertServerEntitlement,
  SubscriptionEntitlementError,
} from '@/lib/plans/entitlements-server';

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

  console.warn(`[WalletSync] Wallet not found with ID: ${walletIdOrAddress}`, err1);
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

    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();

    if (authError || !user) {
      console.error('[WalletSync] Auth error:', authError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    const supabase = createServerClient();

    let entitledPlanId = 'starter';
    try {
      const entitlement = await assertServerEntitlement(user.id, supabase);
      entitledPlanId = entitlement.planId;
    } catch (error) {
      if (error instanceof SubscriptionEntitlementError) {
        return NextResponse.json(
          { error: error.message, code: 'subscription_required' },
          { status: error.status },
        );
      }
      throw error;
    }

    const wallet = await resolveWallet(walletId, user.id, supabase);

    if (!wallet) {
      console.error('[WalletSync] Wallet not found for ID:', walletId, 'user:', user.id);
      return NextResponse.json(
        { error: 'Wallet not found', hint: 'Try removing and re-adding the wallet' },
        { status: 404 },
      );
    }

    const resolvedWalletId = wallet.id;

    if (wallet.is_syncing) {
      const free = await releaseStaleSyncLock(wallet);
      if (!free) {
        return NextResponse.json(
          { error: 'Wallet is already syncing' },
          { status: 409 },
        );
      }
    }

    console.log(`[WalletSync] Starting ${mode} sync for ${wallet.address || wallet.id} (ID: ${resolvedWalletId})`);

    const syncEngine = getSyncEngine();

    const result = mode === 'full'
      ? await syncEngine.fullSync(resolvedWalletId)
      : await syncEngine.incrementalSync(resolvedWalletId);

    // Cap retained history for Free / Starter (newest non-spam only).
    try {
      await enforceWalletTransactionCap(supabase, resolvedWalletId, entitledPlanId);
    } catch (capErr) {
      console.warn('[WalletSync] Transaction cap enforcement skipped:', capErr);
    }

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
