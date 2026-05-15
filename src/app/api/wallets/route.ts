/**
 * Wallets API Route
 *
 * GET  - List all wallets for a user
 * POST - Add a new wallet
 * PATCH - Update wallet label
 * DELETE - Remove a wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getSyncEngine } from '@/lib/blockchain/sync-engine';

/**
 * GET /api/wallets
 * List all wallets for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;

    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching wallets:', error);
      return NextResponse.json(
        { error: 'Failed to fetch wallets' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data?.map(w => ({
        id: w.id,
        address: w.address,
        label: w.label,
        lastSyncedBlock: w.last_synced_block,
        lastSyncedAt: w.last_synced_at,
        isSyncing: w.is_syncing,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })) || [],
    });
  } catch (error) {
    console.error('Wallets GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wallets
 * Add a new wallet
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;
    const body = await request.json();
    const { address, label } = body;

    if (!address || !label) {
      return NextResponse.json(
        { error: 'Address and label are required' },
        { status: 400 }
      );
    }

    if (!address.startsWith('0x') || address.length !== 42) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .ilike('address', address)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Wallet already exists' },
        { status: 409 }
      );
    }

    // Check plan limits
    const { count } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Default to pro plan limits (5 wallets)
    const PLAN_LIMITS: Record<string, number> = {
      basic: 1,
      pro: 5,
      enterprise: 100,
    };
    const userPlan = 'pro'; // TODO: Get from user subscription
    const limit = PLAN_LIMITS[userPlan] ?? 1;

    if ((count || 0) >= limit) {
      return NextResponse.json(
        { error: `Wallet limit reached (${limit} wallets for your plan)` },
        { status: 403 }
      );
    }

    // Insert wallet
    const { data, error } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        address: address.toLowerCase(),
        label,
        is_syncing: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting wallet:', error);
      return NextResponse.json(
        { error: 'Failed to add wallet' },
        { status: 500 }
      );
    }

    // Trigger full sync - await it so data is ready when the user sees the dashboard
    try {
      const syncEngine = getSyncEngine();
      const syncResult = await syncEngine.fullSync(data.id);
      console.log('[Wallets] Initial sync completed:', {
        success: syncResult.overallSuccess,
        records: syncResult.totalRecordsSynced,
        durationMs: syncResult.totalDurationMs,
        results: syncResult.results.map(r => ({
          provider: r.provider,
          dataType: r.dataType,
          recordsSynced: r.recordsSynced,
          success: r.success,
          errors: r.errors,
        })),
      });
    } catch (syncInitError) {
      console.error('[Wallets] Initial sync error:', syncInitError);
      // Don't fail the wallet creation even if sync fails
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        address: data.address,
        label: data.label,
        lastSyncedBlock: data.last_synced_block,
        lastSyncedAt: data.last_synced_at,
        isSyncing: data.is_syncing,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    console.error('Wallets POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/wallets
 * Update wallet label
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;
    const body = await request.json();
    const { id, label } = body;

    if (!id || !label) {
      return NextResponse.json(
        { error: 'Wallet ID and label are required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('wallets')
      .update({ label })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating wallet:', error);
      return NextResponse.json(
        { error: 'Failed to update wallet' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wallets PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/wallets
 * Remove a wallet
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Wallet ID is required' },
        { status: 400 }
      );
    }

    // Delete wallet (cascades to transactions)
    const { error } = await supabase
      .from('wallets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting wallet:', error);
      return NextResponse.json(
        { error: 'Failed to delete wallet' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wallets DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
