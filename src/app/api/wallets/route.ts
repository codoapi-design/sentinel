/**
 * Wallets API Route
 *
 * GET  - List all wallets for a user
 * POST - Add a new wallet (multi-address: EVM / Solana / Tron / Bitcoin)
 * PATCH - Update wallet label
 * DELETE - Remove a wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { getSyncEngine } from '@/lib/blockchain/sync-engine';
import { tryCloneWalletFromExistingAddress } from '@/lib/blockchain/clone-wallet-data';
import {
  primaryDisplayAddress,
  validateWalletAddresses,
} from '@/lib/wallet/address-validation';
import {
  assertAddressesAllowedForPlan,
  assertPlanAddressRequirements,
  filterAddressesByPlan,
  normalizePlanId,
} from '@/lib/plans/address-families';
import {
  assertServerEntitlement,
  SubscriptionEntitlementError,
} from '@/lib/plans/entitlements-server';
import { getWalletLimit } from '@/lib/plans/limits';
import { resolveWalletPlanId } from '@/lib/plans/resolve-plan';

async function resolveUserPlan(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<string> {
  // subscriptions table is authoritative — never trust profile.plan alone.
  return resolveWalletPlanId(supabase, userId);
}

function mapWalletRow(w: {
  id: string;
  address: string | null;
  solana_address?: string | null;
  tron_address?: string | null;
  bitcoin_address?: string | null;
  label: string;
  last_synced_block: number | null;
  last_synced_at: string | null;
  is_syncing: boolean;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: w.id,
    address: w.address,
    solanaAddress: w.solana_address ?? null,
    tronAddress: w.tron_address ?? null,
    bitcoinAddress: w.bitcoin_address ?? null,
    displayAddress: primaryDisplayAddress(w),
    label: w.label,
    lastSyncedBlock: w.last_synced_block,
    lastSyncedAt: w.last_synced_at,
    isSyncing: w.is_syncing,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

/**
 * GET /api/wallets
 */
export async function GET(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching wallets:', error);
      return NextResponse.json({ error: 'Failed to fetch wallets' }, { status: 500 });
    }

    const plan = await resolveUserPlan(supabase, userId);

    return NextResponse.json({
      success: true,
      plan,
      data: (data || []).map(mapWalletRow),
    });
  } catch (error) {
    console.error('Wallets GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/wallets
 */
export async function POST(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;
    const supabase = createServerClient();

    const body = await request.json();
    const validated = validateWalletAddresses(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    let userPlan = await resolveUserPlan(supabase, userId);
    try {
      const entitlement = await assertServerEntitlement(userId, supabase);
      userPlan = normalizePlanId(entitlement.planId);
    } catch (error) {
      if (error instanceof SubscriptionEntitlementError) {
        return NextResponse.json(
          { error: error.message, code: 'subscription_required' },
          { status: error.status },
        );
      }
      throw error;
    }

    const planGate = assertAddressesAllowedForPlan(userPlan, validated.data);
    if (!planGate.ok) {
      return NextResponse.json({ error: planGate.error }, { status: 403 });
    }

    const filtered = filterAddressesByPlan(userPlan, validated.data);
    const req = assertPlanAddressRequirements(userPlan, filtered);
    if (!req.ok) {
      return NextResponse.json({ error: req.error }, { status: 400 });
    }

    const { label } = validated.data;
    const evmAddress = filtered.evmAddress;
    const solanaAddress = filtered.solanaAddress;
    const tronAddress = filtered.tronAddress;
    const bitcoinAddress = filtered.bitcoinAddress;

    // Duplicate checks per family
    if (evmAddress) {
      const { data: existing } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .ilike('address', evmAddress)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: 'EVM address already added' }, { status: 409 });
      }
    }
    if (solanaAddress) {
      const { data: existing } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('solana_address', solanaAddress)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: 'Solana address already added' }, { status: 409 });
      }
    }
    if (tronAddress) {
      const { data: existing } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('tron_address', tronAddress)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: 'Tron address already added' }, { status: 409 });
      }
    }
    if (bitcoinAddress) {
      const { data: existing } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('bitcoin_address', bitcoinAddress)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: 'Bitcoin address already added' }, { status: 409 });
      }
    }

    const { count } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const limit = getWalletLimit(userPlan);

    if (Number.isFinite(limit) && (count || 0) >= limit) {
      return NextResponse.json(
        { error: `Wallet limit reached (${limit} wallets for your plan)` },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        address: evmAddress,
        solana_address: solanaAddress,
        tron_address: tronAddress,
        bitcoin_address: bitcoinAddress,
        label,
        is_syncing: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting wallet:', error);
      return NextResponse.json(
        { error: 'Failed to add wallet', details: error.message },
        { status: 500 },
      );
    }

    // If this address was already synced for any user, clone DB history first
    // (no Alchemy), then only pull incremental updates.
    let cloneResult = {
      cloned: false,
      sourceWalletId: null as string | null,
      transactionsCopied: 0,
      positionsCopied: 0,
      lastSyncedBlock: null as number | null,
      lastSyncedAt: null as string | null,
    };
    try {
      cloneResult = await tryCloneWalletFromExistingAddress({
        evmAddress,
        targetWalletId: data.id,
        targetUserId: userId,
      });
    } catch (cloneErr) {
      console.warn('[Wallets] Clone-from-existing skipped:', cloneErr);
    }

    // Re-read wallet so response includes cloned cursors.
    const { data: fresh } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', data.id)
      .single();
    const walletRow = fresh || data;

    if (cloneResult.cloned && (cloneResult.lastSyncedBlock || 0) > 0) {
      // Incremental Alchemy only — history already in DB.
      getSyncEngine()
        .incrementalSync(data.id)
        .then(syncResult => {
          console.log('[Wallets] Background incremental sync (after clone) completed:', {
            success: syncResult.overallSuccess,
            records: syncResult.totalRecordsSynced,
            durationMs: syncResult.totalDurationMs,
            clonedFrom: cloneResult.sourceWalletId,
          });
        })
        .catch(syncInitError => {
          console.error('[Wallets] Background incremental sync error:', syncInitError);
        });
    } else {
      // First-time address — full historical Alchemy sync.
      getSyncEngine()
        .fullSync(data.id)
        .then(syncResult => {
          console.log('[Wallets] Background full sync completed:', {
            success: syncResult.overallSuccess,
            records: syncResult.totalRecordsSynced,
            durationMs: syncResult.totalDurationMs,
          });
        })
        .catch(syncInitError => {
          console.error('[Wallets] Background sync error:', syncInitError);
        });
    }

    return NextResponse.json({
      success: true,
      data: mapWalletRow(walletRow),
      hydratedFromCache: cloneResult.cloned,
      clone: cloneResult.cloned
        ? {
            sourceWalletId: cloneResult.sourceWalletId,
            transactionsCopied: cloneResult.transactionsCopied,
            positionsCopied: cloneResult.positionsCopied,
          }
        : null,
    });
  } catch (error) {
    console.error('Wallets POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/wallets
 */
export async function PATCH(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;
    const supabase = createServerClient();

    const body = await request.json();
    const { id, label } = body;

    if (!id || !label) {
      return NextResponse.json(
        { error: 'Wallet ID and label are required' },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from('wallets')
      .update({ label })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating wallet:', error);
      return NextResponse.json({ error: 'Failed to update wallet' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wallets PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/wallets
 */
export async function DELETE(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;
    const supabase = createServerClient();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Wallet ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('wallets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting wallet:', error);
      return NextResponse.json({ error: 'Failed to delete wallet' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wallets DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
