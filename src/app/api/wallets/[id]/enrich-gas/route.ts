/**
 * POST /api/wallets/[id]/enrich-gas
 *
 * Backfill gas_fee_eth from Alchemy receipts for existing txs, then rebuild read models.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { backfillWalletGasFees } from '@/lib/alchemy/backfill-gas';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
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
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const result = await backfillWalletGasFees(wallet.id);
    return NextResponse.json({ success: result.ok, data: result });
  } catch (error) {
    console.error('Enrich-gas POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
