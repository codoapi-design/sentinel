/**
 * GET /api/portfolio/history
 *
 * Real portfolio performance series for the chart.
 * Query: walletId (optional), days (1|7|30|90|365|0=all)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import {
  buildMarketRevaluedHistory,
  filterPointsByDays,
  mergeHistorySeries,
  methodologyFor,
  type HistoryHolding,
  type PortfolioHistoryPoint,
} from '@/lib/finance/portfolio-history';
import { listPortfolioSnapshots } from '@/lib/finance/portfolio-snapshots';

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

    const { data: positions } = await supabase
      .from('asset_positions')
      .select('token_symbol, token_address, balance, value_usd, chain_id, network')
      .eq('wallet_id', wallet.id)
      .gt('value_usd', 0)
      .order('value_usd', { ascending: false });

    const { data: defi } = await supabase
      .from('defi_positions')
      .select('net_value_usd')
      .eq('wallet_id', wallet.id);

    const holdings: HistoryHolding[] = (positions || []).map(p => ({
      symbol: p.token_symbol || 'TOKEN',
      address: p.token_address || '',
      balance: Number(p.balance) || 0,
      valueUsd: Number(p.value_usd) || 0,
      chainId: p.chain_id || 1,
      chain: p.network || undefined,
    }));

    const tokenValueUsd = holdings.reduce((s, h) => s + h.valueUsd, 0);
    const defiValueUsd = (defi || []).reduce((s, d) => s + (Number(d.net_value_usd) || 0), 0);
    const liveTotalUsd = tokenValueUsd + defiValueUsd;

    const fromDate =
      days > 0
        ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
        : undefined;

    const snapshotRows = await listPortfolioSnapshots(wallet.id, fromDate);
    const snapshots: PortfolioHistoryPoint[] = snapshotRows.map(r => ({
      date: r.date,
      value: r.value,
      fromSnapshot: true,
    }));

    // Need enough market days to fill gaps before first snapshot
    const marketDays = days > 0 ? days : 365;
    const market = await buildMarketRevaluedHistory(holdings, marketDays, liveTotalUsd);

    // Fold DeFi into last point only for market series (no historical DeFi curve without API)
    // Already included in liveTotalUsd anchor.

    const merged = mergeHistorySeries(market.points, snapshots);
    const points = filterPointsByDays(merged.points, days);

    // Re-anchor last point to live total
    if (points.length > 0 && liveTotalUsd > 0) {
      points[points.length - 1] = {
        ...points[points.length - 1],
        value: Math.round(liveTotalUsd * 100) / 100,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        walletId: wallet.id,
        days,
        points,
        source: merged.source,
        methodology: methodologyFor(
          merged.source,
          market.tokensPriced,
          market.tokensSkipped,
        ),
        coverageUsd: market.coverageUsd,
        totalValueUsd: Math.round(liveTotalUsd * 100) / 100,
        tokensPriced: market.tokensPriced,
        tokensSkipped: market.tokensSkipped,
        snapshotCount: snapshots.length,
      },
    });
  } catch (error) {
    console.error('[Portfolio History]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
