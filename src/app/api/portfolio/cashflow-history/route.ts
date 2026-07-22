/**
 * GET /api/portfolio/cashflow-history
 *
 * Cumulative cash-flow series from classified transactions (not market revaluation).
 * Query: walletId (optional), days (1|7|30|90|365|0=all), metric (revenue|expenses|netFlow|gas)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import {
  buildCashflowHistory,
  parseCashflowMetric,
} from '@/lib/finance/cashflow-history';
import { getPricingService } from '@/lib/pricing/service';

export const maxDuration = 60;

function parseDays(raw: string | null): number {
  if (!raw) return 30;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 30;
  return Math.min(Math.floor(n), 3650);
}

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

    const { searchParams } = new URL(request.url);
    const walletIdParam = searchParams.get('walletId');
    const days = parseDays(searchParams.get('days'));
    const metric = parseCashflowMetric(searchParams.get('metric'));
    if (!metric) {
      return NextResponse.json(
        { error: 'Invalid metric. Use revenue|expenses|netFlow|gas' },
        { status: 400 },
      );
    }

    const supabase = createServerClient();

    let wallet: { id: string; user_id: string } | null = null;
    if (walletIdParam) {
      const { data } = await supabase
        .from('wallets')
        .select('id, user_id')
        .eq('id', walletIdParam)
        .eq('user_id', user.id)
        .maybeSingle();
      wallet = data;
    } else {
      const { data } = await supabase
        .from('wallets')
        .select('id, user_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      wallet = data;
    }

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select(
        'type, direction, value_usd, value_eth, gas_fee_eth, method_id, method_name, protocol, to_addr, timestamp, date',
      )
      .eq('wallet_id', wallet.id);

    if (txError) {
      console.error('[Cashflow History] TX query failed:', txError);
      return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 });
    }

    let ethPriceUsd = 0;
    try {
      ethPriceUsd = await getPricingService().getCurrentNativePriceUsd(1);
    } catch {
      ethPriceUsd = 0;
    }

    const result = buildCashflowHistory(transactions || [], {
      metric,
      days,
      ethPriceUsd,
    });

    return NextResponse.json({
      success: true,
      data: {
        walletId: wallet.id,
        days: result.days,
        metric: result.metric,
        bucket: result.bucket,
        points: result.points,
        periodTotal: result.periodTotal,
        contributingTxCount: result.contributingTxCount,
        methodology: result.methodology,
        ethPriceUsd,
      },
    });
  } catch (error) {
    console.error('[Cashflow History]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
