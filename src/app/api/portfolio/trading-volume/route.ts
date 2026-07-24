/**
 * GET /api/portfolio/trading-volume?walletId=
 *
 * Full trading-volume detail: summary, daily history, by-token breakdown, recent trades.
 * Uses all synced trade-classified txs (not limited to since connected).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { computeTradingVolumeDetail } from '@/lib/finance/trading-volume';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
      error: authError,
    } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('walletId');

    let wallet: { id: string } | null = null;
    if (walletId) {
      const { data, error } = await supabase
        .from('wallets')
        .select('id')
        .eq('id', walletId)
        .eq('user_id', user.id)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
      }
      wallet = data;
    } else {
      const { data, error } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json({ error: 'No wallets found' }, { status: 404 });
      }
      wallet = data;
    }

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select(
        'id, tx_hash, type, direction, value_usd, value_eth, method_id, method_name, protocol, to_addr, from_addr, timestamp, date, network, token_symbol, token_address, counterparty, counterparty_label',
      )
      .eq('wallet_id', wallet.id);

    if (txError) {
      console.error('[TradingVolume API] TX query failed:', txError);
      return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 });
    }

    const detail = computeTradingVolumeDetail(transactions || []);

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    console.error('[TradingVolume API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
