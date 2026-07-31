/**
 * GET /api/wallets/[id]/read-models
 *
 * Instant dashboard hydrate: financial summary + dimension stats
 * (clients / networks / types / assets aggregates).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import {
  getWalletDimensionStats,
  getWalletFinancialSummary,
  rebuildWalletReadModels,
  type DimensionKind,
} from '@/lib/finance/wallet-read-models';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function resolveWalletId(
  walletIdOrAddress: string,
  userId: string,
  supabase: ReturnType<typeof createServerClient>,
): Promise<string | null> {
  const { data: byId } = await supabase
    .from('wallets')
    .select('id')
    .eq('id', walletIdOrAddress)
    .eq('user_id', userId)
    .maybeSingle();
  if (byId) return byId.id;

  const { data: byAddr } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', userId)
    .ilike('address', walletIdOrAddress)
    .maybeSingle();
  return byAddr?.id ?? null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
      error: authError,
    } = await cookieClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createServerClient();
    const walletId = await resolveWalletId(id, user.id, supabase);
    if (!walletId) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const dimension = searchParams.get('dimension') as DimensionKind | null;
    const rebuild = searchParams.get('rebuild') === 'true';

    if (rebuild) {
      await rebuildWalletReadModels(walletId);
    }

    let summary = await getWalletFinancialSummary(walletId);
    let dimensions = await getWalletDimensionStats(
      walletId,
      dimension || undefined,
    );

    // Cold start: build once if missing
    if (!summary) {
      const rm = await rebuildWalletReadModels(walletId);
      if (rm.ok) {
        summary = await getWalletFinancialSummary(walletId);
        dimensions = await getWalletDimensionStats(walletId, dimension || undefined);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        walletId,
        summary: summary
          ? {
              inflowUsd: Number(summary.inflow_usd) || 0,
              outflowUsd: Number(summary.outflow_usd) || 0,
              netFlowUsd: Number(summary.net_flow_usd) || 0,
              gasFeesUsd: Number(summary.gas_fees_usd) || 0,
              tradingVolumeUsd: Number(summary.trading_volume_usd) || 0,
              txCount: Number(summary.tx_count) || 0,
              pricedCashflowCount: Number(summary.priced_cashflow_count) || 0,
              unpricedCount: Number(summary.unpriced_count) || 0,
              excludedActivityCount: Number(summary.excluded_activity_count) || 0,
              methodology: summary.methodology,
              updatedAt: summary.updated_at,
            }
          : null,
        dimensions: dimensions.map(d => ({
          dimension: d.dimension,
          key: d.dimension_key,
          label: d.label,
          txCount: Number(d.tx_count) || 0,
          volumeUsd: Number(d.volume_usd) || 0,
          inflowUsd: Number(d.inflow_usd) || 0,
          outflowUsd: Number(d.outflow_usd) || 0,
          topToken: d.top_token,
          lastTxDate: d.last_tx_date,
        })),
      },
    });
  } catch (error) {
    console.error('Read-models GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
